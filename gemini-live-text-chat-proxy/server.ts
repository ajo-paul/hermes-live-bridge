import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Ensure API key is present
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is not defined in environment variables. Live API calls may fail.');
}

// Initialise GoogleGenAI with custom User-Agent for modern standard telemetry tracking
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

function appendWithSmartSpacing(existingText: string, newChunk: string): string {
  if (!existingText) return newChunk;
  if (!newChunk) return existingText;
  
  const lastChar = existingText.charAt(existingText.length - 1);
  const firstChar = newChunk.charAt(0);
  
  if (lastChar !== ' ' && firstChar !== ' ') {
    const isWordChar = (ch: string) => /[a-zA-Z0-9_'\u00C0-\u017F]/.test(ch);
    const isPunct = (ch: string) => /[.,!?;:]/.test(ch);
    
    if ((isWordChar(lastChar) && isWordChar(firstChar)) || (isPunct(lastChar) && isWordChar(firstChar))) {
      return existingText + ' ' + newChunk;
    }
  }
  return existingText + newChunk;
}

app.use(express.json());

// API: Health probe
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!GEMINI_API_KEY,
    appUrl: APP_URL,
    timestamp: new Date().toISOString()
  });
});

// API: Subtitled translation layer
app.post('/api/translate', async (req, res) => {
  const { text, targetLanguage } = req.body;
  try {
    if (!text || !targetLanguage || targetLanguage === 'Original') {
      return res.json({ translatedText: text || '' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Translate the following conversational text strictly into ${targetLanguage}. Return ONLY the direct translated phrase/sentences, without any introduction, explanations, or quotes:\n\n${text}`
    });

    res.json({ translatedText: response.text?.trim() || text });
  } catch (error: any) {
    console.error('❌ Translation Error:', error);
    res.json({ translatedText: text || '', error: error.message });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket server for the local frontend client
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs: WebSocket, req) => {
  console.log('🟢 Local frontend WebSocket client connected');

  let geminiWs: WebSocket | null = null;
  let isClosed = false;
  let sessionStartTime = Date.now();
  let baseInstruction = "You are a highly capable conversational AI, powered by the experimental Gemini Live-to-Text translation engine. Respond concisely, casually, and interactively.";

  // Conversation history queue (max 6 turns / 3 round-trips)
  let history: { role: string, parts: any[] }[] = [];
  let lastSettings: any = null;
  let currentModelTurn: string = "";
  let retryCount = 0;
  const MAX_RETRIES = 3;
  let activeModel = 'gemini-3.1-flash-live-preview';
  let fallbackActive = false;
  let fallbackReason = '';

  const connectToGemini = (isReconnect = false) => {
    if (isClosed || !lastSettings) return;
    if (!isReconnect) {
      retryCount = 0;
    }

    const settings = lastSettings;
    const targetLang = settings.targetLanguage || 'English';

    // Direct instruction override based on target language
    let systemInstruction = settings.systemInstruction || baseInstruction;
    
    if (settings.translationMode === 'direct' && targetLang !== 'Original') {
      systemInstruction += `\nCRITICAL CONSTRAINT: You MUST respond strictly in ${targetLang}. Do not write or reply in English under any circumstances. Translate your thoughts completely to ${targetLang}. Use a casual, warm, conversational spoken tone in that language.`;
    } else if (settings.translationMode === 'dual' && targetLang !== 'Original') {
      systemInstruction += `\nCRITICAL CONFLICT CONSTRAINT: You MUST respond in English, but keep your phrasing simple so it can be easily translated.`;
    }

    console.log(`📡 ${isReconnect ? 'Reconnecting' : 'Connecting'} to Gemini Live with model: ${activeModel}`);

    // Establish the outbound WebSocket to Google Generative Language Service
    const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    
    // If there was an old connection, close it first without logging as unexpected
    if (geminiWs && geminiWs.readyState !== WebSocket.CLOSED) {
      geminiWs.removeAllListeners();
      try {
        geminiWs.close();
      } catch(e) {}
    }

    geminiWs = new WebSocket(targetUrl, {
      headers: {
        'x-goog-api-client': 'google-genai-sdk/2.8.0 gl-node/v22.22.2',
        'user-agent': 'google-genai-sdk/2.8.0 gl-node/v22.22.2'
      }
    });

    geminiWs.on('open', () => {
      console.log(`🔌 Connected to Google Gemini Live WebSocket using model ${activeModel}`);
      clientWs.send(JSON.stringify({ 
        type: 'status', 
        status: 'connected',
        activeModel,
        fallbackActive,
        fallbackReason
      }));

      // Construct and transmit the initial SETUP payload
      const setupMsg: any = {
        setup: {
          model: `models/${activeModel}`,
          generationConfig: {
            // Live-Preview models strictly require AUDIO modality; we proxy it and mute on frontend
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } }
            }
          },
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          outputAudioTranscription: {}
        }
      };

      // Only enable Google Search grounding for models other than gemini-3.1-flash-live-preview
      if (activeModel !== 'gemini-3.1-flash-live-preview' && settings.googleSearchGrounding !== false) {
        setupMsg.setup.tools = [
          { googleSearch: {} }
        ];
      }

      geminiWs?.send(JSON.stringify(setupMsg));

      if (isReconnect && history.length > 0) {
        console.log(`🔄 Re-sending history context (${history.length} turns) after connection drop...`);
        geminiWs?.send(JSON.stringify({
          clientContent: {
            turns: history,
            turnComplete: true
          }
        }));
      }
    });

    geminiWs.on('message', (geminiMsgRaw: string) => {
      try {
        if (isClosed) return;
        const geminiData = JSON.parse(geminiMsgRaw);
        
        if (geminiData.serverContent) {
          const serverContent = geminiData.serverContent;
          
          if (serverContent.modelTurn) {
            const parts = serverContent.modelTurn.parts;
            for (const part of parts) {
              if (part.text) {
                currentModelTurn = appendWithSmartSpacing(currentModelTurn, part.text);
                clientWs.send(JSON.stringify({
                  type: 'text_chunk',
                  text: part.text
                }));
              }
              if (part.inlineData) {
                clientWs.send(JSON.stringify({
                  type: 'audio_chunk',
                  audio: part.inlineData.data
                }));
              }
            }
          }

          if (serverContent.outputTranscription) {
            const txt = serverContent.outputTranscription.text;
            if (txt) {
              currentModelTurn = appendWithSmartSpacing(currentModelTurn, txt);
              clientWs.send(JSON.stringify({
                type: 'text_chunk',
                text: txt
              }));
            }
          }

          if (serverContent.groundingMetadata) {
            const gm = serverContent.groundingMetadata;
            const webSearchQueries = gm.webSearchQueries || [];
            const groundingChunks = (gm.groundingChunks || []).map((c: any) => {
              if (c && c.web) {
                return {
                  title: c.web.title || '',
                  uri: c.web.uri || ''
                };
              }
              return null;
            }).filter(Boolean);

            clientWs.send(JSON.stringify({
              type: 'grounding_metadata',
              webSearchQueries,
              groundingChunks
            }));
          }

          if (serverContent.turnComplete) {
            if (currentModelTurn.trim().length > 0) {
              history.push({ role: 'model', parts: [{ text: currentModelTurn }] });
              currentModelTurn = "";
              if (history.length > 6) history = history.slice(-6);
            }
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }

          if (serverContent.interrupted) {
            console.log('⚡ Gemini reported interruption');
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
        }
      } catch (e: any) {
        console.error('❌ Error processing Gemini response frame:', e);
      }
    });

    geminiWs.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : '';
      console.log(`Disconnected from Gemini Live. Code: ${code}, Reason: ${reasonStr}`);
      
      const isQuotaError = code === 1011 || 
                           reasonStr.toLowerCase().includes('quota') || 
                           reasonStr.toLowerCase().includes('limit') || 
                           reasonStr.toLowerCase().includes('billing') ||
                           reasonStr.toLowerCase().includes('exceeded') ||
                           reasonStr.toLowerCase().includes('permission') ||
                           reasonStr.toLowerCase().includes('key') ||
                           reasonStr.toLowerCase().includes('not found') ||
                           reasonStr.toLowerCase().includes('invalid');

      if (!isClosed) {
        // Fallback Mechanism:
        // If has error (or quota/block) and fallback not active yet, switch models dynamically and retry!
        if (code !== 1000 && !fallbackActive) {
          fallbackActive = true;
          const originalModel = activeModel;
          if (originalModel === 'gemini-3.1-flash-live-preview') {
            activeModel = 'gemini-2.5-flash-native-audio-latest';
            fallbackReason = `Primary engine (Gemini 3.1 Flash Live) unavailable due to quota or resource limits. Auto shifted to Secondary (Gemini 2.5 Flash Native Audio).`;
          } else {
            activeModel = 'gemini-3.1-flash-live-preview';
            fallbackReason = `Secondary engine (Gemini 2.5 Flash Native Audio) unavailable due to quota or resource limits. Auto shifted to Primary (Gemini 3.1 Flash Live).`;
          }
          console.warn(`⚠️ [FALLBACK ACTIVE]: ${fallbackReason}`);
          clientWs.send(JSON.stringify({
            type: 'status',
            status: 'connecting',
            activeModel,
            fallbackActive,
            fallbackReason
          }));
          retryCount = 0;
          setTimeout(() => connectToGemini(true), 1500);
          return;
        }

        if (code !== 1000 && !isQuotaError && retryCount < MAX_RETRIES) {
           retryCount++;
           console.log(`🔌 Connection dropped unexpectedly (${code}). Attempting reconnect ${retryCount}/${MAX_RETRIES} in 1.5s...`);
           clientWs.send(JSON.stringify({ 
             type: 'status', 
             status: 'connecting',
             activeModel,
             fallbackActive,
             fallbackReason
           }));
           setTimeout(() => connectToGemini(true), 1500);
        } else {
           let finalMsg = reasonStr;
           if (isQuotaError) {
             finalMsg = `Gemini Live API key quota, billing limit, or authorization permission exceeded. Code: ${code} (${reasonStr || 'Check your Gemini key configuration or billing details'})`;
           } else if (code !== 1000) {
             finalMsg = `Google WebSocket aborted. Code: ${code}. Reason: ${reasonStr || 'Unknown network error'}`;
           } else {
             finalMsg = reasonStr || `WebSocket closed normally (code: ${code})`;
           }
           console.log(`🔌 Stop reconnecting. Sending final status disconnected: ${finalMsg}`);
           clientWs.send(JSON.stringify({ 
             type: 'status', 
             status: 'disconnected', 
             error: finalMsg,
             activeModel,
             fallbackActive,
             fallbackReason
           }));
        }
      }
    });

    geminiWs.on('error', (err) => {
      console.error('❌ Gemini Outbound WebSocket Error:', err);
      // Let the 'close' event handler pick this up and attempt to reconnect.
    });
  };

  // Handle client-to-proxy messages
  clientWs.on('message', (messageRaw: string) => {
    try {
      if (isClosed) return;
      const data = JSON.parse(messageRaw);

      if (data.type === 'setup') {
        lastSettings = data.settings;
        activeModel = lastSettings.model || 'gemini-3.1-flash-live-preview';
        fallbackActive = false;
        fallbackReason = '';
        history = []; // Reset history for a completely fresh explicit setup
        currentModelTurn = "";
        connectToGemini(false);
      } 
      
      else if (data.type === 'message') {
        history.push({ role: 'user', parts: [{ text: data.text }] });
        if (history.length > 6) history = history.slice(-6);

        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          const clientMsg = {
            clientContent: {
              turns: [ { role: 'user', parts: [{ text: data.text }] } ],
              turnComplete: true
            }
          };
          geminiWs.send(JSON.stringify(clientMsg));
        } else {
          clientWs.send(JSON.stringify({ type: 'error', error: 'No active connection to Gemini Live! Buffering and Auto-reconnecting...' }));
          connectToGemini(true);
        }
      } 
      
      else if (data.type === 'audio_input') {
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          const realtimeMsg = {
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm',
                  data: data.data
                }
              ]
            }
          };
          geminiWs.send(JSON.stringify(realtimeMsg));
        }
      }
      
      else if (data.type === 'cancel' || data.type === 'interrupt') {
        console.log('⚡ Client requested manual interruption. Sending empty clientContent signal to Gemini.');
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          const interruptMsg = {
            clientContent: {
               // Per Multimodal Live API, sending ANY clientContent while generating immediately stops the ongoing streaming.
               turns: [],
               turnComplete: true
            }
          };
          geminiWs.send(JSON.stringify(interruptMsg));
        }
      }
    } catch (e: any) {
      console.error('❌ Error in proxy WebSocket receiver:', e);
    }
  });

  clientWs.on('close', () => {
    console.log('🔴 Local frontend WebSocket client disconnected');
    isClosed = true;
    if (geminiWs) {
      geminiWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error('❌ Local client WebSocket error:', err);
  });
});

// Map local server upgrades for WebSocket connections
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
  if (pathname === '/api/live-chat') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    // Let other handlers or Vite websocket do upgrades if active
  }
});

// Serve frontend build output or run Vite dev server
async function serveApp() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🚀 Running in development mode with Vite proxy middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('📦 Running in production mode. Serving static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
  });
}

serveApp();
