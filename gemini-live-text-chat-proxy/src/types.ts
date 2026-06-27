export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  originalText?: string; // If translated, holds original
  translation?: string;  // holds translated text
  isInterrupted?: boolean;
  timestamp: Date;
  emotion?: 'excited' | 'thoughtful' | 'calm' | 'apologetic' | 'normal';
  groundingQueries?: string[];
  groundingChunks?: Array<{ title: string; uri: string }>;
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
  activeSessionTime: number; // in seconds
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
