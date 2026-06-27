import unittest
from unittest.mock import patch
import os
from fastapi import HTTPException
import sys

# Add hermes_agent to path so we can import agent_controller
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hermes_agent')))
from agent_controller import sanitize_path

class TestSanitizePath(unittest.TestCase):
    @patch('agent_controller.PROJECT_ROOT', '/app/hermes-live-bridge')
    def test_valid_path(self):
        path = "src/other.py"
        safe = sanitize_path(path)
        self.assertEqual(safe, "/app/hermes-live-bridge/src/other.py")

    @patch('agent_controller.PROJECT_ROOT', '/app/hermes-live-bridge')
    def test_traversal_attack(self):
        with self.assertRaises(HTTPException) as ctx:
            sanitize_path("../../../etc/passwd")
        self.assertIn("Access denied", str(ctx.exception.detail))

    @patch('agent_controller.PROJECT_ROOT', '/app/hermes-live-bridge')
    def test_protected_file(self):
        with self.assertRaises(HTTPException) as ctx:
            sanitize_path("main.py")
        self.assertIn("protected system file", str(ctx.exception.detail))

        with self.assertRaises(HTTPException) as ctx:
            sanitize_path("some/path/docker-compose.yml")
        self.assertIn("protected system file", str(ctx.exception.detail))

if __name__ == '__main__':
    unittest.main()
