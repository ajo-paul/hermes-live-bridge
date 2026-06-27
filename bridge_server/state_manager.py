import asyncio
import uuid
import aiosqlite
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

@dataclass
class TaskState:
    task_id: str
    prompt: str
    status: str  # pending, running, completed, failed
    result: Optional[Any] = None
    start_time: str = ""
    updated_at: str = ""
    session_id: str = "default"

    def __post_init__(self):
        if not self.start_time:
            self.start_time = datetime.utcnow().isoformat()
        if not self.updated_at:
            self.updated_at = self.start_time

class SessionStateManager:
    def __init__(self, db_path: str = "session_state.db"):
        self.db_path = db_path
        self._lock = asyncio.Lock()
        self.conn = None
        self._init_db()

    def _init_db(self):
        import sqlite3
        import os
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    prompt TEXT,
                    status TEXT,
                    result TEXT,
                    start_time TEXT,
                    updated_at TEXT,
                    session_id TEXT
                )
            """)
            conn.commit()

    async def connect(self):
        if self.conn is None:
            self.conn = await aiosqlite.connect(self.db_path)
            self.conn.row_factory = aiosqlite.Row

    async def close(self):
        if self.conn:
            await self.conn.close()
            self.conn = None

    async def _get_conn(self):
        if self.conn is None:
            await self.connect()
        return self.conn

    async def add_task(self, prompt: str, session_id: str = "default") -> str:
        task_id = str(uuid.uuid4())
        task = TaskState(task_id=task_id, prompt=prompt, status="pending", session_id=session_id)
        async with self._lock:
            conn = await self._get_conn()
            await conn.execute(
                "INSERT INTO tasks (task_id, prompt, status, result, start_time, updated_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task.task_id, task.prompt, task.status, json.dumps(task.result), task.start_time, task.updated_at, task.session_id)
            )
            await conn.commit()
        return task_id

    async def update_status(self, task_id: str, status: str, result: Any = None):
        now = datetime.utcnow().isoformat()
        async with self._lock:
            conn = await self._get_conn()
            cursor = await conn.execute("SELECT result FROM tasks WHERE task_id = ?", (task_id,))
            row = await cursor.fetchone()
            if not row:
                return

            current_result = row[0]
            if result is not None:
                current_result = json.dumps(result)
            
            await conn.execute(
                "UPDATE tasks SET status = ?, result = ?, updated_at = ? WHERE task_id = ?",
                (status, current_result, now, task_id)
            )
            await conn.commit()

    async def get_current_task(self, session_id: str = "default") -> Optional[Dict]:
        conn = await self._get_conn()
        cursor = await conn.execute(
            "SELECT * FROM tasks WHERE session_id = ? AND status NOT IN ('completed', 'failed') ORDER BY start_time DESC LIMIT 1",
            (session_id,)
        )
        row = await cursor.fetchone()
        if row:
            data = dict(row)
            data['result'] = json.loads(data['result']) if data['result'] else None
            return data
        return None

    async def get_history(self, limit: int = 5, session_id: str = "default") -> List[Dict]:
        conn = await self._get_conn()
        cursor = await conn.execute(
            "SELECT * FROM tasks WHERE session_id = ? AND status IN ('completed', 'failed') ORDER BY start_time DESC LIMIT ?",
            (session_id, limit)
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            data = dict(row)
            data['result'] = json.loads(data['result']) if data['result'] else None
            results.append(data)
        return results

    async def get_status_summary(self, session_id: str = "default"):
        return {
            "current_task": await self.get_current_task(session_id),
            "history": await self.get_history(session_id=session_id)
        }

