import React, { useState, useEffect, useRef } from 'react';
import { ConnectionState, ConnectorSettings, ChatMessage } from './types';
import ConnectionStats from './components/ConnectionStats';
import WaveVisualizer from './components/WaveVisualizer';
import SettingsPanel from './components/SettingsPanel';
import ChatArea from './components/ChatArea';
import Console from './components/Console';
import ErrorBoundary from './components/ErrorBoundary';
import { useLiveBridge } from './hooks/useLiveBridge';

const DEFAULT_SETTINGS: ConnectorSettings = {
  model: 'gemini-3.1-flash-live-preview',
  systemInstruction: "You are an autonomous Hermes agent. Use tools to solve tasks.",
  responseModality: 'AUDIO',
  voiceName: 'Puck',
  translationMode: 'none',
  targetLanguage: 'Original',
  fillerMode: 'raw',
  emotionFormatting: true,
  autoInterrupt: false,
  googleSearchGrounding: false
};

const AppContent: React.FC = () => {
  const { messages: rawMessages, status: bridgeStatus, isConnected, logs, sendMessage, isRecording, toggleRecording } = useLiveBridge();
  
  const [settings, setSettings] = useState<ConnectorSettings>(DEFAULT_SETTINGS);
  const [connection, setConnection] = useState<ConnectionState>({
    status: isConnected ? 'connected' : 'disconnected',
    latencyMs: 35,
    packetsSent: 0,
    packetsReceived: 0,
    activeSessionTime: 0,
    activeModel: 'gemini-3.1-flash-live-preview'
  });
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Sync bridge connection state to the UI connection state
  useEffect(() => {
    setConnection(prev => ({
      ...prev,
      status: isConnected ? 'connected' : 'disconnected',
      // If we receive a string status that looks like an error, map it
      error: bridgeStatus.toLowerCase().includes('error') ? bridgeStatus : undefined
    }));
  }, [isConnected, bridgeStatus]);

  // Hot apply settings to active socket payload on configuration change
  useEffect(() => {
    if (isConnected) {
      console.log('📤 Sending updated setup settings to proxy...');
      sendMessage({
        type: 'setup',
        settings: settings
      });
    }
  }, [settings, isConnected, sendMessage]);

  // Sync Hermes messages to ChatArea messages format
  useEffect(() => {
    const formattedMessages: ChatMessage[] = rawMessages.map(msg => ({
      id: msg.id,
      role: msg.sender === 'user' ? 'user' : 'model',
      text: msg.text,
      timestamp: msg.timestamp,
      emotion: 'normal'
    }));
    setMessages(formattedMessages);
  }, [rawMessages]);

  const handleConnect = () => {
    // In Hermes, useLiveBridge automatically connects on mount and handles reconnects
    // We can just trigger a status check to verify connection
    sendMessage({ type: 'get_status' });
  };

  const handleDisconnect = () => {
    // Cannot natively disconnect from hook easily without unmounting
  };

  const handleSendMessage = () => {
    if (!inputVal.trim() || !isConnected) return;
    sendMessage({ type: 'text', content: inputVal.trim() });
    setInputVal('');
  };

  const handleInterrupt = () => {
    // Logic for interrupting agent
    sendMessage({ type: 'interrupt' });
    setIsStreaming(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 font-sans flex flex-col relative overflow-x-hidden select-none">
      {/* Modern Main Header HUD Panel */}
      <header className="border-b border-white/5 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.5)]"></div>
            <h1 className="text-xs font-bold tracking-widest uppercase text-white flex items-center gap-2">
              <span>Hermes-Live Bridge</span>
              <span className="text-zinc-600 font-mono tracking-wider">
                v2.0 HUD
              </span>
            </h1>
          </div>

          <div className="flex space-x-6 text-[10px] uppercase tracking-tighter">
            <div className="hidden sm:flex flex-col">
              <span className="text-zinc-600">Protocol</span>
              <span className="text-zinc-200">WebSocket / WSS</span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-zinc-600">Status</span>
              <span className={connection.status === 'connected' ? 'text-emerald-400' : 'text-rose-400'}>
                {connection.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Stage */}
      <main className="flex-1 w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        {/* Left Console Configuration Board */}
        <section className="lg:col-span-3 space-y-4">
          <SettingsPanel 
            settings={settings}
            onSettingsChange={setSettings}
            onReconnect={handleConnect}
            onDisconnect={handleDisconnect}
            connectionStatus={connection.status}
            connectionError={connection.error}
          />
          <WaveVisualizer 
            status={connection.status}
            isStreaming={isStreaming}
            isAudioMode={true}
          />
          <ConnectionStats state={connection} />
        </section>

        {/* Middle Active Pipeline Workspace */}
        <section className="lg:col-span-5 space-y-4 flex flex-col h-full max-h-[85vh]">
          {/* NOTICE & FALLBACK RECOVERY BANNER */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs tracking-wide transition-all ${
            connection.fallbackActive 
              ? 'bg-zinc-900 border-zinc-700 text-zinc-100 shadow-[0_0_15px_rgba(255,255,255,0.02)]' 
              : 'bg-[#080808] border-white/5 text-zinc-300'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                connection.status === 'connected' 
                  ? (connection.fallbackActive ? 'bg-zinc-400 animate-pulse' : 'bg-emerald-400 animate-pulse') 
                  : 'bg-zinc-600'
              }`} />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">ACTIVE ENGINE:</span>
                  <span className="font-semibold text-zinc-100 font-mono">
                    {connection.activeModel || settings.model}
                  </span>
                  {connection.fallbackActive && (
                    <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 text-[8px] font-bold uppercase rounded tracking-wider animate-pulse">
                      FAILOVER ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                  {connection.fallbackActive 
                    ? connection.fallbackReason 
                    : "Using Primary Hermes Live Agent Engine. Ready to execute commands."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatArea 
              messages={messages}
              inputValue={inputVal}
              onInputChange={setInputVal}
              onSendMessage={handleSendMessage}
              onInterrupt={handleInterrupt}
              isStreaming={isStreaming}
              status={connection.status}
              isAudioMode={true}
              isMicMuted={!isRecording}
              onToggleMicMute={toggleRecording}
              micError={micError}
            />
          </div>
        </section>

        {/* Right Console - Agent Logs */}
        <section className="lg:col-span-4 h-full max-h-[85vh]">
            <Console logs={logs} />
        </section>
      </main>

      {/* Decorative Bottom Credits */}
      <footer className="px-6 py-3 border-t border-white/5 bg-black/80 flex items-center justify-between text-[10px] font-mono text-zinc-600">
        <div className="flex space-x-6">
          <span>PORT: 3000 (SECURE)</span>
          <span className="hidden sm:inline">AGENT STATE: {bridgeStatus}</span>
        </div>
        <div className="flex space-x-4 items-center">
          <span className="text-zinc-400 uppercase">Hermes Autonomous Systems</span>
          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">ENCRYPTED</span>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
