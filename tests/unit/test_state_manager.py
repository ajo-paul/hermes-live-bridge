import unittest
import tempfile
import os
import sys
import asyncio

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../bridge_server')))
from state_manager import SessionStateManager

class TestStateManager(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db_fd, self.db_path = tempfile.mkstemp()
        self.manager = SessionStateManager(db_path=self.db_path)

    async def asyncTearDown(self):
        os.close(self.db_fd)
        os.unlink(self.db_path)

    async def test_add_and_retrieve_task(self):
        task_id = await self.manager.add_task("test prompt", session_id="test-session")
        self.assertIsNotNone(task_id)

        current = await self.manager.get_current_task(session_id="test-session")
        self.assertIsNotNone(current)
        self.assertEqual(current["task_id"], task_id)
        self.assertEqual(current["prompt"], "test prompt")
        self.assertEqual(current["status"], "pending")

    async def test_update_status(self):
        task_id = await self.manager.add_task("test prompt")
        await self.manager.update_status(task_id, "completed", result={"output": "done"})

        history = await self.manager.get_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["task_id"], task_id)
        self.assertEqual(history[0]["status"], "completed")
        self.assertEqual(history[0]["result"], {"output": "done"})

    async def test_session_isolation(self):
        task1 = await self.manager.add_task("task 1", session_id="session-1")
        task2 = await self.manager.add_task("task 2", session_id="session-2")

        curr1 = await self.manager.get_current_task(session_id="session-1")
        curr2 = await self.manager.get_current_task(session_id="session-2")

        self.assertEqual(curr1["task_id"], task1)
        self.assertEqual(curr2["task_id"], task2)

if __name__ == '__main__':
    unittest.main()
