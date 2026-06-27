import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { AlertCircle, Bot, CornerDownLeft, Sparkles, User, Mic, MicOff } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSendMessage: () => void;
  onInterrupt: () => void;
  isStreaming: boolean;
  status: string;
  isAudioMode: boolean;
  isMicMuted: boolean;
  onToggleMicMute: () => void;
  micError?: string | null;
}

export default function ChatArea({
  messages,
  inputValue,
  onInputChange,
  onSendMessage,
  onInterrupt,
  isStreaming,
  status,
  isAudioMode,
  isMicMuted,
  onToggleMicMute,
  micError
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Handle Enter to submit, Shift+Enter to newline
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  // Helper to determine bubble background based on parsed emotion styles
  const getEmotionClasses = (msg: ChatMessage) => {
    if (msg.role === 'user') return 'text-zinc-300 font-light leading-relaxed';
    
    // Model styles depending on computed emotion
    switch (msg.emotion) {
      case 'excited':
        return 'text-white font-light leading-snug drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]';
      case 'thoughtful':
        return 'text-zinc-300 font-light leading-snug italic';
      case 'calm':
        return 'text-zinc-400 font-light leading-snug';
      case 'apologetic':
        return 'text-zinc-500 font-light leading-snug italic';
      default:
        return 'text-white font-light leading-snug';
    }
  };

  return (
    <div className="flex flex-col h-[640px] bg-[#080808] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
      {/* Upper Terminal Banner */}
      <div className="flex items-center justify-between px-6 py-4 bg-white/[0.01] border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-white animate-pulse' :
            status === 'connecting' ? 'bg-zinc-500 animate-ping' :
            'bg-red-500'
          }`} />
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            {status === 'connected' ? 'SECURE_CHANNEL_ESTABLISHED' : 'CHANNEL_OFFLINE'}
          </span>
        </div>
        {isStreaming && (
          <button
            onClick={onInterrupt}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-950 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-900 transition-colors cursor-pointer"
          >
            <AlertCircle size={10} />
            <span>INTERRUPT</span>
          </button>
        )}
      </div>

      {/* Message Feed Canvas */}
      <div 
        ref={scrollRef}
        className="flex-1 p-8 overflow-y-auto space-y-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-50">
            <Sparkles size={24} className="text-zinc-600" />
            <div>
              <p className="text-zinc-400 font-light text-sm tracking-wide">Ready for experimental prompt</p>
              <p className="text-[10px] text-zinc-600 max-w-sm mt-3 uppercase tracking-widest">
                Configure your translation layers and connect session.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col space-y-2 max-w-[85%] ${msg.role === 'user' ? 'self-end items-end text-right' : 'self-start items-start text-left'}`}
            >
              {/* Header Label */}
              <div className="flex items-center gap-2 opacity-80">
                <div className={`text-[10px] font-mono tracking-tighter uppercase ${msg.role === 'user' ? 'text-zinc-500' : 'text-zinc-300'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 
                  {' '}{msg.role === 'user' ? 'CLIENT_SEND' : 'SERVER_STREAM [MODEL_TURN]'}
                </div>
                {msg.role === 'model' && <span className="h-[1px] w-8 bg-zinc-500/10 block hidden sm:inline-block"></span>}
              </div>

              {/* Message Typography content */}
              <div className={`text-lg p-0 ${getEmotionClasses(msg)}`}>
                <div className="whitespace-pre-wrap select-text">
                  {msg.text}
                </div>

                {/* Subtitle / Translated Overlay layer */}
                {msg.role === 'model' && msg.translation && (
                  <div className="mt-3 opacity-40 italic text-sm leading-relaxed">
                    {msg.translation}
                  </div>
                )}

                {/* Grounding / Search Sources display */}
                {msg.role === 'model' && ((msg.groundingQueries && msg.groundingQueries.length > 0) || (msg.groundingChunks && msg.groundingChunks.length > 0)) && (
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-2.5 text-xs">
                    {msg.groundingQueries && msg.groundingQueries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest">Web Engine:</span>
                        {msg.groundingQueries.map((q, idx) => (
                          <span key={idx} className="bg-zinc-800 text-zinc-300 text-[9px] px-2 py-0.5 rounded border border-zinc-700/50 font-mono">
                            "{q}"
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest">Sourced Context:</span>
                        {msg.groundingChunks.map((chunk, idx) => {
                          const domain = chunk.uri ? new URL(chunk.uri).hostname : '';
                          return (
                            <a
                              key={idx}
                              href={chunk.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-white transition-all bg-white/[0.02] border border-white/5 hover:border-zinc-500/20 px-2 py-1 rounded cursor-pointer"
                            >
                              <span className="truncate max-w-[140px] font-normal">{chunk.title || domain || 'Source'}</span>
                              {domain && <span className="text-[8px] text-zinc-600 font-mono">({domain})</span>}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Temporary typing stream text indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 px-1 py-2 text-zinc-500">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 animate-pulse">Streaming Token Chunk...</span>
          </div>
        )}
      </div>

      {/* Input controller */}
      <div className="p-6 pt-0 mt-auto bg-[#080808]">
        {isAudioMode && status === 'connected' && micError && (
          <div className="flex flex-col gap-2.5 mb-3 px-4 py-3 bg-red-950/35 border border-red-500/20 rounded-xl text-xs font-mono tracking-wide text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span className="font-bold">Microphone Access Blocked</span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Browsers prevent microphone access inside sandboxed iframe previews for security. Please open the application in a separate browser tab to prompt and grant microphone permissions normally.
            </p>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex self-start items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-black text-[10px] font-bold uppercase rounded-lg transition-all tracking-wider cursor-pointer"
            >
              Open App In New Tab ↗
            </a>
          </div>
        )}
        {isAudioMode && status === 'connected' && !micError && (
          <div className="flex items-center gap-2 mb-2 px-1 text-[10px] font-mono tracking-widest text-zinc-500">
            <span className={`w-1.5 h-1.5 rounded-full ${isMicMuted ? 'bg-zinc-600' : 'bg-red-500 animate-pulse'}`} />
            <span>{isMicMuted ? 'Speech stream inactive. Press unmute to speak.' : 'Voice Streaming: Speak naturally to talk with Gemini Live.'}</span>
          </div>
        )}
        <div className="relative flex items-center border border-white/10 rounded-xl bg-white/[0.02] p-2 focus-within:border-white/40 transition-colors">
          {isAudioMode && (
            <button
              onClick={onToggleMicMute}
              disabled={status !== 'connected'}
              title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
              className={`mr-2 px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                status !== 'connected'
                  ? 'bg-zinc-950 border-white/5 text-zinc-600 cursor-not-allowed'
                  : isMicMuted
                    ? 'bg-rose-950/20 hover:bg-rose-950/45 border-rose-500/30 text-rose-400 hover:text-rose-300'
                    : 'bg-white/10 hover:bg-white/20 border-white/30 text-white shadow-[0_0_10px_rgba(255,255,255,0.05)] animate-pulse'
              }`}
            >
              {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
              <span className="text-[10px] uppercase font-mono tracking-wider hidden sm:inline">
                {isMicMuted ? "Mic Muted" : "Mic Live"}
              </span>
            </button>
          )}

          <input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'connected'}
            placeholder={
              status === 'connected' 
                ? (isAudioMode ? 'Speak into mic or type command...' : 'Enter command or chat...')
                : 'Connect session first...'
            }
            className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-200 px-4 py-3 placeholder:text-zinc-650 font-sans"
          />
          <button
            onClick={onSendMessage}
            disabled={status !== 'connected' || !inputValue.trim()}
            className="px-6 py-2.5 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-650 text-black text-xs font-bold uppercase rounded-lg transition-all tracking-widest cursor-pointer"
          >
            Send <span className="hidden sm:inline">(Turn_Complete)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
