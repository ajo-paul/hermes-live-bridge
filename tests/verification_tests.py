import asyncio
import os
import pytest
import json
from collections import deque
from unittest.mock import MagicMock, AsyncMock

# We need to mock some environment variables and paths for the tests to run outside the docker container
os.environ["PROJECT_ROOT"] = "/tmp/hermes_test"
os.environ["HERMES_TOKEN"] = "test-token"
os.makedirs("/tmp/hermes_test", exist_ok=True)

import sys
sys.path.append("/Users/ajopolachan/Code Base/Hermes-live-bridge-main")
from hermes_agent.agent_controller import tool_shell, ToolRequest, session_queues
from hermes_agent.smart_edit_logic import tool_smart_edit
from bridge_server.state_manager import SessionStateManager

@pytest.mark.asyncio
async def test_async_shell_responsiveness():
    """Verify that tool_shell does not block the event loop."""
    with open("/tmp/hermes_test/test.txt", "w") as f:
        f.write("hello")
    
    start_time = asyncio.get_event_loop().time()
    task = asyncio.create_task(tool_shell({"command": ["python3", "-c", "import time; time.sleep(1)"]}, session_id="test_session"))
    
    counter = 0
    while not task.done():
        counter += 1
        await asyncio.sleep(0.1)
    
    end_time = asyncio.get_event_loop().time()
    assert counter > 5 
    assert (end_time - start_time) >= 1.0

@pytest.mark.asyncio
async def test_session_isolation():
    """Verify that status updates are isolated per session."""
    session_a = "session_a"
    session_b = "session_b"
    session_queues.clear()
    
    task_a = asyncio.create_task(tool_shell({"command": ["echo", "Message A"]}, session_id=session_a))
    task_b = asyncio.create_task(tool_shell({"command": ["echo", "Message B"]}, session_id=session_b))
    await asyncio.gather(task_a, task_b)
    
    queue_a = session_queues.get(session_a)
    queue_b = session_queues.get(session_b)
    
    assert any("Message A" in msg for msg in queue_a)
    assert not any("Message A" in msg for msg in queue_b)
    assert any("Message B" in msg for msg in queue_b)
    assert not any("Message B" in msg for msg in queue_a)

def test_smart_edit_accuracy():
    """Verify that smart_edit only replaces the exact block match."""
    path = "/tmp/hermes_test/smart_edit_test.py"
    content = "print('hello')\nprint('world')\nprint('hello')"
    with open(path, "w") as f:
        f.write(content)
    
    search_block = "print('world')\nprint('hello')"
    replace_block = "print('world')\nprint('goodbye')"
    
    result = tool_smart_edit({
        "path": "smart_edit_test.py", 
        "search_block": search_block, 
        "replace_block": replace_block
    })
    
    assert result["status"] == "success"
    with open(path, "r") as f:
        final_content = f.read()
    
    assert "print('goodbye')" in final_content
    assert final_content.count("print('hello')") == 1

@pytest.mark.asyncio
async def test_sqlite_connection_persistence():
    """Verify that SessionStateManager reuses the same connection."""
    manager = SessionStateManager(db_path="/tmp/hermes_test/test_state.db")
    await manager.connect()
    
    conn1 = manager.conn
    await manager.add_task("Task 1")
    conn2 = manager.conn
    
    assert conn1 is conn2
    await manager.close()
