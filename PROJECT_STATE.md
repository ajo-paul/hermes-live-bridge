# Project State Document: Hermes-Live Bridge

## 1. Project Essence
**Hermes-Live Bridge** is a high-performance multimodal orchestration system that enables a "hands-free" coding experience. It bridges the **Gemini 2.0 Flash Live API** (voice/multimodal interface) with a Dockerized **Hermes Agent** (reasoning and execution engine powered by Gemma 4 31B), allowing a user to drive complex software engineering tasks via real-time voice commands.

### Core Workflow (The Symmetry Loop)
`User Voice` $\rightarrow$ `React Frontend` $\rightarrow$ `Bridge Server (FastAPI)` $\rightarrow$ `Gemini Flash Live` $\rightarrow$ `Tool Call` $\rightarrow$ `Bridge Server` $\rightarrow$ `Hermes Agent` $\rightarrow$ `Local Filesystem` $\rightarrow$ `Result` $\rightarrow$ `Gemini Flash` $\rightarrow$ `User Audio Response`.

---

## 2. Architecture & Components

### A. The Interaction Layer (Frontend - `/client`)
- **Tech**: React 18, TypeScript, Vite.
- **Responsibility**: Captures audio (PCM 16kHz Mono), encodes to Base64, and maintains a WebSocket connection to the Bridge Server.

### B. The Orchestration Layer (Bridge Server - `/bridge_server`)
- **Tech**: Python 3.11, FastAPI, WebSockets, `httpx`.
- **Key Modules**:
    - `main.py`: Entry point; manages dual-websocket forwarding (User $\leftrightarrow$ Gemini) and intercepts agent intents.
    - `flash_live_client.py`: Handles the low-level WebSocket protocol for Gemini Flash Live.
    - `intent_parser.py`: Extracts tool calls from Gemini's multimodal responses.
    - `state_manager.py`: Manages session state and task lifecycle using a local SQLite DB (`session_state.db`).
- **Features**: Rate limiting (`slowapi`), exponential backoff for agent calls, and asynchronous heartbeat polling for task status.

### C. The Execution Layer (Hermes Agent - `/hermes_agent`)
- **Tech**: Python, Gemma 4 31B.
- **Responsibility**: Operates in a secure Docker sandbox. Receives prompts via `/execute`, performs reasoning, uses tools to modify files, and returns results.
- **Key Logic**: `smart_edit_logic.py` for targeted, non-destructive file modifications.

---

## 3. Technical Stack Summary
| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Web Audio API |
| **Backend** | Python 3.11, FastAPI, WebSockets |
| **LLMs** | Gemini 2.0 Flash (Voice/UI), Gemma 4 31B (Reasoning) |
| **Database** | SQLite (Short-term session state) |
| **Knowledge** | Markdown files (`TASKS.md`, `PROGRESS.md`) |
| **Infra** | Docker, Docker Compose |

---

## 4. Security Model (CRITICAL)
The system is designed for high-agency autonomous execution, making security paramount:
- **Shared Secret**: All Bridge $\leftrightarrow$ Agent communication is authenticated via the `X-Hermes-Token` header.
- **Path Sandboxing**: Strict sanitization prevents any file operation outside the `PROJECT_ROOT` (`/app/hermes-live-bridge`).
- **RCE Prevention**: No `shell=True` in Python subprocesses; all commands must pass through a verified `TOOL_REGISTRY`.
- **Protected Files**: The agent is explicitly blocked from reading/writing critical files: `.env`, `docker-compose.yml`, `Dockerfile`, `main.py`, `agent_controller.py`.
- **Privilege Drop**: The agent runs as a non-root user (`hermesuser`) inside the container.

---

## 5. Current Project State

### Status: FINAL POLISHING / HARDENING
The core feature set is complete. The system is currently in Phase 8: Testing & CI.

### Completed Milestones:
- [x] Infrastructure & Dockerization.
- [x] Multimodal Bridge Server & Gemini Integration.
- [x] Full-stack React Frontend.
- [x] Agent Controller with `smart_edit` and Tool Registry.
- [x] Professional Tooling (Aider, Playwright, Bandit, Mypy).
- [x] Security Hardening (Sandboxing, Rate Limiting).
- [x] Reliability (Async state db, Connection Enums, Backoff reconnects).

### Pending Tasks (Phase 8):
- [ ] **Unit Testing**: Write tests for Intent Parser, State Manager, and Path Traversal checks.
- [ ] **Integration Testing**: Expand traversal security validation suite.
- [ ] **CI/CD**: Configure the CI workflow runner.

---

## 6. Guide for the Developer AI

### How to Approach Changes
1. **Plan First**: Before modifying code, update `TASKS.md` with the specific goal.
2. **Symmetry Check**: If changing the data flow, ensure the change is reflected in the "Symmetry Loop" described in `developer_docs.md`.
3. **Security First**: Any new tool added to the agent must be vetted for RCE and path traversal risks.
4. **Verify**: Always run the integration suite (`bash /app/hermes-live-bridge/tests/run_tests.sh`) after changes.
5. **Document**: Log architectural decisions in `DECISIONS.md` and progress in `PROGRESS.md`.

### Key Files for Reference
- `README.md`: High-level overview and setup.
- `developer_docs.md`: Technical architecture and API specs.
- `TASKS.md` / `PROGRESS.md`: Current roadmap and history.
- `bridge_server/main.py`: The heart of the orchestration logic.
- `hermes_agent/agent_controller.py`: The agent's execution engine.
