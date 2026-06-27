import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ClientToServerMessage, 
  ServerToClientMessage, 
  ChatMessage,
  LogEntry
} from '../types';

export function useLiveBridge() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>('Disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Isolated Audio Playback context and queue
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackQueue = useRef<Float32Array[]>([]);
  const isPlaying = useRef(false);

  // Ref to track current model message bubble being streamed
  const currentModelMessageRef = useRef<ChatMessage | null>(null);

  const initPlaybackContext = () => {
    if (!playbackAudioContextRef.current) {
      playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (playbackAudioContextRef.current.state === 'suspended') {
      playbackAudioContextRef.current.resume();
    }
  };

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws/live';
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to Bridge');
      setIsConnected(true);
      setStatus('Connected');
      reconnectAttemptsRef.current = 0; // Reset on successful connect
    };

    ws.onclose = () => {
      console.log('Bridge connection closed');
      setIsConnected(false);
      setStatus('Disconnected');
      
      // Reconnect with exponential backoff (max 30s)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Connection Error');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerToClientMessage;
      
      switch (data.type) {
        case 'status':
          setStatus(data.content);
          break;
        case 'agent_log':
          setLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: data.level || "INFO",
            message: data.content,
          }]);
          break;
        case 'agent_response':
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            sender: 'agent',
            role: 'model',
            text: data.content,
            timestamp: Date.now(),
          }]);
          break;
        case 'text_chunk':
          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];
            const textContent = data.content || '';
            
            if (last && last.role === 'model' && currentModelMessageRef.current?.id === last.id) {
              const updatedLast = {
                ...last,
                text: last.text + textContent
              };
              list[list.length - 1] = updatedLast;
              currentModelMessageRef.current = updatedLast;
              return list;
            } else {
              const newMsg: ChatMessage = {
                id: Date.now().toString(),
                sender: 'agent',
                role: 'model',
                text: textContent,
                timestamp: Date.now(),
              };
              currentModelMessageRef.current = newMsg;
              return [...list, newMsg];
            }
          });
          break;
        case 'turn_complete':
          currentModelMessageRef.current = null;
          break;
        case 'interrupted':
          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === 'model') {
              list[list.length - 1] = {
                ...last,
                isInterrupted: true
              };
            }
            return list;
          });
          currentModelMessageRef.current = null;
          // Clear any pending audio playback
          playbackQueue.current = [];
          break;
        case 'grounding_metadata':
          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === 'model') {
              list[list.length - 1] = {
                ...last,
                groundingQueries: data.webSearchQueries || [],
                groundingChunks: data.groundingChunks || []
              };
            }
            return list;
          });
          break;
        case 'audio':
          handleIncomingAudio(data.content);
          break;
        case 'status_summary':
          console.log('Status Summary received:', data.content);
          break;
      }
    };
  }, []);

  const handleIncomingAudio = (base64Audio: string) => {
    initPlaybackContext();

    // Decode Base64 to Int16 PCM
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Data = new Int16Array(bytes.buffer);

    // Convert Int16 to Float32 for Web Audio API
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    playbackQueue.current.push(float32Data);
    
    if (!isPlaying.current) {
      playNextChunk();
    }
  };

  const playNextChunk = async () => {
    if (playbackQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const chunk = playbackQueue.current.shift();
    if (!chunk) return;

    initPlaybackContext();
    const audioContext = playbackAudioContextRef.current!;
    const buffer = audioContext.createBuffer(1, chunk.length, 24000);
    buffer.copyToChannel(chunk as any, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      playNextChunk();
    };
    
    source.start();
  };

  const sendMessage = useCallback((msg: ClientToServerMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
      
      if (msg.type === 'text') {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: 'user',
          role: 'user',
          text: msg.content || '',
          timestamp: Date.now(),
        }]);
      }
    } else {
      console.error('WebSocket not connected');
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopAudioCapture();
      setIsRecording(false);
    } else {
      try {
        await startAudioCapture();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Could not access microphone. Please check permissions.");
      }
    }
  }, [isRecording]);

  const startAudioCapture = async () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000,
    });
    audioContextRef.current = audioContext;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);

    // AudioWorklet string injected via Blob to avoid requiring an external file
    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0) {
            const channelData = input[0];
            const pcmData = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
              const s = Math.max(-1, Math.min(1, channelData[i]));
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcmData);
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (e) => {
      const pcmData = e.data; // Int16Array
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'audio', content: base64Audio }));
      }
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
  };

  const stopAudioCapture = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.onclose = null; // prevent reconnect loop on unmount
        socketRef.current.close();
      }
      stopAudioCapture();
    };
  }, [connect]);

  return {
    messages,
    status,
    isConnected,
    logs,
    sendMessage,
    isRecording,
    toggleRecording
  };
}