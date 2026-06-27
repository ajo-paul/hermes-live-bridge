export interface ChatMessage {
  id: string;
  role: 'user' | 'model'; // 'model' is used by proxy, let's keep it for compatibility
  text: string;
  originalText?: string;
  translation?: string;
  isInterrupted?: boolean;
  timestamp: number | Date; // Modified to accept both for compatibility
  emotion?: 'excited' | 'thoughtful' | 'calm' | 'apologetic' | 'normal';
  groundingQueries?: string[];
  groundingChunks?: Array<{ title: string; uri: string }>;
  sender?: 'user' | 'agent'; // For legacy Hermes compatibility
}

export type FillerFilterMode = 'raw' | 'stripped';
export type TranslationMode = 'direct' | 'dual' | 'none';

export interface ConnectorSettings {
  model: string;
  systemInstruction: string;
  responseModality: 'TEXT' | 'AUDIO';
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
  translationMode: TranslationMode;
  targetLanguage: string;
  fillerMode: FillerFilterMode;
  emotionFormatting: boolean;
  autoInterrupt: boolean;
  googleSearchGrounding: boolean;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  latencyMs: number;
  packetsSent: number;
  packetsReceived: number;
  activeSessionTime: number;
  error?: string;
  activeModel?: string;
  fallbackActive?: boolean;
  fallbackReason?: string;
}

export interface LiveAPIConfig {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  responseModalities?: string[];
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface ClientToServerMessage {
  type: string;
  content?: string;
  [key: string]: any;
}

export interface ServerToClientMessage {
  type: string;
  content: string;
  level?: string;
  [key: string]: any;
}
