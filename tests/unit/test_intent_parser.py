import unittest
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../bridge_server')))
from intent_parser import parse_intent

class TestIntentParser(unittest.TestCase):
    def test_valid_tool_call(self):
        message = {
            "tool_call": {
                "function_calls": [
                    {
                        "name": "execute_hermes_task",
                        "args": {"prompt": "echo 'hello'"},
                        "id": "call-123"
                    }
                ]
            }
        }
        result = parse_intent(message)
        self.assertEqual(result, {"prompt": "echo 'hello'", "call_id": "call-123"})

    def test_missing_prompt(self):
        message = {
            "tool_call": {
                "function_calls": [
                    {
                        "name": "execute_hermes_task",
                        "args": {},
                        "id": "call-123"
                    }
                ]
            }
        }
        result = parse_intent(message)
        self.assertIsNone(result)

    def test_invalid_format(self):
        self.assertIsNone(parse_intent([]))
        self.assertIsNone(parse_intent({}))
        self.assertIsNone(parse_intent({"tool_call": {}}))
        self.assertIsNone(parse_intent("not a dict"))

if __name__ == '__main__':
    unittest.main()
