import unittest
import tempfile
import os
import sys
from unittest.mock import patch

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hermes_agent')))
import smart_edit_logic

class TestSmartEdit(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, "test.txt")
        with open(self.test_file, "w") as f:
            f.write("Hello World\nThis is a test.")

    def tearDown(self):
        if os.path.exists(self.test_file):
            os.remove(self.test_file)
        os.rmdir(self.temp_dir)

    def test_missing_args(self):
        res = smart_edit_logic.tool_smart_edit({"path": "test.txt"})
        self.assertIn("error", res)
        self.assertIn("Missing required arguments", res["error"])

    def test_edit_success(self):
        with patch('smart_edit_logic.PROJECT_ROOT', self.temp_dir):
            res = smart_edit_logic.tool_smart_edit({
                "path": "test.txt",
                "old_string": "World",
                "new_string": "Universe"
            })
            self.assertIn("status", res)
            self.assertEqual(res["status"], "success")

            with open(self.test_file, "r") as f:
                content = f.read()
            self.assertIn("Hello Universe", content)

    def test_path_traversal(self):
        with patch('smart_edit_logic.PROJECT_ROOT', self.temp_dir):
            res = smart_edit_logic.tool_smart_edit({
                "path": "../../../etc/passwd",
                "old_string": "World",
                "new_string": "Universe"
            })
            self.assertIn("error", res)
            self.assertIn("Access denied", res["error"])

    def test_protected_file(self):
        with patch('smart_edit_logic.PROJECT_ROOT', self.temp_dir):
            res = smart_edit_logic.tool_smart_edit({
                "path": "main.py",
                "old_string": "World",
                "new_string": "Universe"
            })
            self.assertIn("error", res)
            self.assertIn("protected system file", res["error"])

if __name__ == '__main__':
    unittest.main()
