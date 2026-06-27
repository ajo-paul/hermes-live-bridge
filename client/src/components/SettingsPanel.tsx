import { ConnectorSettings, TranslationMode } from '../types';
import { Bot, HelpCircle, Sliders, Volume2, VolumeX } from 'lucide-react';

interface SettingsPanelProps {
  settings: ConnectorSettings;
  onSettingsChange: (settings: ConnectorSettings) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  connectionStatus: string;
  connectionError?: string;
}

export default function SettingsPanel({ settings, onSettingsChange, onReconnect, onDisconnect, connectionStatus, connectionError }: SettingsPanelProps) {
  const languages = [
    'Original',
    'Spanish (Español)',
    'French (Français)',
    'Japanese (日本語)',
    'German (Deutsch)',
    'Hindi (हिन्दी)',
    'Portuguese (Português)',
    'Chinese (中文)'
  ];

  const models = [
    { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live (Primary - Core Engine)' },
    { id: 'gemini-2.5-flash-native-audio-latest', name: 'Gemini 2.5 Flash Native Audio (Secondary - Grounded)' }
  ];

  const handleChange = (key: keyof ConnectorSettings, value: any) => {
    let updated = { ...settings, [key]: value };
    
    // Coordinated auto-enabling / auto-disabling rules:
    if (key === 'model') {
      if (value === 'gemini-3.1-flash-live-preview') {
        updated.googleSearchGrounding = false;
      } else if (value === 'gemini-2.5-flash-native-audio-latest') {
        updated.googleSearchGrounding = true;
      }
    } else if (key === 'googleSearchGrounding') {
      updated.model = value ? 'gemini-2.5-flash-native-audio-latest' : 'gemini-3.1-flash-live-preview';
    }

    onSettingsChange(updated);
  };

  return (
    <div className="bg-[#080808] border border-white/5 p-6 rounded-xl flex flex-col space-y-6">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-zinc-400" />
          <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Proxy Setup Panel</h2>
        </div>
        <div className="flex items-center gap-2">
          {(connectionStatus === 'connected' || connectionStatus === 'connecting') && (
            <button
              onClick={onDisconnect}
              className="px-3.5 py-2 bg-rose-950/30 hover:bg-rose-900 border border-rose-500/35 text-rose-300 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all tracking-wider cursor-pointer"
            >
              DISCONNECT
            </button>
          )}
          <button
            onClick={onReconnect}
            disabled={connectionStatus === 'connecting'}
            className="px-3.5 py-2 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 text-black text-[10px] font-bold uppercase rounded-lg transition-all tracking-wider cursor-pointer"
          >
            {connectionStatus === 'connected' ? 'RECONNECT' : 'CONNECT'}
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="p-3.5 bg-rose-950/20 border border-rose-500/20 rounded-lg text-xs flex flex-col space-y-1 text-rose-300">
          <div className="font-semibold flex items-center gap-1.5 text-rose-400">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
            <span>CRITICAL CONNECTION ERROR</span>
          </div>
          <p className="opacity-80 leading-relaxed font-sans text-[11px] break-words">{connectionError}</p>
          <div className="text-[10px] text-zinc-500 leading-normal pt-2 mt-1 border-t border-rose-500/10">
            For 1011/Quota issues, check your Google AI Studio plan & billing details, or try an alternative model.
          </div>
        </div>
      )}

      <div className="space-y-5 text-xs">
        {/* Model Selection */}
        <div>
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Neural Engine Cap</label>
          <select
            value={settings.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full bg-white/[0.02] border border-white/10 rounded-lg py-2 px-3 text-zinc-200 outline-none focus:border-white/40 transition-colors"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Modality (Muted vs Unmuted) */}
        <div>
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Modality Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
               onClick={() => handleChange('responseModality', 'TEXT')}
               className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg font-medium transition-colors ${
                 settings.responseModality === 'TEXT'
                   ? 'bg-zinc-800 border-zinc-500 text-white'
                   : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:border-white/20'
               }`}
             >
               <VolumeX size={14} />
               <span>TEXT (Muted)</span>
             </button>
             <button
               onClick={() => handleChange('responseModality', 'AUDIO')}
               className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg font-medium transition-colors ${
                 settings.responseModality === 'AUDIO'
                   ? 'bg-zinc-800 border-zinc-500 text-white'
                   : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:border-white/20'
               }`}
             >
              <Volume2 size={14} />
              <span>AUDIO (Live)</span>
            </button>
          </div>
        </div>

        {/* Translation Mode */}
        <div>
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Translation Layer</label>
          <select
            value={settings.translationMode}
            onChange={(e) => handleChange('translationMode', e.target.value as TranslationMode)}
            className="w-full bg-white/[0.02] border border-white/10 rounded-lg py-2 px-3 text-zinc-200 outline-none focus:border-white/40 transition-colors"
          >
            <option value="none">No Translation (Natively Respond to Prompt)</option>
            <option value="direct">Native Target Override (Instruct model to reply in target language)</option>
            <option value="dual">Dual-Subtitle Substrate (Translate original model reply dynamically)</option>
          </select>
        </div>

        {/* Target Language */}
        {settings.translationMode !== 'none' && (
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Target Language</label>
            <select
              value={settings.targetLanguage}
              onChange={(e) => handleChange('targetLanguage', e.target.value)}
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg py-2 px-3 text-zinc-200 outline-none focus:border-white/40 transition-colors"
            >
              {languages.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {/* Advanced Toggles */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          {/* Filler mode */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5">
            <div>
              <span className="text-zinc-300 font-medium font-sans">Surgical Clean Filter</span>
            </div>
            <input
              type="checkbox"
              checked={settings.fillerMode === 'stripped'}
              onChange={(e) => handleChange('fillerMode', e.target.checked ? 'stripped' : 'raw')}
              className="w-4 h-4 rounded text-white accent-white bg-white/10"
            />
          </div>

          {/* Emotional styles */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5">
            <div>
              <span className="text-zinc-300 font-medium font-sans">Emotion Formatting</span>
            </div>
            <input
              type="checkbox"
              checked={settings.emotionFormatting}
              onChange={(e) => handleChange('emotionFormatting', e.target.checked)}
              className="w-4 h-4 rounded text-white accent-white bg-white/10"
            />
          </div>

          {/* Auto interrupt */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5">
            <div>
              <span className="text-zinc-300 font-medium font-sans">Auto-Interrupt</span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoInterrupt}
              onChange={(e) => handleChange('autoInterrupt', e.target.checked)}
              className="w-4 h-4 rounded text-white accent-white bg-white/10"
            />
          </div>

          {/* Google Search Grounding Toggle */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5">
            <div>
              <span className="text-zinc-300 font-medium font-sans">Web Search Grounding</span>
              <span className="block text-[9px] text-zinc-500 font-normal">Enables real-time internet context and sourcing</span>
            </div>
            <input
              type="checkbox"
              checked={settings.googleSearchGrounding}
              onChange={(e) => handleChange('googleSearchGrounding', e.target.checked)}
              className="w-4 h-4 rounded text-white accent-white bg-white/10"
            />
          </div>
        </div>

        {/* System Instructions */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center gap-1 mb-2">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">System Instructions</label>
          </div>
          <textarea
            value={settings.systemInstruction}
            onChange={(e) => handleChange('systemInstruction', e.target.value)}
            rows={3}
            className="w-full bg-white/[0.02] border border-white/10 rounded-lg py-2 px-3 text-zinc-300 outline-none focus:border-white/40 transition-colors text-xs resize-none font-sans"
          />
        </div>
      </div>
    </div>
  );
}
