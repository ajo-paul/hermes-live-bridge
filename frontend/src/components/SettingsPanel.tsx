import { ConnectorSettings, TranslationMode } from '../types';
import { Sliders, Volume2, VolumeX, Sparkles, HelpCircle } from 'lucide-react';

interface SettingsPanelProps {
  settings: ConnectorSettings;
  onSettingsChange: (settings: ConnectorSettings) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  connectionStatus: string;
  connectionError?: string;
}

export default function SettingsPanel({
  settings,
  onSettingsChange,
  onReconnect,
  onDisconnect,
  connectionStatus,
  connectionError
}: SettingsPanelProps) {
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

  const voices: Array<ConnectorSettings['voiceName']> = [
    'Zephyr',
    'Puck',
    'Charon',
    'Kore',
    'Fenrir'
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
    <div className="flex flex-col space-y-5 text-zinc-800 dark:text-zinc-200">
      {/* Title */}
      <div className="flex items-center gap-2 pb-1 border-b border-zinc-200/50 dark:border-zinc-800/60">
        <Sliders size={15} className="text-zinc-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
          Engine Configurations
        </h3>
      </div>

      <div className="space-y-4 text-xs font-sans">
        {/* Voice Selection */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 font-mono">
            Vocal Model Voice
          </label>
          <select
            value={settings.voiceName}
            onChange={(e) => handleChange('voiceName', e.target.value)}
            className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-zinc-800 dark:text-zinc-200 outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors font-medium font-sans cursor-pointer"
          >
            {voices.map((v) => (
              <option key={v} value={v}>Voice: {v}</option>
            ))}
          </select>
        </div>

        {/* Translation Mode */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 font-mono">
            Translation Substrate
          </label>
          <select
            value={settings.translationMode}
            onChange={(e) => handleChange('translationMode', e.target.value as TranslationMode)}
            className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-zinc-800 dark:text-zinc-200 outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors font-medium font-sans cursor-pointer"
          >
            <option value="none">No Translation (Native)</option>
            <option value="direct">Native Direct Target (Prompt Mode)</option>
            <option value="dual">Dual-Subtitle (Async translation)</option>
          </select>
        </div>

        {/* Target Language */}
        {settings.translationMode !== 'none' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 font-mono">
              Target Language
            </label>
            <select
              value={settings.targetLanguage}
              onChange={(e) => handleChange('targetLanguage', e.target.value)}
              className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-zinc-800 dark:text-zinc-200 outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors font-medium font-sans cursor-pointer"
            >
              {languages.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {/* Option Switches Container */}
        <div className="pt-3 border-t border-zinc-200/50 dark:border-zinc-800/60 space-y-2.5">
          {/* Filler mode */}
          <label className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-850 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer select-none">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Clean Filler Stripper</span>
              <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 font-normal leading-normal">Bypasses "uhm", "hmm" vocal fillers</span>
            </div>
            <input
              type="checkbox"
              checked={settings.fillerMode === 'stripped'}
              onChange={(e) => handleChange('fillerMode', e.target.checked ? 'stripped' : 'raw')}
              className="w-4 h-4 rounded text-blue-500 accent-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
            />
          </label>

          {/* Emotional styles */}
          <label className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-850 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer select-none">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Emotion Formatting</span>
              <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 font-normal leading-normal">Colorize text dynamically by mood</span>
            </div>
            <input
              type="checkbox"
              checked={settings.emotionFormatting}
              onChange={(e) => handleChange('emotionFormatting', e.target.checked)}
              className="w-4 h-4 rounded text-blue-500 accent-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
            />
          </label>

          {/* Auto interrupt */}
          <label className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-850 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer select-none">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Auto-Interrupt</span>
              <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 font-normal leading-normal">Stops live speech output instantly on typing</span>
            </div>
            <input
              type="checkbox"
              checked={settings.autoInterrupt}
              onChange={(e) => handleChange('autoInterrupt', e.target.checked)}
              className="w-4 h-4 rounded text-blue-500 accent-blue-500 border-zinc-300 dark:border-zinc-700 cursor-pointer"
            />
          </label>
        </div>

        {/* System Instructions */}
        <div className="pt-3 border-t border-zinc-200/50 dark:border-zinc-800/60">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 font-mono">
            System Instructions
          </label>
          <textarea
            value={settings.systemInstruction}
            onChange={(e) => handleChange('systemInstruction', e.target.value)}
            rows={3}
            placeholder="Instruct the backend proxy..."
            className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-zinc-800 dark:text-zinc-200 outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors text-xs resize-none font-sans"
          />
        </div>
      </div>
    </div>
  );
}
