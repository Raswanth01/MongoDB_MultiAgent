from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import db_service as db_service
import asyncio
from functools import wraps

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

def trace_step(session_id: str, step_number: int, agent_name: str, tokens_used: int = 150):
    """Decorator to automatically wrap agent execution steps and save state snapshots."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            event_id = f"{session_id}_step_{step_number}"
            try:
                # Run the agent action logic
                result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
                
                # Automatically save successful checkpoint
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
                # Save failed checkpoint for debugging
                await db_service.save_snapshot(
                    event_id=event_id,
                    session_id=session_id,
                    step_number=step_number,
                    agent_name=agent_name,
                    status="FAILED",
                    tokens_used=tokens_used,
                    memory_state={"error": str(e)}
                )
                raise e
        return wrapper
    return decorator


# ==========================================
# API ENDPORTS
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
        return {"status": "success", "session_id": payload.session_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/sessions")
async def list_sessions():
    try:
        sessions = await db_service.list_all_sessions(limit=20)
        for s in sessions:
            s["_id"] = str(s["_id"])
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
    for s in snapshots:
        s["_id"] = str(s["_id"])
    return {"session_id": session_id, "timeline": snapshots}

@app.post("/api/sessions/fork")
async def fork_session(payload: ForkSessionPayload):
    try:
        await db_service.fork_session_from_step(
            parent_session_id=payload.parent_session_id,
            new_session_id=payload.new_session_id,
            fork_step=payload.fork_step
        )
        return {"status": "success", "forked_session_id": payload.new_session_id}
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
        return {"status": "success", "event_id": payload.event_id}
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
        return {"status": "success", "delta_id": payload.delta_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/deltas/{original_session_id}")
async def get_deltas_for_session(original_session_id: str):
    deltas = await db_service.get_deltas_for_original_session(original_session_id)
    for d in deltas:
        d["_id"] = str(d["_id"])
    return {"original_session_id": original_session_id, "deltas": deltas}

# WebSocket Change Stream for real-time React UI timeline streaming
@app.websocket("/ws/live-stream/{session_id}")
async def websocket_live_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"Frontend connected to live stream for session: {session_id}")
    
    try:
        pipeline = [{"$match": {"fullDocument.session_id": session_id}}]
        async with db_service.db.state_snapshots.watch(pipeline) as stream:
            async for change in stream:
                doc = change.get("fullDocument")
                if doc:
                    doc["_id"] = str(doc["_id"])
                    await websocket.send_json(doc)
    except Exception as e:
        print(f"WebSocket disconnected: {e}")
    finally:
        await websocket.close()


# ==========================================
# AGENTTRACE CLI COMPATIBILITY ROUTES
# ==========================================

from datetime import datetime, timezone
from typing import Optional


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
        # Ensure the session exists before saving its source
        session = await db_service.get_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

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

        return {"saved": True, "session_id": payload.session_id}

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
            raise HTTPException(status_code=404, detail="Session not found")

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
