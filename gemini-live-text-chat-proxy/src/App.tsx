import { useEffect, useRef, useState } from 'react';
import { ConnectionState, ConnectorSettings, ChatMessage } from './types';
import ConnectionStats from './components/ConnectionStats';
import SettingsPanel from './components/SettingsPanel';
import ChatArea from './components/ChatArea';
import { PCMAudioPlayer } from './lib/audioPlayer';
import { PCMAudioRecorder } from './lib/audioRecorder';
import { 
  Bot, 
  HelpCircle, 
  Sparkles, 
  Menu, 
  X, 
  Sun, 
  Moon, 
  Wifi, 
  WifiOff, 
  AlertCircle, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Sliders,
  ChevronUp,
  Activity
} from 'lucide-react';

const DEFAULT_SETTINGS: ConnectorSettings = {
  model: 'gemini-3.1-flash-live-preview',
  systemInstruction: "You are a highly capable conversational AI, powered by the experimental Gemini Live-to-Text translation engine. Respond concisely, casually, and interactively.",
  responseModality: 'TEXT',
  voiceName: 'Zephyr',
  translationMode: 'none',
  targetLanguage: 'Original',
  fillerMode: 'raw',
  emotionFormatting: true,
  autoInterrupt: true,
  googleSearchGrounding: true
};

export default function App() {
  const [settings, setSettings] = useState<ConnectorSettings>(DEFAULT_SETTINGS);
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'disconnected',
    latencyMs: 35,
    packetsSent: 0,
    packetsReceived: 0,
    activeSessionTime: 0
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // UI responsive states
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isBottomDrawerOpen, setIsBottomDrawerOpen] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<PCMAudioPlayer | null>(null);
  const audioRecorderRef = useRef<PCMAudioRecorder | null>(null);
  const isMicMutedRef = useRef(false);
  const currentModelMessageRef = useRef<ChatMessage | null>(null);
  const sentTimeRef = useRef<number>(0);
  const isManualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<any>(null);

  // Theme effect
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync ref
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Hot apply settings to active socket payload on configuration change
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending updated setup settings to proxy...');
      socketRef.current.send(JSON.stringify({
        type: 'setup',
        settings: settings
      }));
    }
  }, [settings]);

  // Handle audio recorder initialization
  useEffect(() => {
    const shouldRecord = connection.status === 'connected' && settings.responseModality === 'AUDIO' && !isMicMuted;
    
    if (shouldRecord) {
      if (!audioRecorderRef.current) {
        audioRecorderRef.current = new PCMAudioRecorder((base64Data) => {
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && !isMicMutedRef.current) {
            socketRef.current.send(JSON.stringify({
              type: 'audio_input',
              data: base64Data
            }));
          }
        });
      }
      if (!audioRecorderRef.current.isRecording) {
        audioRecorderRef.current.start()
          .then(() => {
            setMicError(null);
          })
          .catch((err: any) => {
            console.error("Failed to start audio recorder:", err);
            setMicError(err?.message || String(err));
          });
      }
    } else {
      setMicError(null);
      if (audioRecorderRef.current && audioRecorderRef.current.isRecording) {
        audioRecorderRef.current.stop();
      }
    }
  }, [connection.status, settings.responseModality, isMicMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new PCMAudioPlayer();
    return () => {
      audioPlayerRef.current?.stop();
    };
  }, []);

  // Gracefully disconnect socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // Auto-connect on load
  useEffect(() => {
    handleConnect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    isManualDisconnectRef.current = false;

    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    setConnection(prev => ({ ...prev, status: 'connecting', error: undefined }));
    setIsStreaming(false);
    setIsThinking(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-chat`;
    
    console.log('🔌 Connecting client socket channel:', wsUrl);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('🟢 Client socket opened successfully');
      const setupPayload = {
        type: 'setup',
        settings: settings
      };
      ws.send(JSON.stringify(setupPayload));
      
      setConnection(prev => ({
        ...prev,
        packetsSent: prev.packetsSent + 1,
        error: undefined
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const rawData = JSON.parse(event.data);
        setConnection(prev => ({ ...prev, packetsReceived: prev.packetsReceived + 1 }));

        if (rawData.type === 'status') {
          if (rawData.status === 'connected') {
            setConnection(prev => ({ 
              ...prev, 
              status: 'connected', 
              error: undefined,
              activeModel: rawData.activeModel,
              fallbackActive: rawData.fallbackActive,
              fallbackReason: rawData.fallbackReason
            }));
          } else if (rawData.status === 'disconnected') {
            setConnection(prev => ({ 
              ...prev, 
              status: 'disconnected', 
              error: rawData.error,
              activeModel: rawData.activeModel,
              fallbackActive: rawData.fallbackActive,
              fallbackReason: rawData.fallbackReason
            }));
          } else if (rawData.status === 'error') {
            setConnection(prev => ({ 
              ...prev, 
              status: 'error', 
              error: rawData.error,
              activeModel: rawData.activeModel,
              fallbackActive: rawData.fallbackActive,
              fallbackReason: rawData.fallbackReason
            }));
          } else if (rawData.status === 'connecting') {
            setConnection(prev => ({ 
              ...prev, 
              status: 'connecting',
              activeModel: rawData.activeModel,
              fallbackActive: rawData.fallbackActive,
              fallbackReason: rawData.fallbackReason
            }));
          }
        } 
        
        else if (rawData.type === 'grounding_metadata') {
          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === 'model') {
              list[list.length - 1] = {
                ...last,
                groundingQueries: rawData.webSearchQueries || last.groundingQueries || [],
                groundingChunks: rawData.groundingChunks || last.groundingChunks || []
              };
            }
            return list;
          });
        }
        
        else if (rawData.type === 'text_chunk') {
          setIsStreaming(true);
          setIsThinking(false);

          if (sentTimeRef.current > 0) {
            const delta = Date.now() - sentTimeRef.current;
            setConnection(prev => ({ ...prev, latencyMs: delta }));
            sentTimeRef.current = 0; // reset
          }

          const txt = rawData.text;

          let processedText = txt;
          if (settings.fillerMode === 'stripped') {
            processedText = processedText.replace(/\b(umm|umm,|umm\.|hmm|hmm,|hmm\.|ah|ah,|oh|oh,)\b/gi, '').trim();
            if (processedText === '') return;
          }

          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];

            if (last && last.role === 'model' && !last.isInterrupted && currentModelMessageRef.current?.id === last.id) {
              let newText = last.text;
              if (newText.length > 0 && processedText.length > 0) {
                const lastChar = newText.charAt(newText.length - 1);
                const firstChar = processedText.charAt(0);
                if (lastChar !== ' ' && firstChar !== ' ') {
                  const isWordChar = (ch: string) => /[a-zA-Z0-9_'\u00C0-\u017F]/.test(ch);
                  const isPunct = (ch: string) => /[.,!?;:]/.test(ch);
                  if ((isWordChar(lastChar) && isWordChar(firstChar)) || (isPunct(lastChar) && isWordChar(firstChar))) {
                    newText += " ";
                  }
                }
              }
              newText += processedText;
              const updatedLast = {
                ...last,
                text: newText,
                emotion: settings.emotionFormatting ? analyzeEmotion(newText) : last.emotion
              };
              list[list.length - 1] = updatedLast;
              currentModelMessageRef.current = updatedLast;
              return list;
            } else {
              const newMsg: ChatMessage = {
                id: Math.random().toString(),
                role: 'model',
                text: processedText,
                timestamp: new Date(),
                emotion: settings.emotionFormatting ? analyzeEmotion(processedText) : 'normal'
              };
              currentModelMessageRef.current = newMsg;
              return [...list, newMsg];
            }
          });
        } 
        
        else if (rawData.type === 'audio_chunk') {
          if (settings.responseModality === 'AUDIO') {
            setIsStreaming(true);
            setIsThinking(false);
            audioPlayerRef.current?.playChunk(rawData.audio);
          }
        } 
        
        else if (rawData.type === 'turn_complete') {
          setIsStreaming(false);
          setIsThinking(false);
          currentModelMessageRef.current = null;

          if (settings.translationMode === 'dual' && settings.targetLanguage !== 'Original') {
            translateLastModelMessage();
          }
        } 
        
        else if (rawData.type === 'interrupted') {
          console.warn('⚡ Stream interrupted!');
          setIsStreaming(false);
          setIsThinking(false);
          audioPlayerRef.current?.stop();
          
          setMessages(prev => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === 'model') {
              list[list.length - 1] = { ...last, isInterrupted: true };
            }
            return list;
          });
          currentModelMessageRef.current = null;
        }
      } catch (e) {
        console.error('❌ Error parsing payload frame:', e);
      }
    };

    ws.onclose = () => {
      console.log('🔴 Local client socket closed');
      setConnection(prev => ({ ...prev, status: 'disconnected' }));
      setIsStreaming(false);
      setIsThinking(false);
      audioPlayerRef.current?.stop();

      // Trigger auto-reconnect on unexpected close
      if (!isManualDisconnectRef.current) {
        setConnection(prev => ({ ...prev, status: 'connecting', error: 'Unexpected disconnect. Retrying connection...' }));
        console.log('🔄 Socket disconnected. Auto-reconnecting in 4s...');
        reconnectTimerRef.current = setTimeout(() => {
          handleConnect();
        }, 4000);
      }
    };

    ws.onerror = (e) => {
      console.error('❌ Local client socket errored', e);
      setConnection(prev => ({ ...prev, status: 'error', error: 'Network failure or proxy server unreachable' }));
      setIsStreaming(false);
      setIsThinking(false);

      if (!isManualDisconnectRef.current) {
        console.log('🔄 Socket errored. Auto-reconnecting in 4s...');
        reconnectTimerRef.current = setTimeout(() => {
          handleConnect();
        }, 4000);
      }
    };
  };

  const handleDisconnect = () => {
    isManualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnection(prev => ({ ...prev, status: 'disconnected', error: undefined }));
    setIsStreaming(false);
    setIsThinking(false);
    audioPlayerRef.current?.stop();
  };

  const analyzeEmotion = (text: string): ChatMessage['emotion'] => {
    const t = text.toLowerCase();
    if (/\b(sorry|apologize|forgive|regret|embarrassed|apologies)\b/i.test(t)) return 'apologetic';
    if (/\b(excited|wow|amazing|awesome|love|perfect|incredible|thrilled|cool|yay)\b/i.test(t)) return 'excited';
    if (/\b(think|reason|ponder|search|query|wonder|analyze|perhaps|examine|question)\b/i.test(t)) return 'thoughtful';
    if (/\b(calm|relax|breathe|peace|cosmic|steady|gentle|quiet)\b/i.test(t)) return 'calm';
    return 'normal';
  };

  const translateLastModelMessage = async () => {
    setMessages(prev => {
      const list = [...prev];
      const last = list[list.length - 1];
      if (last && last.role === 'model' && !last.translation) {
        list[list.length - 1] = { ...last, translation: 'Translating audio stream subtitles...' };
      }
      return list;
    });

    try {
      setMessages(prev => {
        const list = [...prev];
        const last = list[list.length - 1];
        if (last && last.role === 'model') {
          fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: last.text,
              targetLanguage: settings.targetLanguage
            })
          })
          .then(res => res.json())
          .then(data => {
            setMessages(currentMessages => {
              const updatedList = [...currentMessages];
              const idx = updatedList.findIndex(m => m.id === last.id);
              if (idx !== -1) {
                updatedList[idx] = { ...updatedList[idx], translation: data.translatedText };
              }
              return updatedList;
            });
          })
          .catch(err => {
            console.error('Translation failed:', err);
          });
        }
        return list;
      });
    } catch (e) {
      console.error('Translation process aborted:', e);
    }
  };

  const handleSendMessage = () => {
    if (!inputVal.trim() || connection.status !== 'connected' || !socketRef.current) return;

    if (isStreaming) {
      handleInterrupt();
    }

    sentTimeRef.current = Date.now();
    const textToSend = inputVal.trim();
    setInputVal('');

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);

    const clientPayload = {
      type: 'message',
      text: textToSend
    };

    socketRef.current.send(JSON.stringify(clientPayload));
    setConnection(prev => ({ ...prev, packetsSent: prev.packetsSent + 1 }));
    setIsThinking(true);
  };

  const handleInputChange = (val: string) => {
    setInputVal(val);
    if (settings.autoInterrupt && isStreaming && socketRef.current) {
      console.log('⚡ Keypress Autocut triggered.');
      handleInterrupt();
    }
  };

  const handleInterrupt = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    setIsStreaming(false);
    audioPlayerRef.current?.stop();
    setMessages(prev => {
      const list = [...prev];
      const last = list[list.length - 1];
      if (last && last.role === 'model' && !last.isInterrupted) {
        list[list.length - 1] = { ...last, isInterrupted: true };
      }
      return list;
    });
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-white dark:bg-[#131314] text-zinc-800 dark:text-zinc-200 font-sans transition-colors duration-300">
      
      {/* 1. Header Bar Area */}
      <header className="h-14 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-[#131314]/80 backdrop-blur-md flex items-center justify-between px-4 shrink-0 z-40 select-none">
        
        {/* Left: Hamburger/Menu toggle & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (window.innerWidth >= 768) {
                setIsSidebarOpen(prev => !prev);
              } else {
                setIsMobileSidebarOpen(true);
              }
            }}
            title="Toggle Settings Panel"
            className="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg cursor-pointer transition-colors"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>Gemini Live Proxy</span>
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                L2T v1.5
              </span>
            </h1>
          </div>
        </div>

        {/* Right: Theme toggle & connection quick action */}
        <div className="flex items-center gap-2.5">
          {/* Theme Toggle button */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Toggle to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-all cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Quick Connect toggle */}
          {connection.status === 'connected' ? (
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connection.status === 'connecting'}
              className="px-3.5 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-650 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer"
            >
              {connection.status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </header>

      {/* 2. Top-Notice Connection status and Failover bar */}
      <div className="bg-zinc-50 dark:bg-zinc-950 px-4 py-2 border-b border-zinc-200/40 dark:border-zinc-900/40 text-[11px] flex flex-col md:flex-row md:items-center justify-between gap-2 shrink-0 select-none font-mono">
        {/* Error notification or normal status */}
        <div className="flex-1 flex items-center gap-2 overflow-hidden">
          {connection.error ? (
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 animate-pulse w-full">
              <AlertCircle size={14} className="shrink-0" />
              <span className="font-semibold uppercase tracking-wider">ERROR:</span>
              <span className="truncate max-w-xl font-sans">{connection.error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Active Model Engine:</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium font-sans">
                {connection.activeModel || settings.model}
              </span>
              {connection.fallbackActive && (
                <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[8px] font-bold uppercase rounded tracking-wider animate-pulse">
                  FAILOVER ACTIVE
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info detail */}
        <div className="flex items-center gap-3 shrink-0 text-zinc-400">
          {connection.fallbackActive && (
            <span className="text-[10px] text-zinc-500 font-sans max-w-sm truncate">
              {connection.fallbackReason}
            </span>
          )}
          <span className="hidden sm:inline">Web Search: <b className="text-zinc-600 dark:text-zinc-300">{settings.googleSearchGrounding ? 'Enabled' : 'Disabled'}</b></span>
        </div>
      </div>

      {/* 3. Main Stage Container */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* A. Collapsible Left Config Sidebar Panel (Desktop only) */}
        <div className={`hidden md:flex flex-col border-r border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-zinc-900/10 h-full overflow-hidden transition-all duration-300 relative ${
          isSidebarOpen ? 'w-[300px]' : 'w-0 border-r-0'
        }`}>
          {isSidebarOpen && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              <SettingsPanel 
                settings={settings}
                onSettingsChange={setSettings}
                onReconnect={handleConnect}
                onDisconnect={handleDisconnect}
                connectionStatus={connection.status}
                connectionError={connection.error}
              />
              
              <div className="space-y-2 pt-4 border-t border-zinc-200/50 dark:border-zinc-800/60">
                <h4 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono">Stream Diagnostic HUD</h4>
                <ConnectionStats state={connection} />
              </div>
            </div>
          )}
        </div>

        {/* Side collapser visual handle button (Desktop only) */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title={isSidebarOpen ? "Collapse Side Panel" : "Expand Side Panel"}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-0 z-30 w-5 h-10 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-y border-r border-zinc-200 dark:border-zinc-800 rounded-r-xl items-center justify-center cursor-pointer transition-all shadow-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          style={{ transform: `translate3d(${isSidebarOpen ? '300px' : '0px'}, -50%, 0)` }}
        >
          {isSidebarOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* B. Mobile Slide-Over Sidebar Drawer */}
        {isMobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            />
            
            {/* Drawer Body */}
            <div className="relative w-[280px] max-w-sm bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-850 h-full flex flex-col p-5 space-y-6 z-50 animate-slide-in overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-850">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-blue-500" />
                  <span className="font-semibold text-sm text-zinc-900 dark:text-white">Settings Configuration</span>
                </div>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <SettingsPanel 
                settings={settings}
                onSettingsChange={setSettings}
                onReconnect={handleConnect}
                onDisconnect={handleDisconnect}
                connectionStatus={connection.status}
                connectionError={connection.error}
              />
              
              <div className="space-y-2 pt-4 border-t border-zinc-200 dark:border-zinc-850">
                <h4 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono">Stream Diagnostic HUD</h4>
                <ConnectionStats state={connection} />
              </div>
            </div>
          </div>
        )}

        {/* C. Primary Chat Workspace Canvas */}
        <section className="flex-1 h-full overflow-hidden flex flex-col bg-transparent relative">
          
          {/* Main centerpiece chat layout */}
          <div className="flex-1 overflow-hidden relative">
            <ChatArea 
              messages={messages}
              inputValue={inputVal}
              onInputChange={handleInputChange}
              onSendMessage={handleSendMessage}
              onInterrupt={handleInterrupt}
              isStreaming={isStreaming}
              isThinking={isThinking}
              status={connection.status}
              isAudioMode={settings.responseModality === 'AUDIO'}
              isMicMuted={isMicMuted}
              onToggleMicMute={() => setIsMicMuted(!isMicMuted)}
              micError={micError}
              theme={theme}
              settings={settings}
              onSettingsChange={setSettings}
            />
          </div>

          {/* Quick extra-config swipe/drawer trigger for mobile screens */}
          <div className="md:hidden flex justify-center py-1 bg-zinc-50/50 dark:bg-zinc-900/10 border-t border-zinc-200/50 dark:border-zinc-850">
            <button
              onClick={() => setIsBottomDrawerOpen(true)}
              className="flex items-center gap-1 px-3 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 rounded-full text-[10px] font-mono uppercase text-zinc-500 cursor-pointer shadow-sm transition-all"
            >
              <ChevronUp size={12} className="text-zinc-400" />
              <span>Swipe Up / view other config</span>
            </button>
          </div>
        </section>
      </div>

      {/* 4. Mobile Bottom Drawer / Sheet */}
      {isBottomDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsBottomDrawerOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          {/* Drawer Sheet Body */}
          <div className="relative bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 rounded-t-3xl p-5 space-y-5 z-50 animate-slide-up max-h-[75vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-center pb-2">
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full cursor-pointer" onClick={() => setIsBottomDrawerOpen(false)} />
            </div>
            
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono flex items-center gap-1.5">
                <Sliders size={14} className="text-blue-500" />
                <span>Specialized Settings</span>
              </h3>
              <button
                onClick={() => setIsBottomDrawerOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {/* System Instructions */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1 font-mono">
                  System Instructions
                </label>
                <textarea
                  value={settings.systemInstruction}
                  onChange={(e) => setSettings({ ...settings, systemInstruction: e.target.value })}
                  rows={4}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl py-2.5 px-3.5 text-zinc-800 dark:text-zinc-200 outline-none focus:border-zinc-400 transition-colors"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <label className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Clean Filler Stripper</span>
                    <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 leading-none">Filters "uhm", "hmm" voice fills</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.fillerMode === 'stripped'}
                    onChange={(e) => setSettings({ ...settings, fillerMode: e.target.checked ? 'stripped' : 'raw' })}
                    className="w-4 h-4 rounded text-blue-500 accent-blue-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Auto-Interrupt</span>
                    <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 leading-none">Cut live output on typing</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoInterrupt}
                    onChange={(e) => setSettings({ ...settings, autoInterrupt: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-500 accent-blue-500"
                  />
                </label>
              </div>

              <button
                onClick={() => setIsBottomDrawerOpen(false)}
                className="w-full py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-bold uppercase rounded-xl text-center text-xs tracking-wider cursor-pointer"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Sticky Bottom Ribbon Status & Live Wave Animation */}
      <footer className="h-14 border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md flex items-center justify-between px-4 shrink-0 font-mono text-[9px] text-zinc-400 select-none z-40">
        
        {/* Left: Blinking WebSocket state */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              connection.status === 'connected' ? 'bg-emerald-400' :
              connection.status === 'connecting' ? 'bg-amber-400 animate-ping' :
              'bg-zinc-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              connection.status === 'connected' ? 'bg-emerald-500 animate-pulse' :
              connection.status === 'connecting' ? 'bg-amber-500 animate-pulse' :
              'bg-zinc-500'
            }`} />
          </span>
          <span className="uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 hidden sm:inline">
            Status:
          </span>
          <span className={`font-bold uppercase tracking-widest ${
            connection.status === 'connected' ? 'text-emerald-600 dark:text-emerald-400' :
            connection.status === 'connecting' ? 'text-amber-500' :
            'text-zinc-500'
          }`}>
            {connection.status}
          </span>
        </div>

        {/* Center: Live status indicator or spacer */}
        <div className="flex-1 text-center text-[10px] uppercase tracking-wider text-zinc-400 font-medium select-none hidden sm:block">
          Secure Live-to-Text Gateway Channel
        </div>

        {/* Right: Latency & diagnostics */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span>PING:</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-300">{connection.status === 'connected' ? `${connection.latencyMs}ms` : '--'}</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
            <span>I/O:</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-300">
              {connection.status === 'connected' ? `${connection.packetsSent}/${connection.packetsReceived}` : '0/0'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
