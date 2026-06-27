# PRD: Core Infrastructure Hardening

## Overview
Transform the Hermes-Live Bridge from a synchronous-style implementation into a truly asynchronous, session-isolated, and robust orchestration engine.

## Objectives & Requirements

| Goal | User Story | Functional Requirement |
| :--- | :--- | :--- |
| **Async Execution** | **US-001**: Server remains responsive during long agent tasks. | **FR-1**: Use `asyncio.create_subprocess_exec` in `tool_shell`.<br>**FR-2**: Read `stdout`/`stderr` asynchronously. |
| **Session Isolation** | **US-002**: Users receive only their own status updates. | **FR-3**: Pass session-specific queues to `/execute`.<br>**FR-4**: Instantiate per-session queues in `main.py`. |
| **Robust Editing** | **US-003**: Precise modifications via context-aware diffs. | **FR-5**: Implement block-based search-and-replace for `smart_edit`. |
| **Stable Deps** | **US-004**: Predictable environment without introspection. | **FR-6**: Pin `websockets` version and unify `connect` calls. |
| **DB Optimization** | **US-005**: Reduce connection overhead. | **FR-7**: Use a persistent `aiosqlite` connection in `SessionStateManager`. |
| **Reliability** | **N/A** | **FR-8**: Implement a prioritized fallback model list. |

## Non-Goals
- Migration to Redis.
- Frontend UI changes.
- Implementation of a full Git-based versioning system for file edits.

## Technical Considerations
- **Subprocess I/O**: Use `asyncio.gather` to concurrently read `stdout` and `stderr` from the subprocess to avoid buffer deadlocks.
- **Smart Edit Format**: Define a clear convention for how Gemini should send "search" and "replace" blocks (e.g., using delimiters).
- **SQLite Concurrency**: Ensure the persistent connection is handled correctly with `aiosqlite` to avoid threading/async conflicts.

## Success Metrics
- **Responsiveness**: Zero perceived lag in WebSocket heartbeats during a 30-second shell execution.
- **Isolation**: 100% separation of status updates between two concurrent sessions.
- **Accuracy**: `smart_edit` succeeds on files with 3+ identical strings but different contexts.
- **Stability**: No `AttributeError` or `TypeError` during `websockets.connect` across different environments.

## Open Questions
- Should the `smart_edit` blocks be enforced via a specific JSON schema for the agent's tool call?
- What is the ideal timeout for the `smart_edit` search operation on very large files?
