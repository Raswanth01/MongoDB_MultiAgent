import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from pymongo import ASCENDING

# Connect to MongoDB
MONGO_URI = "mongodb://localhost:27017/?directConnection=true"
client = AsyncIOMotorClient(MONGO_URI)
db = client["agent_debugger"]


def utc_now():
    return datetime.now(timezone.utc)


# ==========================================
# 1. AGENT_SESSIONS OPERATIONS
# ==========================================

async def create_session(
    session_id: str,
    parent_session_id: str = None,
    forked_from_step: int = None,
    credit_mode: str = "standard"
):
    session_doc = {
        "session_id": session_id,
        "parent_session_id": parent_session_id,
        "forked_from_step": forked_from_step,
        "status": "RUNNING",
        "total_tokens_used": 0,
        "credit_mode": credit_mode,
        "created_at": utc_now()
    }

    await db.agent_sessions.insert_one(session_doc)
    print(f"Session {session_id} created.")


async def get_session(session_id: str):
    return await db.agent_sessions.find_one(
        {"session_id": session_id}
    )


async def list_all_sessions(limit: int = 20):
    cursor = (
        db.agent_sessions.find({})
        .sort("created_at", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def update_session_status(
    session_id: str,
    status: str,
    tokens_added: int = 0
):
    await db.agent_sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {"status": status},
            "$inc": {"total_tokens_used": tokens_added}
        }
    )


async def delete_session(session_id: str):
    await db.agent_sessions.delete_one(
        {"session_id": session_id}
    )
    await db.state_snapshots.delete_many(
        {"session_id": session_id}
    )
    print(f"Session {session_id} and its snapshots deleted.")


# ==========================================
# 2. STATE_SNAPSHOTS OPERATIONS
# ==========================================

async def save_snapshot(
    event_id: str,
    session_id: str,
    step_number: int,
    agent_name: str,
    status: str,
    tokens_used: int,
    memory_state: dict
):
    snapshot_doc = {
        "event_id": event_id,
        "session_id": session_id,
        "step_number": step_number,
        "agent_name": agent_name,
        "status": status,
        "tokens_used": tokens_used,
        "memory_state": memory_state,
        "timestamp": utc_now()
    }

    await db.state_snapshots.update_one(
        {"event_id": event_id},
        {"$set": snapshot_doc},
        upsert=True
    )

    print(f"Snapshot logged: {event_id} for session {session_id}")


async def get_session_timeline(session_id: str):
    cursor = (
        db.state_snapshots.find({"session_id": session_id})
        .sort("step_number", 1)
    )
    return await cursor.to_list(length=100)


# ==========================================
# 3. EXECUTION_DELTAS OPERATIONS
# ==========================================

async def save_execution_delta(
    delta_id: str,
    original_session_id: str,
    replay_session_id: str,
    state_changed: dict,
    tokens_saved: int,
    time_saved_ms: int,
    llm_fix_summary: str
):
    delta_doc = {
        "delta_id": delta_id,
        "original_session_id": original_session_id,
        "replay_session_id": replay_session_id,
        "state_changed": state_changed,
        "tokens_saved": tokens_saved,
        "time_saved_ms": time_saved_ms,
        "llm_fix_summary": llm_fix_summary,
        "created_at": utc_now()
    }

    await db.execution_deltas.update_one(
        {"delta_id": delta_id},
        {"$set": delta_doc},
        upsert=True
    )

    print(f"Execution delta {delta_id} saved successfully.")


async def get_deltas_for_original_session(original_session_id: str):
    cursor = db.execution_deltas.find(
        {"original_session_id": original_session_id}
    )
    return await cursor.to_list(length=50)


# ==========================================
# 4. TIME-TRAVEL FORKING ENGINE
# ==========================================

async def fork_session_from_step(
    parent_session_id: str,
    new_session_id: str,
    fork_step: int
):
    await create_session(
        session_id=new_session_id,
        parent_session_id=parent_session_id,
        forked_from_step=fork_step
    )

    cursor = (
        db.state_snapshots.find({
            "session_id": parent_session_id,
            "step_number": {"$lte": fork_step}
        })
        .sort("step_number", 1)
    )

    parent_snapshots = await cursor.to_list(length=100)

    for snap in parent_snapshots:
        new_event_id = f"{new_session_id}_step_{snap['step_number']}"

        await save_snapshot(
            event_id=new_event_id,
            session_id=new_session_id,
            step_number=snap["step_number"],
            agent_name=snap["agent_name"],
            status=snap["status"],
            tokens_used=snap["tokens_used"],
            memory_state=snap["memory_state"]
        )

    print(
        f"Successfully forked {parent_session_id} into "
        f"{new_session_id} at step {fork_step}"
    )


# ==========================================
# 5. PROJECT SNAPSHOT INDEXES
# ==========================================

async def ensure_project_indexes():
    """
    Create indexes for project storage.

    The partial index ignores legacy project_files documents
    that don't have a string snapshot_id.
    """

    await db.projects.create_index(
        [("project_id", ASCENDING)],
        unique=True
    )

    await db.project_snapshots.create_index(
        [("snapshot_id", ASCENDING)],
        unique=True
    )

    await db.project_files.create_index(
        [
            ("snapshot_id", ASCENDING),
            ("path", ASCENDING)
        ],
        unique=True,
        partialFilterExpression={
            "snapshot_id": {"$type": "string"}
        }
    )

    print("Project snapshot indexes ensured.")


# ==========================================
# 6. PROJECT SNAPSHOT OPERATIONS
# ==========================================

async def save_project_snapshot(
    project_id: str,
    snapshot_id: str,
    project_name: str,
    scan: dict,
    source_by_path: dict
):
    """
    Save project metadata, snapshot metadata and source contents.

    source_by_path:
        {
            "main.py": "print('hello')",
            "utils/helper.py": "..."
        }

    scan:
        Scanner output containing a 'files' manifest.
    """

    now = utc_now()

    await ensure_project_indexes()

    saved_files = []

    for record in scan.get("files", []):
        path = record["path"]

        # Retrieve the original source content using its relative path.
        content = source_by_path.get(path)

        if content is None:
            raise ValueError(
                f"Source content missing for scanned file: {path}"
            )

        saved_files.append({
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "path": path,
            "content": content,
            "size_bytes": record.get("size_bytes", len(content.encode("utf-8"))),
            "sha256": record.get("sha256"),
            "language": record.get("language"),
            "imports": record.get("imports", []),
            "syntax_error": record.get("syntax_error"),
            "indexed_at": now
        })

    # Save project metadata.
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "project_name": project_name,
                "latest_snapshot_id": snapshot_id,
                "file_count": scan.get("file_count", 0),
                "python_file_count": scan.get("python_file_count", 0),
                "entry_point_candidates": scan.get(
                    "entry_point_candidates", []
                ),
                "updated_at": now
            },
            "$setOnInsert": {
                "project_id": project_id,
                "created_at": now
            }
        },
        upsert=True
    )

    # Save this immutable snapshot's metadata.
    await db.project_snapshots.insert_one({
        "snapshot_id": snapshot_id,
        "project_id": project_id,
        "project_name": project_name,
        "file_count": len(saved_files),
        "created_at": now
    })

    # Save source files for this snapshot.
    if saved_files:
        await db.project_files.insert_many(saved_files)

    print(
        f"Saved project snapshot {snapshot_id}: "
        f"{len(saved_files)} files"
    )

    return {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "saved_file_count": len(saved_files)
    }


async def get_project(project_id: str):
    project = await db.projects.find_one(
        {"project_id": project_id},
        {"_id": 0}
    )

    if not project:
        return None

    snapshot_id = project.get("latest_snapshot_id")

    files = []

    if snapshot_id:
        cursor = (
            db.project_files.find(
                {
                    "project_id": project_id,
                    "snapshot_id": snapshot_id
                },
                {"_id": 0}
            )
            .sort("path", 1)
        )
        files = await cursor.to_list(length=500)

    return {
        "project": project,
        "files": files
    }


async def get_project_snapshot(
    project_id: str,
    snapshot_id: str
):
    snapshot = await db.project_snapshots.find_one(
        {
            "project_id": project_id,
            "snapshot_id": snapshot_id
        },
        {"_id": 0}
    )

    if not snapshot:
        return None

    cursor = (
        db.project_files.find(
            {
                "project_id": project_id,
                "snapshot_id": snapshot_id
            },
            {"_id": 0}
        )
        .sort("path", 1)
    )

    files = await cursor.to_list(length=500)

    return {
        "snapshot": snapshot,
        "files": files
    }