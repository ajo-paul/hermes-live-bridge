import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface ConsoleProps {
  logs: LogEntry[];
}

const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-rose-400';
      case 'WARN': return 'text-amber-400';
      case 'SUCCESS': return 'text-emerald-400';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="bg-[#080808] border border-white/5 rounded-xl h-full flex flex-col overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
      <div className="border-b border-white/5 bg-black/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/50 animate-pulse"></div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Activity Logs</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">HERMES_VM</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 && (
          <div className="text-zinc-600 italic">Waiting for agent activity...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="mb-1.5 whitespace-pre-wrap break-all">
            <span className="text-zinc-600 mr-2">[{log.timestamp}]</span>
            <span className={`${getLevelColor(log.level)} font-bold mr-2`}>{log.level}:</span>
            <span className="text-zinc-300">{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default Console;
