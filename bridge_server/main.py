from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import asyncio
import base64
import json
import shlex
import uuid
import os
import httpx
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from starlette.requests import Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from dotenv import load_dotenv

load_dotenv()

from .flash_live_client import FlashLiveClient
from .intent_parser import parse_intent
from .state_manager import SessionStateManager

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BridgeServer")

# Environment Variables
AGENT_URL = os.getenv("AGENT_URL", "http://hermes_agent:8080")
HERMES_TOKEN = os.getenv("HERMES_TOKEN", "default-secret-token")
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Track active sessions dynamically
active_sessions: Dict[str, FlashLiveClient] = {}
state_manager = SessionStateManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Flash Live connections will fail.")
    
    await state_manager.connect()
    
    # Create a single AsyncClient for the entire application lifetime
    async with httpx.AsyncClient(timeout=httpx.Timeout(70.0)) as client:
        app.state.http_client = client
        try:
            yield
        finally:
            await state_manager.close()

# --- Rate Limiting Setup ---
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

class IntentRegistry:
    def __init__(self):
        self.patterns = {
            "read": (lambda p: p.startswith("read "), {"tool": "read"}),
            "write": (lambda p: p.startswith("write "), {"tool": "write"}),
            "echo": (lambda p: p.startswith("echo "), {"tool": "echo"}),
            "shell": (lambda p: True, {"tool": "shell"}), # Default fallback
        }

    def parse(self, prompt: str):
        for name, (predicate, tool_info) in self.patterns.items():
            if predicate(prompt):
                if name == "read":
                    args = {"path": prompt[5:].strip()}
                elif name == "write":
                    parts = prompt[6:].strip().split(maxsplit=1)
                    if len(parts) != 2: continue
                    args = {"path": parts[0], "content": parts[1]}
                elif name == "echo":
                    args = {"text": prompt[5:].strip()}
                else: # shell
                    args = {"command": shlex.split(prompt)}
                return {**tool_info, "args": args}
        return None

intent_registry = IntentRegistry()

async def call_agent_async(prompt: str, session_id: str, http_client: httpx.AsyncClient, websocket: WebSocket = None):
    """Calls the Hermes Agent for tool execution asynchronously with optional heartbeats."""

    tool_payload = intent_registry.parse(prompt)
    if not tool_payload:
        return {"error": "Could not parse intent from prompt", "exit_code": 1}

    async def heartbeat_loop():
        if not websocket:
            return
        while True:
            try:
                await asyncio.sleep(2)
                response = await http_client.get(
                    f"{AGENT_URL}/status_queue",
                    params={"session_id": session_id},
                    headers={"X-Hermes-Token": HERMES_TOKEN},
                    timeout=2.0
                )
                if response.status_code == 200:
                    updates = response.json().get("updates", [])
                    for update in updates:
                        await websocket.send_text(json.dumps({"type": "status", "content": update}))
            except httpx.RequestError as e:
                logger.debug(f"Status queue connection issue: {e}")
            except Exception as e:
                logger.error(f"Error polling status queue: {e}")

    hb_task = None
    if websocket:
        hb_task = asyncio.create_task(heartbeat_loop())

    try:
        # Call agent with retry / exponential backoff
        retries = 3
        backoff = 1.0
        for attempt in range(retries):
            try:
                payload = tool_payload
                payload["session_id"] = session_id
                
                response = await http_client.post(
                    f"{AGENT_URL}/execute",
                    json=payload,
                    headers={"X-Hermes-Token": HERMES_TOKEN},
                    timeout=70.0
                )
                return response.json()
            except (httpx.RequestError, httpx.TimeoutException) as e:
                if attempt == retries - 1:
                    logger.error(f"Agent execute failed after {retries} attempts: {e}")
                    raise
                logger.warning(f"Agent communication failed (attempt {attempt + 1}/{retries}): {e}. Retrying in {backoff}s...")
                await asyncio.sleep(backoff)
                backoff *= 2.0
    except Exception as e:
        return {"error": f"Agent communication failed: {str(e)}", "exit_code": 1}
    finally:
        if hb_task:
            hb_task.cancel()

# Serve static frontend in production if exists
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {"message": "Hermes-Live Bridge Server is running (Frontend not built)"}

@app.get("/health")
@limiter.limit("5/minute")
async def health(request: Request):
    try:
        any_connected = any(c.is_running for c in active_sessions.values())
        return {"status": "ok", "agent_url": AGENT_URL, "flash_live_connected": any_connected}
    except Exception as e:
        return {"status": "error", "details": str(e)}

@app.post("/test/inject_gemini_message")
async def inject_gemini_message(message: dict):
    if not DEBUG:
        raise HTTPException(status_code=404, detail="Not Found")
    if not active_sessions:
        raise HTTPException(status_code=400, detail="No active session to inject message into")
    client = list(active_sessions.values())[0]
    await client.incoming_queue.put(json.dumps(message))
    return {"status": "success", "message": "Message injected into queue"}

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket bridge between the User's browser and the Gemini Flash Live API.
    """
    session_id = str(uuid.uuid4())
    await websocket.accept()
    logger.info(f"User connected to /ws/live, session_id: {session_id}")

    session_client = FlashLiveClient()
    active_sessions[session_id] = session_client
    conn_task = asyncio.create_task(session_client.connect())

    try:
        # Create two concurrent tasks: 
        # 1. Forward messages from User -> Flash Live
        # 2. Forward messages from Flash Live -> User
        
        async def forward_user_to_flash():
            while True:
                try:
                    data = await websocket.receive_text()
                    # We expect JSON messages from the browser
                    try:
                        msg = json.loads(data)
                        if msg.get("type") == "setup":
                            await session_client.apply_settings(msg.get("settings", {}))
                        # If it's a text message, use the specialized method
                        elif msg.get("type") in ["text", "message"]:
                            await session_client.send_text(msg.get("content", msg.get("text", "")))
                        elif msg.get("type") in ["audio", "audio_input"]:
                            # Expect base64 encoded audio bytes from browser
                            audio_bytes = base64.b64decode(msg.get("content", msg.get("data", "")))
                            await session_client.send_audio(audio_bytes)
                        elif msg.get("type") == "get_status":
                            # Handle status query from user
                            status_summary = await state_manager.get_status_summary(session_id=session_id)
                            await websocket.send_text(json.dumps({
                                "type": "status_summary",
                                "content": status_summary
                            }))
                        else:
                            # Generic forward of the JSON payload
                            await session_client.send_message(msg)
                    except json.JSONDecodeError:
                        # Fallback to sending raw text as user prompt
                        await session_client.send_text(data)
                except WebSocketDisconnect:
                    logger.info("User disconnected from bridge (forward_user_to_flash)")
                    raise # Re-raise to stop the loop and trigger cancellation of other tasks
                except Exception as e:
                    logger.error(f"Error processing user message: {e}")
                    # Continue the loop despite the error

        async def forward_flash_to_user():
            while True:
                try:
                    # Wait for a message from the Flash Live API
                    flash_msg_raw = await session_client.get_next_message()
                    
                    # The message is usually a JSON string from the websocket
                    try:
                        flash_msg = json.loads(flash_msg_raw)
                        
                        # Check for Hermes Agent intent
                        intent = parse_intent(flash_msg)
                        if intent:
                            prompt = intent["prompt"]
                            call_id = intent["call_id"]
                            logger.info(f"Detected Hermes task: {prompt}")
                            
                            # Track task state
                            task_id = await state_manager.add_task(prompt, session_id=session_id)
                            await state_manager.update_status(task_id, "running")
                            
                            # Notify user
                            await websocket.send_text(json.dumps({"type": "status", "content": "Thinking..."}))
                            
                            # Call Agent
                            agent_result = await call_agent_async(prompt, session_id=session_id, http_client=websocket.app.state.http_client, websocket=websocket)
                            
                            # Update task state
                            status = "completed" if "error" not in agent_result else "failed"
                            await state_manager.update_status(task_id, status, result=agent_result)
                            
                            # Send result to Flash API
                            await session_client.send_tool_response(call_id, json.dumps(agent_result))
                            
                            # Send result to User
                            await websocket.send_text(json.dumps({
                                "type": "agent_response", 
                                "content": agent_result.get("stdout", agent_result.get("output", "Task completed")),
                                "full_result": agent_result
                            }))
                            continue # Skip forwarding the raw tool_call message to user
                            
                    except json.JSONDecodeError:
                        flash_msg = flash_msg_raw # Fallback to raw
                    
                    # --- Format Gemini payload for React UI ---
                    if isinstance(flash_msg, dict) and "serverContent" in flash_msg:
                        server_content = flash_msg["serverContent"]
                        
                        if "modelTurn" in server_content:
                            for part in server_content["modelTurn"].get("parts", []):
                                if "text" in part:
                                    await websocket.send_text(json.dumps({"type": "text_chunk", "text": part["text"]}))
                                if "inlineData" in part:
                                    await websocket.send_text(json.dumps({"type": "audio_chunk", "audio": part["inlineData"].get("data", "")}))
                        
                        if "outputTranscription" in server_content and "text" in server_content["outputTranscription"]:
                            await websocket.send_text(json.dumps({"type": "text_chunk", "text": server_content["outputTranscription"]["text"]}))
                            
                        if "groundingMetadata" in server_content:
                            gm = server_content["groundingMetadata"]
                            web_queries = gm.get("webSearchQueries", [])
                            chunks = gm.get("groundingChunks", [])
                            formatted_chunks = []
                            for c in chunks:
                                if "web" in c:
                                    formatted_chunks.append({"title": c["web"].get("title", ""), "uri": c["web"].get("uri", "")})
                            if web_queries or formatted_chunks:
                                await websocket.send_text(json.dumps({
                                    "type": "grounding_metadata",
                                    "webSearchQueries": web_queries,
                                    "groundingChunks": formatted_chunks
                                }))
                                
                        if server_content.get("turnComplete"):
                            await websocket.send_text(json.dumps({"type": "turn_complete"}))
                            
                        if server_content.get("interrupted"):
                            await websocket.send_text(json.dumps({"type": "interrupted"}))
                            
                    else:
                        # Forward the raw message (like setupComplete)
                        await websocket.send_text(flash_msg if isinstance(flash_msg, str) else json.dumps(flash_msg))
                except WebSocketDisconnect:
                    logger.info("User disconnected from bridge (forward_flash_to_user)")
                    raise # Re-raise to stop the loop and trigger cancellation of other tasks
                except Exception as e:
                    logger.error(f"Error processing flash message: {e}")
                    # Continue the loop despite the error

        # Run both forwarding tasks concurrently
        user_task = asyncio.create_task(forward_user_to_flash())
        flash_task = asyncio.create_task(forward_flash_to_user())
        done, pending = await asyncio.wait(
            [user_task, flash_task], 
            return_when=asyncio.FIRST_COMPLETED
        )
        # Cancel any remaining tasks to ensure immediate cleanup (including heartbeat loops)
        for task in pending:
            task.cancel()
        # Wait for cancellation to complete
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        # Retrieve exceptions from done tasks to avoid warning
        for task in done:
            if not task.cancelled():
                task.result()

    except WebSocketDisconnect:
        logger.info("User disconnected from bridge")
    except Exception as e:
        logger.error(f"Bridge error: {e}")
    finally:
        # Cancel connection task
        conn_task.cancel()
        try:
            await conn_task
        except asyncio.CancelledError:
            pass
        active_sessions.pop(session_id, None)
        logger.info(f"User session {session_id} ended")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
