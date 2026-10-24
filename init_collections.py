import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# Connect to your local MongoDB Docker container
MONGO_URI = "mongodb://localhost:27017/?directConnection=true"
client = AsyncIOMotorClient(MONGO_URI)
db = client["agent_debugger"]

async def setup_database():
    print("🚀 Setting up MongoDB collections and constraints...")

    # ==========================================
    # 1. AGENT_SESSIONS COLLECTION
    # ==========================================
    if "agent_sessions" not in await db.list_collection_names():
        await db.create_collection("agent_sessions")
    
    # Unique index on session_id
    await db.agent_sessions.create_index("session_id", unique=True)
    print("✅ Created 'agent_sessions' with unique index on session_id.")


    # ==========================================
    # 2. STATE_SNAPSHOTS COLLECTION (With Schema Validation)
    # ==========================================
    snapshot_validator = {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["event_id", "session_id", "step_number", "agent_name", "status", "tokens_used", "memory_state"],
            "properties": {
                "event_id": {"bsonType": "string"},
                "session_id": {"bsonType": "string"},
                "step_number": {"bsonType": "int"},
                "agent_name": {"bsonType": "string"},
                "status": {"bsonType": "string"},
                "tokens_used": {"bsonType": "int"},
                "memory_state": {"bsonType": "object"}
            }
        }
    }

    if "state_snapshots" not in await db.list_collection_names():
        await db.create_collection("state_snapshots", validator=snapshot_validator)
    else:
        await db.command({"collMod": "state_snapshots", "validator": snapshot_validator})

    # Unique index on event_id to prevent duplicate log events
    await db.state_snapshots.create_index("event_id", unique=True)
    # Compound index for fast timeline lookups per session
    await db.state_snapshots.create_index([("session_id", 1), ("step_number", 1)])
    print("✅ Created 'state_snapshots' with validation rules and unique index on event_id.")


    # ==========================================
    # 3. EXECUTION_DELTAS COLLECTION
    # ==========================================
    if "execution_deltas" not in await db.list_collection_names():
        await db.create_collection("execution_deltas")

    # Unique index on delta_id
    await db.execution_deltas.create_index("delta_id", unique=True)
    print("✅ Created 'execution_deltas' with unique index on delta_id.")

    print("\n🎉 All 3 collections successfully initialized and secured!")

if __name__ == "__main__":
    asyncio.run(setup_database())
