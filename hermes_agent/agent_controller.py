from fastapi import FastAPI, Header, HTTPException
import asyncio
import time
import os
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from collections import deque
from .smart_edit_logic import tool_smart_edit

# --- SECURITY CONFIGURATION ---
PROJECT_ROOT = os.getenv("PROJECT_ROOT", "/app/hermes-live-bridge")
PROTECTED_FILES = {
    "agent_controller.py",
    "main.py",
    ".env",
    "docker-compose.yml",
    "Dockerfile"
}

def sanitize_path(path: str) -> str:
    """
    Ensures the path is absolute and resides within the PROJECT_ROOT.
    Uses realpath to resolve symlinks and prevent traversal attacks.
    """
    # Join and resolve to absolute real path
    abs_path = os.path.realpath(os.path.join(PROJECT_ROOT, path))
    
    # Verify the resolved path is still within the project root
    if not abs_path.startswith(os.path.realpath(PROJECT_ROOT)):
        raise HTTPException(status_code=403, detail=f"Access denied: Path {path} resolves outside the project root.")
    
    # Check if the file is in the protected list
    filename = os.path.basename(abs_path)
    if filename in PROTECTED_FILES:
        raise HTTPException(status_code=403, detail=f"Access denied: {filename} is a protected system file.")
        
    return abs_path

app = FastAPI()

# Get token from environment
HERMES_TOKEN = os.getenv("HERMES_TOKEN", "default-secret-token")

# Session-specific queues for status updates
session_queues: Dict[str, deque] = {}

class ToolRequest(BaseModel):
    tool: str
    args: Dict[str, Any]
    session_id: Optional[str] = None

def validate_token(x_hermes_token: str):
    if x_hermes_token != HERMES_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid Hermes Token")

# --- Tool Implementations ---

# Allowed command prefixes for shell execution
COMMAND_ALLOWLIST = {
    "ls", "cat", "grep", "find", "wc", "head", "tail", "echo",
    "python", "python3", "pip", "node", "npm", "npx",
    "git", "diff", "patch",
    "mkdir", "cp", "mv", "rm", "touch",
    "aider", "playwright", "bandit", "mypy", "ruff", "pytest",
}

async def tool_shell(args: Dict[str, Any], session_id: Optional[str] = None):
    command = args.get("command")
    if not isinstance(command, list):
        raise ValueError("Shell tool requires 'command' to be a list of strings.")
    
    if not command:
        raise ValueError("Shell tool requires a non-empty command list.")
    
    # Validate command against allowlist
    base_cmd = os.path.basename(command[0])
    if base_cmd not in COMMAND_ALLOWLIST:
        raise HTTPException(
            status_code=403,
            detail=f"Command '{base_cmd}' is not in the allowed commands list. Allowed: {sorted(COMMAND_ALLOWLIST)}"
        )
    
    # Validate no path traversal in arguments
    for arg in command[1:]:
        if ".." in arg:
            raise HTTPException(
                status_code=403,
                detail=f"Path traversal detected in argument: {arg}"
            )
        # If argument looks like a path, validate it
        if arg.startswith("/") or arg.startswith("."):
            abs_path = os.path.abspath(os.path.join(PROJECT_ROOT, arg))
            if not abs_path.startswith(PROJECT_ROOT):
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: Path {arg} resolves outside the project root."
                )
    
    start_time = time.time()
    
    # Resolve session queue
    queue = None
    if session_id:
        if session_id not in session_queues:
            session_queues[session_id] = deque(maxlen=100)
        queue = session_queues[session_id]

    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=PROJECT_ROOT
    )
    
    async def read_stream(stream, prefix):
        lines = []
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded_line = line.decode().strip()
            lines.append(decoded_line)
            if queue is not None:
                queue.append(f"{prefix}: {decoded_line}")
        return "".join(lines)

    stdout_task = asyncio.create_task(read_stream(process.stdout, "STDOUT"))
    stderr_task = asyncio.create_task(read_stream(process.stderr, "STDERR"))
    
    await process.wait()
    stdout_res = await stdout_task
    stderr_res = await stderr_task
    
    end_time = time.time()
    
    return {
        "stdout": stdout_res,
        "stderr": stderr_res,
        "exit_code": process.returncode,
        "execution_time": end_time - start_time
    }

def tool_read(args: Dict[str, Any]):
    path = args.get("path")
    if not path:
        raise ValueError("Read tool requires a 'path'.")
    
    safe_path = sanitize_path(path)
    
    with open(safe_path, 'r') as f:
        content = f.read()
    
    return {"stdout": content, "stderr": "", "exit_code": 0}

def tool_write(args: Dict[str, Any]):
    path = args.get("path")
    content = args.get("content")
    if not path or content is None:
        raise ValueError("Write tool requires 'path' and 'content'.")
    
    safe_path = sanitize_path(path)
    
    with open(safe_path, 'w') as f:
        f.write(content)
    
    return {"stdout": f"Successfully wrote to {safe_path}", "stderr": "", "exit_code": 0}

def tool_echo(args: Dict[str, Any]):
    text = args.get("text", "")
    return {"stdout": text, "stderr": "", "exit_code": 0}

# Tool Registry
TOOL_REGISTRY = {
    "shell": tool_shell,
    "read": tool_read,
    "write": tool_write,
    "echo": tool_echo,
    "smart_edit": tool_smart_edit,
}

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": time.time()}

@app.get("/status_queue")
async def get_status_queue(x_hermes_token: Optional[str] = Header(None), session_id: Optional[str] = None):
    validate_token(x_hermes_token)
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required to fetch status queue")
    
    queue = session_queues.get(session_id)
    if not queue:
        return {"updates": []}
    
    updates = list(queue)
    queue.clear()
    return {"updates": updates}

@app.post("/execute")
async def execute_command(request: ToolRequest, x_hermes_token: Optional[str] = Header(None)):
    validate_token(x_hermes_token)
    
    # Sanitizer: Check if tool exists in registry
    if request.tool not in TOOL_REGISTRY:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported tool: {request.tool}. Available tools: {list(TOOL_REGISTRY.keys())}"
        )
    
    try:
        tool_func = TOOL_REGISTRY[request.tool]
        
        if asyncio.iscoroutinefunction(tool_func):
            # For async tools, we pass the session_id if the tool supports it
            if request.tool == "shell":
                result = await tool_func(request.args, session_id=request.session_id)
            else:
                result = await tool_func(request.args)
        else:
            result = tool_func(request.args)
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {"error": str(e), "exit_code": 1}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
