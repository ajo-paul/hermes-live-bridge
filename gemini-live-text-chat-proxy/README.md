# Gemini Live Text Chat Proxy (L2T Proxy)

An experimental, highly-optimized low-latency proxy converting the dynamic bidirectional Gemini Live API into a sleek real-time text and speech workspace.

It features dual subtitles, emotional styling cues, adaptive model fallback mechanisms, live visualizer tracking, and fully-integrated real-time microphone streaming with granular mute options. The application has been fully styled using a pristine minimalist aesthetic consisting of stark whites, charcoal grays, deep blacks, and transparent overlays.

---

## Technical Highlights

- **Multimodal Audio Transport**: Captures client microphone inputs in real-time, downsamples them down to 16kHz 16-bit little-endian mono PCM, encodes to base64, and proxies it through WebSocket tunnels directly to Gemini Live services.
- **Dynamic Resilient Fallbacks**: Auto-handles potential rate limiting or API outages by dynamically failing over to backup engines and keeping conversations stream-alive.
- **Adaptive UI Aesthetics**: Employs responsive text flow using mood-derived visual heuristics based on output punctuation and patterns.
- **No-Bloat CSS**: Styled completely using Tailwind CSS v4 with zero-dependency layout transitions and high-contrast styling markers.

---

## Local Configuration Flow

Before running, make sure to set up your environment configuration.

### 1. Requirements
Ensure you have the following installed on your machine:
- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher)

### 2. Set Up Environment Variables
Create a file named `.env` in the root directory (or rename `.env.example` if available) and insert your server-side secrets:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

*Note: Clean API key management runs entirely server-side. The key is never exposed to the client browser.*

---

## Instructions to Run Locally

Follow these sequential commands to boot up the application in a local development environment:

### Installation
Pull all required packages and dependencies into your workstation:
```bash
npm install
```

### Run in Development Mode
Launches the full-stack system with direct hot-reloading for client assets:
```bash
npm run dev
```
Once initialized, visit your browser at:
`http://localhost:3000`

### Build the Production Application
Compiles the React frontend using Vite and bundles the TypeScript backend code using esbuild into a streamlined standalone executable:
```bash
npm run build
```

### Start the Build in Production Mode
Launches the fully optimized compiled container asset:
```bash
npm run start
```

---

## Guide for AI Agents and Automated Tools

If you are an AI assistant, developer bot, or automation script working on this codebase, observe the following rules:

1. **Development Port Configuration**: The proxy is hardcoded to run on **port 3000** for compatibility with modern container routing layers. Do not modify or override `PORT = 3000` or attempt to run the development server on other interfaces.
2. **TypeScript Declarations**: Central types are stored clearly in `src/types.ts`. Before extending components, consult the local definitions first rather than creating redundant definitions inline.
3. **Gemini Live Gateway**: All real-time interactive streams go through WebSocket frames handled in `server.ts`. Client input messages containing `type: 'audio_input'` are proxied to Gemini Live using appropriate `realtimeInput` schema constructs.
4. **HMR States**: Hot Module Replacement is actively bypassed using standard configuration constraints in continuous integration. It is recommended to refresh manually or restart the dev server via `npm run dev` if structural changes are made to the WebSocket state machines in `server.ts`.
