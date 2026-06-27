# Developer Documentation: Hermes-Live Bridge

## 1. Project Overview
**Hermes-Live Bridge** is a high-performance, multimodal orchestration system designed to enable a "hands-free/screen-free" coding experience. It connects the **Gemini Flash Live API** (low-latency voice/multimodal interaction) to a Dockerized **Hermes Agent** (high-reasoning agentic coding engine), allowing developers to drive complex software engineering tasks via real-time voice commands.

### Purpose & Goals
- **Eliminate Input Friction**: Replace manual typing and monitor-staring with a "Scrum Master to Developer" voice relationship.
- **Autonomous Execution**: Enable an agent to plan, implement, and verify code changes autonomously.
- **Real-time Feedback**: Provide a symmetric audio loop where the agent's progress is reported back to the user via voice.
- **State Persistence**: Maintain long-term project memory across multiple sessions.

---

## 2. Technology Stack

| Layer | Component | Technology |
| :--- | :--- | :--- |
| **Frontend** | UI Framework | React 18, TypeScript, Vite |
| **Frontend** | Audio Processing | Web Audio API (PCM 16kHz, Mono) |
| **Backend** | Orchestrator | Python 3.11, FastAPI, WebSockets |
| **Agent Engine** | Reasoning Model | Gemma 4 31B |
| **Voice Interface** | Multimodal Model | Gemini 2.0 Flash (Live API) |
| **Persistence** | Database | SQLite (Session State) |
| **Memory** | Knowledge Base | Markdown (`TASKS.md`, `PROGRESS.md`) |
| **Infrastructure** | Containerization | Docker, Docker Compose |

---

## 3. Architecture

### System Overview
The system operates as a tri-partite architecture:
1.  **The Voice (Gemini Flash Live)**: Acts as the interface. It processes audio, handles natural language, and triggers technical intents.
2.  **The Router (Bridge Server)**: A stateful proxy that manages WebSocket connections, authenticates requests, and routes intents from Gemini to the Agent.
3.  **The Hands (Hermes Agent)**: A secure sandbox that executes a "Reasoning $\rightarrow$ Tool Use $\rightarrow$ Verification" loop on the local filesystem.

### The Task Loop (Data Flow)
`User Voice` $\rightarrow$ `Frontend (PCM $\rightarrow$ Base64)` $\rightarrow$ `Bridge Server` $\rightarrow$ `Gemini Flash Live` $\rightarrow$ `Tool Call (execute_hermes_task)` $\rightarrow$ `Bridge Server` $\rightarrow$ `Agent Controller` $\rightarrow$ `Gemma 4 Reasoning` $\rightarrow$ `Filesystem Tool` $\rightarrow$ `Result` $\rightarrow$ `Bridge` $\rightarrow$ `Gemini Flash` $\rightarrow$ `User Audio Response`.

---

## 4. Installation & Setup

### Prerequisites
- Docker & Docker Compose
- Node.js v18+ (for frontend development)
- Google Gemini API Key (with Flash Live access)

### Installation Steps
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd hermes-live-bridge
   ```
2. **Configure Environment**:
   Create a `.env` file in the root:
   ```env
   GEMINI_API_KEY=***
   HERMES_TOKEN=your_s...oken
   ```
3. **Launch Backend**:
   ```bash
   docker-compose up --build -d
   ```
4. **Launch Frontend**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

---

## 5. Configuration

### Environment Variables
| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | API key for Google Gemini services. | Required |
| `HERMES_TOKEN` | Shared secret for Bridge $\leftrightarrow$ Agent auth. | `default-secret-token` |
| `AGENT_URL` | URL of the Agent Controller service. | `http://hermes_agent:8080` |

### Docker Resource Limits
To prevent resource exhaustion during heavy agentic tasks, limits are defined in `docker-compose.yml`:
- **CPU**: 2.0 Cores
- **RAM**: 4GB Limit / 512MB Reservation

---

## 6. Database Schema

The system uses a lightweight **SQLite** database (`session_state.db`) managed by the `SessionStateManager`.

### Table: `tasks`
Stores the lifecycle of every agentic task.
- `task_id` (UUID, PK): Unique identifier for the task.
- `prompt` (TEXT): The technical instruction sent to the agent.
- `status` (TEXT): `pending`, `running`, `completed`, `failed`.
- `result` (TEXT): The final output returned by the agent.
- `created_at` / `updated_at` (TIMESTAMP).

---

## 7. API Documentation

### Bridge Server (FastAPI)

#### `GET /health`
Returns system health and connectivity status.
- **Response**: `{"status": "ok", "flash_live_connected": true}`

#### `WS /ws/live`
The primary multimodal WebSocket.
- **Client $\rightarrow$ Server**:
  - `{ "type": "text", "content": "Hello" }`
  - `{ "type": "audio", "content": "<base64_pcm>" }`
- **Server $\rightarrow$ Client**:
  - `{ "type": "status", "content": "Thinking..." }`
  - `{ "type": "agent_response", "content": "Task completed", "full_result": {...} }`
  - `{ "type": "audio", "content": "<base64_pcm>" }`

### Agent Controller (Internal)

#### `POST /execute`
Executes a tool call within the sandbox.
- **Header**: `X-Hermes-Token: <token>`
- **Payload**: `{ "tool": "shell", "args": { "command": ["ls", "-la"] } }`
- **Response**: `{ "stdout": "...", "stderr": "...", "exit_code": 0 }`

---

## 8. Authentication & Authorization

### Token-Based Security
The system implements a **shared-secret architecture**.
1. The Bridge Server and Agent Controller share the `HERMES_TOKEN`.
2. Every request from the Bridge to the Agent must include the `X-Hermes-Token` header.
3. Requests without a valid token are rejected with a `403 Forbidden` error.

---

## 9. Folder Structure & Code Organization

```text
hermes-live-bridge/
├── bridge_server/          # Orchestration Layer (FastAPI)
│   ├── main.py             # WebSocket & API entry point
│   ├── flash_live_client.py # Gemini API integration
│   ├── intent_parser.py    # Tool call extraction
│   └── state_manager.py    # SQLite persistence logic
├── hermes_agent/           # Execution Layer (Sandbox)
│   ├── agent_controller.py # Tool registry & execution engine
│   └── smart_edit_logic.py # Targeted file modification logic
├── client/                 # Interaction Layer (React)
│   ├── src/hooks/          # useLiveBridge (Audio/WS logic)
│   └── src/components/     # Console & Chat UI
├── tests/                  # Integration & Unit tests
└── docker-compose.yml      # Infrastructure definition
```

---

## 10. Development Workflow

### The "Scrum Master" Loop
Development follows a high-agency autonomous loop:
1.  **Plan**: Define the goal in `TASKS.md`.
2.  **Implement**: Execute changes via the agent.
3.  **Verify**: Run tests using `run_tests.sh`.
4.  **Log**: Record decisions in `DECISIONS.md` and progress in `PROGRESS.md`.

### Coding Conventions
- **Type Safety**: Strict TypeScript in the frontend.
- **Async I/O**: All database and network calls in Python must use `asyncio`.
- **Stateless Logic**: The Bridge should remain as stateless as possible, relying on the SQLite DB for recovery.

---

## 11. Testing & Debugging

### Running Tests
Execute the integration suite:
```bash
bash /app/hermes-live-bridge/tests/run_tests.sh
```

### Debugging Tips
- **WebSocket Logs**: Inspect the browser console to verify PCM chunk transmission.
- **Agent Logs**: Use `docker logs -f hermes_agent` to see raw tool outputs.
- **State Check**: Query `session_state.db` to verify task transitions.

---

## 12. Deployment Guide

### Production Considerations
- **TLS/SSL**: In production, WebSockets must be upgraded to `wss://` and HTTP to `https://`.
- **Secrets**: Migrate `HERMES_TOKEN` to a secret manager (e.g., AWS Secrets Manager or HashiCorp Vault).
- **Scaling**: For multi-user support, transition the Bridge to a distributed Redis-backed state manager.

---

## 13. Troubleshooting & FAQs

**Q: The agent says "Task completed" but I don't see changes.**
*   **Check**: Ensure the agent has write permissions to the volume and that the `smart_edit` tool is targeting the correct path.

**Q: Audio is choppy or has static.**
*   **Check**: Ensure the browser is capturing at 16kHz and the conversion to `Int16` is not overflowing.

---

## 14. Security Considerations

### RCE Prevention
To prevent Remote Code Execution (RCE), the agent does not use `shell=True`. All commands are dispatched through a verified `TOOL_REGISTRY`.

### Path Sandboxing
The system implements a strict path sanitization layer. All file operations are restricted to the `PROJECT_ROOT` (`/app/hermes-live-bridge`). Any attempt to access files outside this directory (e.g., via `../` traversal) is blocked with a `403 Forbidden` error.

### Protected Files
Critical system files are explicitly protected and cannot be read or written by the agent:
- `agent_controller.py`
- `main.py`
- `.env`
- `docker-compose.yml`
- `Dockerfile`

### Denial of Service (DoS) Protection
The Bridge Server utilizes `slowapi` to rate-limit HTTP endpoints, preventing resource exhaustion from malicious or malfunctioning clients.

### Least Privilege
The Agent Controller runs as a non-privileged user (`hermesuser`) within the Docker container to minimize the impact of any potential container escape.

---

## 15. Contributing Guidelines
1.  **Feature Branching**: Create a branch for every new tool or UI component.
2.  **Documentation**: Any change to the `Symmetry Loop` must be reflected in the `system_instructions.txt`.
3.  **Testing**: No PR is accepted without a corresponding test case in `integration_test.py`.

---

## 16. Appendix
- **Gemini Flash Live Docs**: [Google AI Studio]
- **FastAPI Docs**: [fastapi.tiangolo.com]
- **Web Audio API Spec**: [developer.mozilla.org]
