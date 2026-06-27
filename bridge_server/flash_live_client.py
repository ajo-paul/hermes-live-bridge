import asyncio
import os
import json
import logging
import websockets
import base64
from typing import Optional
from enum import Enum

class ConnectionState(Enum):
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RECONNECTING = "RECONNECTING"
    FAILED = "FAILED"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FlashLiveClient")

class FlashLiveClient:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.uri_template = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={key}"
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.incoming_queue = asyncio.Queue()
        self.is_running = False
        self.status = ConnectionState.FAILED
        
        fallback_models_env = os.getenv("FALLBACK_MODELS")
        if fallback_models_env:
            self.fallback_models = [m.strip() for m in fallback_models_env.split(",")]
        else:
            self.fallback_models = [
                "gemini-3.1-flash-live-preview", 
                "gemini-2.5-flash-native-audio-latest"
            ]
        self.active_model = self.fallback_models[0]
        self.model_index = 0
        self.response_modality = "AUDIO"
        self.voice_name = "Puck"
        self.system_instruction = ""
        
        self.fallback_active = False
        self.fallback_reason = ""
        self.retry_count = 0
        self.MAX_RETRIES = 3

    async def apply_settings(self, settings: dict):
        self.active_model = settings.get("model", self.active_model)
        self.response_modality = settings.get("responseModality", "AUDIO")
        self.voice_name = settings.get("voiceName", "Puck")
        self.system_instruction = settings.get("systemInstruction", "")
        
        # If we have an active websocket, close it to force a reconnect with new settings
        if self.websocket:
            logger.info("Closing Gemini Live WebSocket to apply new settings...")
            await self.websocket.close()

    async def connect(self, is_reconnect=False):
        backoff = 1.0
        max_backoff = 60.0
        
        if not is_reconnect:
            self.retry_count = 0
            
        while True:
            try:
                if not self.api_key:
                    logger.error("GEMINI_API_KEY environment variable is not set.")
                    self.status = ConnectionState.FAILED
                    await asyncio.sleep(10)
                    continue

                if self.status == ConnectionState.FAILED:
                    self.status = ConnectionState.CONNECTING
                else:
                    self.status = ConnectionState.RECONNECTING

                logger.info(f"Connecting to Gemini Live with model {self.active_model}...")
                
                uri = self.uri_template.format(key=self.api_key)
                
                kwargs = {
                    "ping_interval": 20,
                    "ping_timeout": 10,
                    "additional_headers": {
                        "x-goog-api-client": "google-genai-sdk/2.8.0 gl-node/v22.22.2",
                        "user-agent": "google-genai-sdk/2.8.0 gl-node/v22.22.2"
                    }
                }

                async with websockets.connect(uri, **kwargs) as ws:
                    self.websocket = ws
                    self.is_running = True
                    self.status = ConnectionState.CONNECTED
                    backoff = 1.0
                    self.retry_count = 0
                    logger.info("Connected to Gemini Live API.")
                    
                    await self.send_setup()
                    await self._listen_loop()
                    
            except Exception as e:
                self.is_running = False
                self.websocket = None
                self.status = ConnectionState.FAILED
                logger.error(f"WebSocket connection error: {e}. Retrying in {backoff} seconds...")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, max_backoff)

    async def send_setup(self):
        system_instruction = self.system_instruction
        if not system_instruction:
            try:
                with open("bridge_server/system_instructions.txt", "r") as f:
                    system_instruction = f.read()
            except FileNotFoundError:
                logger.warning("system_instructions.txt not found. Using empty instructions.")

        setup_msg = {
            "setup": {
                "model": f"models/{self.active_model}",
                "generationConfig": {
                    "responseModalities": [self.response_modality],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": self.voice_name
                            }
                        }
                    }
                },
                "systemInstruction": {
                    "parts": [{"text": system_instruction}]
                },
                "outputAudioTranscription": {}
            }
        }
        await self.send_message(setup_msg)
        logger.info("Sent setup message.")

    async def send_message(self, message: dict):
        if self.websocket and self.is_running:
            try:
                await self.websocket.send(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message: {e}")
        else:
            logger.warning("Cannot send message: WebSocket not connected.")

    async def send_text(self, text: str):
        msg = {
            "client_content": {
                "turns": [{"role": "user", "parts": [{"text": text}]}],
                "turn_complete": True
            }
        }
        await self.send_message(msg)

    async def send_audio(self, audio_bytes: bytes):
        encoded_audio = base64.b64encode(audio_bytes).decode('utf-8')
        msg = {
            "realtime_input": {
                "media_chunks": [{"mime_type": "audio/pcm", "data": encoded_audio}]
            }
        }
        await self.send_message(msg)

    async def _listen_loop(self):
        try:
            async for raw_message in self.websocket:
                try:
                    data = json.loads(raw_message)
                    
                    # 1. Preserve tool calls for main.py intent parser
                    if data.get("tool_call"):
                        await self.incoming_queue.put(raw_message)
                        continue
                        
                    server_content = data.get("serverContent")
                    if server_content:
                        # Handle modelTurn parts
                        model_turn = server_content.get("modelTurn")
                        if model_turn:
                            parts = model_turn.get("parts", [])
                            for part in parts:
                                if "text" in part:
                                    await self.incoming_queue.put(json.dumps({
                                        "type": "text_chunk",
                                        "content": part["text"]
                                    }))
                                if "inlineData" in part:
                                    await self.incoming_queue.put(json.dumps({
                                        "type": "audio",
                                        "content": part["inlineData"]["data"]
                                    }))
                                    
                        # Handle outputTranscription
                        output_transcription = server_content.get("outputTranscription")
                        if output_transcription:
                            text = output_transcription.get("text")
                            if text:
                                await self.incoming_queue.put(json.dumps({
                                    "type": "text_chunk",
                                    "content": text
                                }))
                                
                        # Handle groundingMetadata
                        grounding_metadata = server_content.get("groundingMetadata")
                        if grounding_metadata:
                            await self.incoming_queue.put(json.dumps({
                                "type": "grounding_metadata",
                                "webSearchQueries": grounding_metadata.get("webSearchQueries", []),
                                "groundingChunks": grounding_metadata.get("groundingChunks", [])
                            }))
                            
                        # Handle turnComplete
                        if server_content.get("turnComplete"):
                            await self.incoming_queue.put(json.dumps({
                                "type": "turn_complete"
                            }))
                            
                        # Handle interrupted
                        if server_content.get("interrupted"):
                            await self.incoming_queue.put(json.dumps({
                                "type": "interrupted"
                            }))
                    else:
                        # Forward any other messages raw
                        await self.incoming_queue.put(raw_message)
                except json.JSONDecodeError:
                    await self.incoming_queue.put(raw_message)
                except Exception as e:
                    logger.error(f"Error parsing Gemini Live message: {e}")
                    await self.incoming_queue.put(raw_message)
        except websockets.ConnectionClosed as e:
            logger.info(f"Gemini API connection closed. Code: {e.code}, Reason: {e.reason}")
            
            reason_str = str(e.reason).lower() if e.reason else ""
            
            if e.code != 1000:
                self.fallback_active = True
                self.model_index = (self.model_index + 1) % len(self.fallback_models)
                self.active_model = self.fallback_models[self.model_index]
                self.fallback_reason = f"Connection lost. Switched to model index {self.model_index}: {self.active_model}"
                logger.warning(f"[FALLBACK ACTIVE]: {self.fallback_reason}")
                
        finally:
            self.is_running = False

    async def get_next_message(self):
        return await self.incoming_queue.get()

    async def send_tool_response(self, call_id: str, output: str):
        msg = {
            "tool_response": {
                "function_responses": [{"id": call_id, "response": {"result": output}}]
            }
        }
        await self.send_message(msg)
