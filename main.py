
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import db_service as db_service
import asyncio
from functools import wraps
import json
import sys
import tempfile
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
from typing import Optional
from project_scanner import scan_project_files

app = FastAPI(title="Multi-Agent Time-Travel Debugger API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

class SessionStartPayload(BaseModel):
    session_id: str
    credit_mode: str = "standard"
    parent_session_id: str = None
    forked_from_step: int = None


class StepSnapshotPayload(BaseModel):
    event_id: str
    session_id: str
    step_number: int
    agent_name: str
    status: str
    tokens_used: int
    memory_state: dict


class ForkSessionPayload(BaseModel):
    parent_session_id: str
    new_session_id: str
    fork_step: int


class ExecutionDeltaPayload(BaseModel):
    delta_id: str
    original_session_id: str
    replay_session_id: str
    state_changed: dict
    tokens_saved: int
    time_saved_ms: int
    llm_fix_summary: str


# ==========================================
# AGENT DECORATOR (Auto-Checkpointing)
# ==========================================

def trace_step(
    session_id: str,
    step_number: int,
    agent_name: str,
    tokens_used: int = 150
):
    """Decorator to automatically save agent execution snapshots."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            event_id = f"{session_id}_step_{step_number}"

            try:
                result = (
                    await func(*args, **kwargs)
                    if asyncio.iscoroutinefunction(func)
                    else func(*args, **kwargs)
                )

                await db_service.save_snapshot(
                    event_id=event_id,
                    session_id=session_id,
                    step_number=step_number,
                    agent_name=agent_name,
                    status="PASSED",
                    tokens_used=tokens_used,
                    memory_state={"output": str(result)}
                )

                return result

            except Exception as e:
                await db_service.save_snapshot(
                    event_id=event_id,
                    session_id=session_id,
                    step_number=step_number,
                    agent_name=agent_name,
                    status="FAILED",
                    tokens_used=tokens_used,
                    memory_state={"error": str(e)}
                )
                raise

        return wrapper

    return decorator


# ==========================================
# SESSION AND DEBUGGING API ENDPOINTS
# ==========================================

@app.post("/api/sessions/start")
async def start_session(payload: SessionStartPayload):
    try:
        await db_service.create_session(
            session_id=payload.session_id,
            parent_session_id=payload.parent_session_id,
            forked_from_step=payload.forked_from_step,
            credit_mode=payload.credit_mode
        )
        return {
            "status": "success",
            "session_id": payload.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/sessions")
async def list_sessions():
    try:
        sessions = await db_service.list_all_sessions(limit=20)

        for session in sessions:
            session["_id"] = str(session["_id"])

        return {"sessions": sessions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}")
async def get_single_session(session_id: str):
    session = await db_service.get_session(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session["_id"] = str(session["_id"])
    return session


@app.get("/api/sessions/{session_id}/timeline")
async def get_timeline(session_id: str):
    snapshots = await db_service.get_session_timeline(session_id)

    for snapshot in snapshots:
        snapshot["_id"] = str(snapshot["_id"])

    return {
        "session_id": session_id,
        "timeline": snapshots
    }


@app.post("/api/sessions/fork")
async def fork_session(payload: ForkSessionPayload):
    try:
        await db_service.fork_session_from_step(
            parent_session_id=payload.parent_session_id,
            new_session_id=payload.new_session_id,
            fork_step=payload.fork_step
        )

        return {
            "status": "success",
            "forked_session_id": payload.new_session_id
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/snapshots/save")
async def save_agent_snapshot(payload: StepSnapshotPayload):
    try:
        await db_service.save_snapshot(
            event_id=payload.event_id,
            session_id=payload.session_id,
            step_number=payload.step_number,
            agent_name=payload.agent_name,
            status=payload.status,
            tokens_used=payload.tokens_used,
            memory_state=payload.memory_state
        )

        return {
            "status": "success",
            "event_id": payload.event_id
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/deltas/save")
async def save_delta(payload: ExecutionDeltaPayload):
    try:
        await db_service.save_execution_delta(
            delta_id=payload.delta_id,
            original_session_id=payload.original_session_id,
            replay_session_id=payload.replay_session_id,
            state_changed=payload.state_changed,
            tokens_saved=payload.tokens_saved,
            time_saved_ms=payload.time_saved_ms,
            llm_fix_summary=payload.llm_fix_summary
        )

        return {
            "status": "success",
            "delta_id": payload.delta_id
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/deltas/{original_session_id}")
async def get_deltas_for_session(original_session_id: str):
    deltas = await db_service.get_deltas_for_original_session(
        original_session_id
    )

    for delta in deltas:
        delta["_id"] = str(delta["_id"])

    return {
        "original_session_id": original_session_id,
        "deltas": deltas
    }


# ==========================================
# WEBSOCKET LIVE STREAM
# ==========================================

@app.websocket("/ws/live-stream/{session_id}")
async def websocket_live_stream(
    websocket: WebSocket,
    session_id: str
):
    await websocket.accept()
    print(f"Frontend connected to live stream for session: {session_id}")

    try:
        pipeline = [
            {"$match": {"fullDocument.session_id": session_id}}
        ]

        async with db_service.db.state_snapshots.watch(pipeline) as stream:
            async for change in stream:
                document = change.get("fullDocument")

                if document:
                    document["_id"] = str(document["_id"])
                    await websocket.send_json(document)

    except Exception as e:
        print(f"WebSocket disconnected: {e}")

    finally:
        await websocket.close()


# ==========================================
# AGENTTRACE CLI COMPATIBILITY ROUTES
# ==========================================

class CodeSnapshotPayload(BaseModel):
    session_id: str
    file: str
    source: str
    sha256: str
    captured_at: str


class FinishSessionPayload(BaseModel):
    status: str
    exit_code: Optional[int] = None
    duration_ms: int = 0
    stdout: str = ""
    stderr: str = ""
    exception_type: Optional[str] = None
    exception_message: Optional[str] = None
    traceback: Optional[str] = None


@app.post("/api/code-snapshots/save")
async def save_code_snapshot(payload: CodeSnapshotPayload):
    try:
        session = await db_service.get_session(payload.session_id)

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )

        await db_service.db.code_snapshots.update_one(
            {"session_id": payload.session_id},
            {
                "$set": {
                    **payload.model_dump(),
                    "created_at": datetime.now(timezone.utc)
                }
            },
            upsert=True
        )

        return {
            "saved": True,
            "session_id": payload.session_id
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sessions/{session_id}/finish")
async def finish_session(
    session_id: str,
    payload: FinishSessionPayload
):
    try:
        session = await db_service.get_session(session_id)

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )

        await db_service.db.agent_sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    **payload.model_dump(),
                    "status": payload.status.upper(),
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        return {
            "session_id": session_id,
            "status": payload.status.upper()
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# PROJECT SCANNING SCHEMAS
# ==========================================

class ProjectFileInput(BaseModel):
    path: str
    content: str


class ProjectScanPayload(BaseModel):
    project_name: str
    files: list[ProjectFileInput] = Field(max_length=500)


# ==========================================
# SCAN AND SAVE PROJECT
# ==========================================

@app.post("/api/projects/scan")
async def scan_and_save_project(payload: ProjectScanPayload):
    """Scan uploaded files and save their source as a MongoDB snapshot."""

    project_id = str(uuid4())
    snapshot_id = str(uuid4())
    now = datetime.now(timezone.utc)

    try:
        uploaded_files = [
            item.model_dump() for item in payload.files
        ]

        scan = scan_project_files(uploaded_files)

        source_by_path = {
            item["path"].replace("\\", "/"): item["content"]
            for item in uploaded_files
        }

        await db_service.ensure_project_indexes()

        await db_service.db.projects.insert_one({
            "project_id": project_id,
            "project_name": payload.project_name,
            "created_at": now,
            "latest_snapshot_id": snapshot_id,
            "file_count": scan["file_count"],
            "python_file_count": scan["python_file_count"],
            "entry_point_candidates": scan["entry_point_candidates"],
        })

        await db_service.db.project_snapshots.insert_one({
            "snapshot_id": snapshot_id,
            "project_id": project_id,
            "project_name": payload.project_name,
            "created_at": now,
            "file_count": scan["file_count"],
            "python_file_count": scan["python_file_count"],
            "entry_point_candidates": scan["entry_point_candidates"],
            "status": "SAVING",
        })

        saved_docs = []

        for record in scan["files"]:
            path = record["path"]
            content = source_by_path.get(path)

            if content is None:
                raise ValueError(
                    f"Source content missing for scanned file: {path}"
                )

            saved_docs.append({
                "project_id": project_id,
                "snapshot_id": snapshot_id,
                **record,
                "content": content,
                "indexed_at": now,
            })

        if saved_docs:
            await db_service.db.project_files.insert_many(
                saved_docs,
                ordered=True
            )

        saved_count = await db_service.db.project_files.count_documents({
            "project_id": project_id,
            "snapshot_id": snapshot_id,
        })

        if saved_count != scan["file_count"]:
            raise RuntimeError(
                f"Expected {scan['file_count']} files, "
                f"but saved {saved_count}."
            )

        await db_service.db.project_snapshots.update_one(
            {"snapshot_id": snapshot_id},
            {"$set": {"status": "SAVED"}}
        )

        return {
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "project_name": payload.project_name,
            "snapshot_status": "SAVED",
            "saved_file_count": saved_count,
            **scan,
        }

    except ValueError as exc:
        await db_service.db.project_files.delete_many(
            {"snapshot_id": snapshot_id}
        )
        await db_service.db.project_snapshots.delete_one(
            {"snapshot_id": snapshot_id}
        )
        await db_service.db.projects.delete_one(
            {"project_id": project_id}
        )

        raise HTTPException(status_code=400, detail=str(exc))

    except Exception as exc:
        await db_service.db.project_files.delete_many(
            {"snapshot_id": snapshot_id}
        )
        await db_service.db.project_snapshots.delete_one(
            {"snapshot_id": snapshot_id}
        )
        await db_service.db.projects.delete_one(
            {"project_id": project_id}
        )

        raise HTTPException(
            status_code=500,
            detail=f"Project snapshot save failed: {exc}"
        )


# ==========================================
# LIST SAVED PROJECTS
# ==========================================

@app.get("/api/projects")
async def list_projects():
    """Return uploaded projects for the History sidebar."""

    try:
        projects = await db_service.db.projects.find(
            {},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=200)

        return {"projects": projects}

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load projects: {exc}"
        )


# ==========================================
# GET A PROJECT BY ID
# ==========================================

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """
    Return saved project metadata and its latest snapshot files.
    This endpoint is used when reopening a project from History.
    """

    project = await db_service.db.projects.find_one(
        {"project_id": project_id},
        {"_id": 0}
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    snapshot_id = project.get("latest_snapshot_id")
    files = []

    if snapshot_id:
        files = await db_service.db.project_files.find(
            {
                "project_id": project_id,
                "snapshot_id": snapshot_id
            },
            {"_id": 0}
        ).sort("path", 1).to_list(length=500)

    return {
        "project": project,
        "files": files
    }


# ==========================================
# LIST PROJECT SNAPSHOTS
# ==========================================

@app.get("/api/projects/{project_id}/snapshots")
async def list_project_snapshots(project_id: str):
    project = await db_service.db.projects.find_one(
        {"project_id": project_id},
        {"_id": 0, "project_id": 1}
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    snapshots = await db_service.db.project_snapshots.find(
        {"project_id": project_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)

    return {
        "project_id": project_id,
        "snapshots": snapshots
    }


# ==========================================
# GET A SPECIFIC PROJECT SNAPSHOT
# ==========================================

@app.get("/api/projects/{project_id}/snapshots/{snapshot_id}")
async def get_project_snapshot(
    project_id: str,
    snapshot_id: str
):
    snapshot = await db_service.db.project_snapshots.find_one(
        {
            "project_id": project_id,
            "snapshot_id": snapshot_id
        },
        {"_id": 0}
    )

    if not snapshot:
        raise HTTPException(
            status_code=404,
            detail="Project snapshot not found"
        )

    files = await db_service.db.project_files.find(
        {
            "project_id": project_id,
            "snapshot_id": snapshot_id
        },
        {"_id": 0}
    ).sort("path", 1).to_list(length=500)

    return {
        "snapshot": snapshot,
        "files": files
    }
