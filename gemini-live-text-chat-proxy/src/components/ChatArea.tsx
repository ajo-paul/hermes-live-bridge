import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, ConnectorSettings } from '../types';
import { AlertCircle, Bot, Compass, Globe, Mic, MicOff, Send, Sparkles, User, ChevronDown } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSendMessage: () => void;
  onInterrupt: () => void;
  isStreaming: boolean;
  isThinking: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  isAudioMode: boolean;
  isMicMuted: boolean;
  onToggleMicMute: () => void;
  micError?: string | null;
  theme: 'light' | 'dark';
  settings: ConnectorSettings;
  onSettingsChange: (s: ConnectorSettings) => void;
}

export default function ChatArea({
  messages,
  inputValue,
  onInputChange,
  onSendMessage,
  onInterrupt,
  isStreaming,
  isThinking,
  status,
  isAudioMode,
  isMicMuted,
  onToggleMicMute,
  micError,
  theme,
  settings,
  onSettingsChange
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Handle Enter to submit, and Ctrl/Cmd+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        // Allow inserting new line on Ctrl+Enter, Cmd+Enter, or Shift+Enter
        return;
      }
      // Enter alone sends the message
      e.preventDefault();
      onSendMessage();
    }
  };

  const samplePrompts = [
    { text: "Translate standard idioms into French", icon: "🌐" },
    { text: "Stream a friendly casual voice conversation", icon: "🎙️" },
    { text: "Search web about latest SpaceX starship launch", icon: "🚀" },
    { text: "Give me a calm breathing exercise guide", icon: "🧘" }
  ];

  // Helper to determine text styles based on parsed emotions
  const getEmotionClasses = (msg: ChatMessage) => {
    if (msg.role === 'user') return 'text-zinc-800 dark:text-zinc-200 font-normal leading-relaxed text-base';
    
    switch (msg.emotion) {
      case 'excited':
        return 'text-zinc-900 dark:text-white font-medium leading-relaxed text-[17px] drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]';
      case 'thoughtful':
        return 'text-zinc-700 dark:text-zinc-300 font-light leading-relaxed text-base italic';
      case 'calm':
        return 'text-zinc-600 dark:text-zinc-400 font-normal leading-relaxed text-base';
      case 'apologetic':
        return 'text-zinc-500 dark:text-zinc-500 font-light leading-relaxed text-base italic';
      default:
        return 'text-zinc-900 dark:text-zinc-100 font-normal leading-relaxed text-base';
    }
  };

  const handleModelSelect = (modelId: string) => {
    const updated = { ...settings, model: modelId };
    if (modelId === 'gemini-3.1-flash-live-preview') {
      updated.googleSearchGrounding = false;
    } else {
      updated.googleSearchGrounding = true;
    }
    onSettingsChange(updated);
    setIsModelMenuOpen(false);
  };

  const toggleMicFeature = () => {
    if (status !== 'connected') return;
    if (!isAudioMode) {
      // Enable live audio mode immediately
      onSettingsChange({
        ...settings,
        responseModality: 'AUDIO'
      });
    } else {
      // Toggle mic mute state
      onToggleMicMute();
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* Message Feed Canvas */}
      <div 
        ref={scrollRef}
        className="flex-1 px-4 md:px-12 py-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <div className="h-full max-w-2xl mx-auto flex flex-col justify-center py-10 space-y-8 animate-fade-in">
            <div className="space-y-2">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight bg-gradient-to-r from-blue-600 via-zinc-600 to-zinc-900 dark:from-blue-400 dark:via-zinc-300 dark:to-zinc-500 bg-clip-text text-transparent">
                Ask away, Friend!
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 font-light text-sm md:text-base leading-relaxed">
                Experience Gemini Live-to-Text proxy with clean low-latency conversions. Select your engine, configure the translation layers, and start stream-talking.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => onInputChange(p.text)}
                  className="flex items-start text-left gap-3 p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all rounded-2xl cursor-pointer group"
                >
                  <span className="text-lg shrink-0">{p.icon}</span>
                  <span className="text-xs font-normal text-zinc-700 dark:text-zinc-300 leading-normal group-hover:text-zinc-900 dark:group-hover:text-white">
                    {p.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-8">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 md:gap-6 animate-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* User/Model Avatar Icon */}
                {msg.role === 'model' && (
                  <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-center shrink-0">
                    <Sparkles size={14} className="text-blue-500 dark:text-blue-400" />
                  </div>
                )}

                <div className={`space-y-1.5 max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {/* Speaker Label */}
                  <div className="flex items-center gap-2 opacity-60">
                    <span className="text-[9px] font-mono tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
                      {msg.role === 'user' ? 'CLIENT_USER' : 'GEMINI_ENGINE'}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-600">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Bubble content */}
                  <div className={`${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800/40 px-4 py-2.5 rounded-2xl inline-block shadow-sm' : ''}`}>
                    <p className={`${getEmotionClasses(msg)} whitespace-pre-wrap select-text`}>
                      {msg.text}
                    </p>

                    {/* Subtitle / Translated Overlay layer */}
                    {msg.role === 'model' && msg.translation && (
                      <div className="mt-2.5 opacity-60 italic text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-l-2 border-zinc-300 dark:border-zinc-700 pl-3">
                        {msg.translation}
                      </div>
                    )}

                    {/* Grounding / Search Sources display */}
                    {msg.role === 'model' && ((msg.groundingQueries && msg.groundingQueries.length > 0) || (msg.groundingChunks && msg.groundingChunks.length > 0)) && (
                      <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-white/5 space-y-2 text-xs">
                        {msg.groundingQueries && msg.groundingQueries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[8px] font-bold font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Web Engine:</span>
                            {msg.groundingQueries.map((q, idx) => (
                              <span key={idx} className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[9px] px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 font-mono">
                                "{q}"
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[8px] font-bold font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Sources:</span>
                            {msg.groundingChunks.map((chunk, idx) => {
                              const domain = chunk.uri ? new URL(chunk.uri).hostname : '';
                              return (
                                <a
                                  key={idx}
                                  href={chunk.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-all bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 hover:border-zinc-400 dark:hover:border-zinc-700 cursor-pointer"
                                >
                                  <span className="truncate max-w-[120px]">{chunk.title || domain || 'Source'}</span>
                                  {domain && <span className="text-[8px] text-zinc-400 dark:text-zinc-600 font-mono">({domain})</span>}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300/50 dark:border-zinc-700/50 flex items-center justify-center shrink-0">
                    <User size={14} className="text-zinc-600 dark:text-zinc-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Temporary typing stream text indicator */}
        {isStreaming && (
          <div className="max-w-3xl mx-auto w-full flex items-center gap-2.5 px-1 py-1 text-zinc-400">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 animate-pulse">Streaming Response...</span>
            <button
              onClick={onInterrupt}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 hover:dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-[8px] font-bold uppercase tracking-widest transition-all cursor-pointer"
            >
              Interrupt Stream
            </button>
          </div>
        )}
      </div>

      {/* Input controller - Gemini-Style Centerpiece Prompt Bar */}
      <div className="px-4 md:px-12 pb-6 pt-2 max-w-3xl w-full mx-auto">
        {status === 'connected' && micError && isAudioMode && (
          <div className="flex flex-col gap-2 mb-3.5 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-2xl text-xs font-mono text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span className="font-bold">Iframe Mic Blocked</span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed">
              Browser security rules block mic access inside this preview iframe. Open the app in a standalone tab to enable microphone stream features natively.
            </p>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex self-start items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-white hover:bg-black hover:dark:bg-zinc-200 text-white dark:text-black text-[9px] font-bold uppercase rounded-lg transition-all tracking-wider cursor-pointer shadow-sm"
            >
              Open Standalone Tab ↗
            </a>
          </div>
        )}

        {status === 'connected' && !micError && isAudioMode && (
          <div className="flex items-center gap-2 mb-2 px-3 text-[9px] font-mono tracking-wider text-zinc-500">
            <span className={`w-2 h-2 rounded-full ${isMicMuted ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-red-500 animate-pulse'}`} />
            <span>{isMicMuted ? 'Audio response active. Unmute mic to stream vocal prompts.' : 'Voice Stream Live: Speak naturally...'}</span>
          </div>
        )}

        {/* Pill Prompter container */}
        <div className="relative flex items-center gap-2 border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50 dark:bg-zinc-900/90 shadow-lg p-2 focus-within:border-zinc-400 dark:focus-within:border-zinc-700 transition-all">
          
          {/* COMPASS / GROUNDING TOGGLE STATUS */}
          <button
            onClick={() => onSettingsChange({ ...settings, googleSearchGrounding: !settings.googleSearchGrounding, model: !settings.googleSearchGrounding ? 'gemini-2.5-flash-native-audio-latest' : 'gemini-3.1-flash-live-preview' })}
            title={settings.googleSearchGrounding ? "Web Search Grounding ON (using secondary model)" : "Web Search Grounding OFF"}
            className={`p-2.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              settings.googleSearchGrounding 
                ? 'bg-blue-550/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100/50' 
                : 'text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            <Globe size={18} />
          </button>

          {/* CHAT INPUT AREA (TEXTAREA) */}
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'connected'}
            rows={1}
            placeholder={
              status === 'connected' 
                ? (isAudioMode ? 'Speak to Gemini, or type your query...' : 'Ask Gemini Live L2T Proxy...')
                : 'Please connect the socket channel above...'
            }
            className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-800 dark:text-zinc-100 px-1 py-1.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-sans resize-none h-8 max-h-32 scrollbar-thin overflow-y-auto"
          />

          {/* MODEL QUICK SELECT POPUP / DROPDOWN */}
          <div className="relative">
            <button
              onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              <span>{settings.model === 'gemini-3.1-flash-live-preview' ? 'Flash 3.1 Live' : 'Flash 2.5 Audio'}</span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${isModelMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl py-2 z-50 animate-fade-in text-xs font-mono">
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 pb-1.5 mb-1">
                  Engine Selector
                </div>
                <button
                  onClick={() => handleModelSelect('gemini-3.1-flash-live-preview')}
                  className={`w-full text-left px-3.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${settings.model === 'gemini-3.1-flash-live-preview' ? 'text-blue-500 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}
                >
                  <div>Flash 3.1 Live (Primary)</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">Low-latency speed focus</div>
                </button>
                <button
                  onClick={() => handleModelSelect('gemini-2.5-flash-native-audio-latest')}
                  className={`w-full text-left px-3.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${settings.model === 'gemini-2.5-flash-native-audio-latest' ? 'text-blue-500 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}
                >
                  <div>Flash 2.5 Audio (Grounded)</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">Search Grounding fully enabled</div>
                </button>
              </div>
            )}
          </div>

          {/* DYNAMIC SPEECH / MIC TOGGLE BUTTON */}
          <button
            onClick={toggleMicFeature}
            disabled={status !== 'connected'}
            title={!isAudioMode ? "Enable Audio Response Modality" : isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`p-2.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              status !== 'connected'
                ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                : !isAudioMode
                  ? 'text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200'
                  : isMicMuted
                    ? 'bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-200'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 animate-pulse'
            }`}
          >
            {isAudioMode && isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* SEND ACTION BUTTON */}
          <button
            onClick={onSendMessage}
            disabled={status !== 'connected' || !inputValue.trim()}
            className="p-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-full hover:scale-105 disabled:bg-zinc-100 disabled:dark:bg-zinc-800 disabled:text-zinc-400 disabled:dark:text-zinc-650 transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            <Send size={15} />
          </button>
        </div>

        {/* Model State Indicator: Visualizes when thinking, talking, or ready */}
        {status === 'connected' && (
          <div className="w-full flex justify-center animate-fade-in pt-1.5 pb-0.5">
            {isThinking ? (
              <div className="flex items-center gap-2 px-4 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-full shadow-sm animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase text-blue-600 dark:text-blue-400 font-bold">thinking...</span>
              </div>
            ) : isStreaming ? (
              <div className="flex items-center gap-2 px-4 py-1 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40 rounded-full shadow-sm">
                <div className="flex items-center gap-0.5">
                  <span className="w-1 h-2.5 bg-emerald-500 rounded-full animate-[bounce_0.8s_infinite_0ms]" />
                  <span className="w-1 h-3.5 bg-emerald-500 rounded-full animate-[bounce_0.8s_infinite_150ms]" />
                  <span className="w-1 h-2.5 bg-emerald-500 rounded-full animate-[bounce_0.8s_infinite_300ms]" />
                </div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-emerald-600 dark:text-emerald-400 font-bold">talking...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-0.5 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/30 dark:border-zinc-800/30 rounded-full opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600 animate-pulse" />
                <span className="text-[9px] font-mono tracking-widest uppercase text-zinc-500 dark:text-zinc-500 font-medium">Ready</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
