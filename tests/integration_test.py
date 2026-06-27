import asyncio
import json
import websockets
import unittest
import requests
from unittest.mock import MagicMock, patch

# The Bridge Server typically runs on 0.0.0.0:8000
BRIDGE_URL = "ws://localhost:8000/ws/live"
HTTP_URL = "http://localhost:8000"

class TestHermesLiveBridge(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.websocket = None

    async def asyncTearDown(self):
        if self.websocket:
            await self.websocket.close()

    async def test_connection_and_basic_messaging(self):
        """Test if we can connect and send/receive basic messages."""
        try:
            async with websockets.connect(BRIDGE_URL) as ws:
                self.websocket = ws
                # Test sending text
                await ws.send(json.dumps({"type": "text", "content": "Hello Bridge!"}))
                
                # Test getting status summary
                await ws.send(json.dumps({"type": "get_status"}))
                response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                data = json.loads(response)
                
                self.assertEqual(data["type"], "status_summary")
                self.assertIn("content", data)
                print("Basic messaging test passed.")
        except Exception as e:
            self.fail(f"Connection or basic messaging failed: {e}")

    async def test_mock_tool_call(self):
        """
        Test if the bridge handles a mock tool call from the API.
        We use the /test/inject_gemini_message endpoint to simulate a tool call from Gemini.
        """
        try:
            async with websockets.connect(BRIDGE_URL) as ws:
                self.websocket = ws
                
                # 1. Simulate a tool call from Gemini Flash
                mock_tool_call = {
                    "tool_call": {
                        "function_calls": [
                            {
                                "name": "execute_hermes_task",
                                "args": {"prompt": "echo 'Hello from mock test'"}
                            }
                        ]
                    }
                }
                
                # Inject the message into the server's queue
                inject_res = requests.post(f"{HTTP_URL}/test/inject_gemini_message", json=mock_tool_call)
                self.assertEqual(inject_res.status_code, 200)
                
                # 2. Wait for the agent response, skipping any 'status' messages
                response_data = None
                for _ in range(10): # Try up to 10 messages
                    response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(response)
                    if data.get("type") == "agent_response":
                        response_data = data
                        break
                
                self.assertIsNotNone(response_data, "Did not receive agent_response within timeout")
                self.assertIn("Hello from mock test", response_data["content"])
                print("Mock tool call test passed.")
                
        except Exception as e:
            self.fail(f"Mock tool call test failed: {e}")

    async def test_malformed_json(self):
        """Test that sending malformed JSON doesn't crash the server."""
        try:
            async with websockets.connect(BRIDGE_URL) as ws:
                self.websocket = ws
                await ws.send("This is not JSON")
                # The server should handle this and not crash
                # We send a valid message after to see if the connection is still open
                await ws.send(json.dumps({"type": "get_status"}))
                response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                self.assertTrue(isinstance(response, str))
                print("Malformed JSON test passed.")
        except Exception as e:
            self.fail(f"Malformed JSON test failed: {e}")

    async def test_unauthorized_agent_access(self):
        """Test that the agent controller rejects requests without a valid token."""
        # Use the Bridge's internal AGENT_URL if possible, but for host-based tests, 
        # we try to connect to the mapped port.
        AGENT_URL = "http://localhost:8080/execute"
        try:
            # Increase timeout and add a small delay to ensure Docker is ready
            await asyncio.sleep(1)
            res = requests.post(AGENT_URL, json={"tool": "echo", "args": {"text": "hi"}}, timeout=5)
            self.assertEqual(res.status_code, 403)
            print("Unauthorized agent access blocked.")
        except requests.exceptions.ConnectionError:
            self.fail("Could not connect to Agent Controller. Ensure docker-compose is running and port 8080 is mapped.")
        except Exception as e:
            self.fail(f"Unauthorized access test failed: {e}")

    async def test_path_traversal_blocking(self):
        """Test that the agent controller rejects path traversal and protected files requests even with a valid token."""
        AGENT_URL = "http://localhost:8080/execute"
        headers = {"X-Hermes-Token": "dummy_token_secure_hermes_live_bridge"}
        try:
            await asyncio.sleep(1)
            
            # 1. Test directory traversal in shell tool command
            res = requests.post(
                AGENT_URL, 
                json={"tool": "shell", "args": {"command": ["ls", "../../../etc/passwd"]}}, 
                headers=headers,
                timeout=5
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("traversal", res.json().get("detail", "").lower())

            # 2. Test directory traversal in read tool path
            res = requests.post(
                AGENT_URL, 
                json={"tool": "read", "args": {"path": "../../../etc/passwd"}}, 
                headers=headers,
                timeout=5
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("access denied", res.json().get("detail", "").lower())
            
            # 3. Test protected file read block
            res = requests.post(
                AGENT_URL, 
                json={"tool": "read", "args": {"path": "agent_controller.py"}}, 
                headers=headers,
                timeout=5
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("protected", res.json().get("detail", "").lower())

            print("Path traversal and protected file security validation passed.")
        except Exception as e:
            self.fail(f"Path traversal security test failed: {e}")

if __name__ == "__main__":
    unittest.main()
