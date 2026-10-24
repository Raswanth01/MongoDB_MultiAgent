import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Connect with directConnection to bypass local Docker replica hostnames
MONGO_URI = "mongodb://localhost:27017/?directConnection=true"
client = AsyncIOMotorClient(MONGO_URI)
db = client["agent_debugger"]

# ==========================================
# 1. AGENT_SESSIONS OPERATIONS
# ==========================================

async def create_session(session_id: str, parent_session_id: str = None, forked_from_step: int = None, credit_mode: str = "standard"):
    """Inserts a new agent session run folder."""
    session_doc = {
        "session_id": session_id,
        "parent_session_id": parent_session_id,
        "forked_from_step": forked_from_step,
        "status": "RUNNING",
        "total_tokens_used": 0,
        "credit_mode": credit_mode,
        "created_at": datetime.utcnow()
    }
    await db.agent_sessions.insert_one(session_doc)
    print(f"Session {session_id} created.")

async def get_session(session_id: str):
    """Fetches details for a single agent session."""
    return await db.agent_sessions.find_one({"session_id": session_id})

async def list_all_sessions(limit: int = 20):
    """Lists recent agent sessions for the dashboard sidebar."""
    cursor = db.agent_sessions.find({}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)

async def update_session_status(session_id: str, status: str, tokens_added: int = 0):
    """Updates session status and increments total tokens."""
    await db.agent_sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {"status": status},
            "$inc": {"total_tokens_used": tokens_added}
        }
    )

async def delete_session(session_id: str):
    """Deletes a session and its associated snapshots."""
    await db.agent_sessions.delete_one({"session_id": session_id})
    await db.state_snapshots.delete_many({"session_id": session_id})
    print(f"Session {session_id} and its snapshots deleted.")


# ==========================================
# 2. STATE_SNAPSHOTS OPERATIONS (Immutable)
# ==========================================

async def save_snapshot(event_id: str, session_id: str, step_number: int, agent_name: str, status: str, tokens_used: int, memory_state: dict):
    """Inserts an immutable agent step checkpoint."""
    snapshot_doc = {
        "event_id": event_id,
        "session_id": session_id,
        "step_number": step_number,
        "agent_name": agent_name,
        "status": status,
        "tokens_used": tokens_used,
        "memory_state": memory_state,
        "timestamp": datetime.utcnow()
    }
    await db.state_snapshots.update_one(
        {"event_id": event_id},
        {"$set": snapshot_doc},
        upsert=True
    )
    print(f"Snapshot logged: {event_id} for session {session_id}")

async def get_session_timeline(session_id: str):
    """Fetches all step snapshots for a given session, sorted chronologically."""
    cursor = db.state_snapshots.find({"session_id": session_id}).sort("step_number", 1)
    return await cursor.to_list(length=100)


# ==========================================
# 3. EXECUTION_DELTAS OPERATIONS (Before vs After)
# ==========================================

async def save_execution_delta(delta_id: str, original_session_id: str, replay_session_id: str, state_changed: dict, tokens_saved: int, time_saved_ms: int, llm_fix_summary: str):
    """Saves the comparison report card when a time-travel replay fixes a bug."""
    delta_doc = {
        "delta_id": delta_id,
        "original_session_id": original_session_id,
        "replay_session_id": replay_session_id,
        "state_changed": state_changed,
        "tokens_saved": tokens_saved,
        "time_saved_ms": time_saved_ms,
        "llm_fix_summary": llm_fix_summary,
        "created_at": datetime.utcnow()
    }
    await db.execution_deltas.update_one(
        {"delta_id": delta_id},
        {"$set": delta_doc},
        upsert=True
    )
    print(f"Execution delta {delta_id} saved successfully.")

async def get_deltas_for_original_session(original_session_id: str):
    """Fetches all replay deltas associated with a crashed session."""
    cursor = db.execution_deltas.find({"original_session_id": original_session_id})
    return await cursor.to_list(length=50)


# ==========================================
# 4. TIME-TRAVEL FORKING ENGINE LOGIC
# ==========================================

async def fork_session_from_step(parent_session_id: str, new_session_id: str, fork_step: int):
    """Forks a new session by copying all past snapshots up to fork_step from the parent."""
    # 1. Create the new session record
    await create_session(
        session_id=new_session_id,
        parent_session_id=parent_session_id,
        forked_from_step=fork_step
    )
    
    # 2. Fetch all snapshots from parent up to the fork_step
    cursor = db.state_snapshots.find({
        "session_id": parent_session_id,
        "step_number": {"$lte": fork_step}
    }).sort("step_number", 1)
    parent_snapshots = await cursor.to_list(length=100)

    # 3. Duplicate them with new unique event_ids under the new session_id
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
    print(f"Successfully forked session {parent_session_id} into {new_session_id} at step {fork_step}")