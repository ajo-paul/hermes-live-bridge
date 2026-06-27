import asyncio
import os
import json
import sys

# Add the bridge_server directory to sys.path to allow importing state_manager directly
sys.path.append("/app/hermes-live-bridge/bridge_server")
from state_manager import SessionStateManager

async def test_persistence():
    db_path = "/app/hermes-live-bridge/session_state.db"
    
    # Clean up any existing DB
    if os.path.exists(db_path):
        os.remove(db_path)

    print("--- First session ---")
    sm1 = SessionStateManager(db_path=db_path)
    task_id = await sm1.add_task("Hello persistence!")
    print(f"Added task: {task_id}")
    
    await sm1.update_status(task_id, "running")
    print("Updated status to running")
    
    await sm1.update_status(task_id, "completed", result={"output": "Success!"})
    print("Updated status to completed with result")
    
    summary1 = await sm1.get_status_summary()
    print(f"Summary 1: {json.dumps(summary1, indent=2)}")

    print("\n--- Mock Restart (New Manager Instance) ---")
    sm2 = SessionStateManager(db_path=db_path)
    summary2 = await sm2.get_status_summary()
    print(f"Summary 2: {json.dumps(summary2, indent=2)}")

    # Verify
    history = summary2["history"]
    if len(history) > 0 and history[0]["task_id"] == task_id:
        print("\nVERIFICATION SUCCESS: Task recovered from DB.")
    else:
        print("\nVERIFICATION FAILED: Task not found in DB.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_persistence())
