# Hermes-Live Bridge

Hermes-Live Bridge is a high-performance WebSocket bridge that connects the Gemini Multimodal Live API (Flash Live) with the Hermes Agent, allowing a multimodal AI to execute real-world tasks in a workspace.

## Project Overview

The bridge enables:
- **Multimodal Input**: User sends text and audio to the bridge, which forwards it to Gemini Flash Live.
- **Task Execution**: When Gemini Flash Live decides to use a tool (detected as a "Hermes Agent" intent), the bridge intercepts the request and forwards it to the Hermes Agent for execution.
- **Real-time Status**: The bridge tracks task states and provides heartbeat status updates to the user during long-running agent tasks.
- **Bidirectional Flow**: 
  - `User <--> Bridge Server <--> Gemini Flash Live API`
  - `Bridge Server <--> Hermes Agent`

## Setup Instructions

### Prerequisites
- Python 3.10+
- Docker and Docker Compose

### Running with Docker Compose
1. Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   HERMES_TOKEN=your_hermes_token_here
   AGENT_URL=http://hermes_agent:8080
   ```
2. Start the services:
   ```bash
   docker-compose up --build
   ```

### Local Development
1. Install dependencies:
   ```bash
   pip install -r bridge_server/requirements.txt
   ```
2. Run the server:
   ```bash
   python bridge_server/main.py
   ```

## Protocol Specification

### User $\rightarrow$ Bridge Server
| Message Type | Payload | Description |
|---|---|---|
| `text` | `{"type": "text", "content": "..."}` | Send a text prompt to Gemini |
| `audio` | `{"type": "audio", "content": "base64_pcm"}` | Send audio chunks to Gemini |
| `get_status` | `{"type": "get_status"}` | Request current task status summary |

### Bridge Server $\rightarrow$ User
| Message Type | Payload | Description |
|---|---|---|
| `status` | `{"type": "status", "content": "..."}` | Heartbeat or simple status update |
| `status_summary` | `{"type": "status_summary", "content": "..."}` | Full summary of active/completed tasks |
| `agent_response` | `{"type": "agent_response", "content": "...", "full_result": {...}}` | Result of a Hermes Agent task |
| `(raw)` | (JSON string from Gemini) | Direct forwarding of Gemini's multimodal response |

### Bridge Server $\rightarrow$ Hermes Agent
The bridge calls the `/execute` endpoint of the Hermes Agent:
- **Endpoint**: `POST {AGENT_URL}/execute`
- **Header**: `X-Hermes-Token: {HERMES_TOKEN}`
- **Payload**: `{"prompt": "..."}`

## Troubleshooting

- **Connection Issues**: Check if `GEMINI_API_KEY` is correct and the network allows WebSocket connections to `generativelanguage.googleapis.com`.
- **Agent Failures**: Verify the Hermes Agent is running and `AGENT_URL` is reachable from the bridge server.
- **Malformed JSON**: The bridge handles malformed JSON by falling back to raw text forwarding.
- **Disconnections**: The bridge automatically attempts to reconnect to the Gemini API if the connection is dropped.
