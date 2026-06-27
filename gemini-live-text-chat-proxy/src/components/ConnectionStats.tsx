import { useEffect, useState } from 'react';
import { ConnectionState } from '../types';
import { Activity, Clock, LogIn, Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatsProps {
  state: ConnectionState;
}

export default function ConnectionStats({ state }: ConnectionStatsProps) {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    let interval: any;
    if (state.status === 'connected') {
      interval = setInterval(() => {
        setUptime((prev) => prev + 1);
      }, 1000);
    } else {
      setUptime(0);
    }
    return () => clearInterval(interval);
  }, [state.status]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
      {/* State Status */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-xl transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 dark:text-zinc-400 text-[8px] uppercase tracking-wider font-mono">Connection</span>
          {state.status === 'connected' ? <Wifi size={12} className="text-zinc-700 dark:text-zinc-300" /> : <WifiOff size={12} className="text-zinc-400 dark:text-zinc-600" />}
        </div>
        <div className={`text-lg font-light tracking-tight ${state.status === 'connected' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-zinc-400 dark:text-zinc-500 capitalize'}`}>
          {state.status === 'connected' ? 'ACTIVE' : state.status}
        </div>
      </div>

      {/* simulated Latency */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-xl transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 dark:text-zinc-400 text-[8px] uppercase tracking-wider font-mono">Latency</span>
          <Activity size={12} className="text-zinc-400 dark:text-zinc-600" />
        </div>
        <div className="text-lg font-mono text-zinc-800 dark:text-zinc-100">
          {state.status === 'connected' ? `${state.latencyMs}ms` : '--'}
        </div>
      </div>

      {/* Packets count */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-xl transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 dark:text-zinc-400 text-[8px] uppercase tracking-wider font-mono">Frame I/O</span>
          <LogIn size={12} className="text-zinc-400 dark:text-zinc-600" />
        </div>
        <div className="text-lg font-mono text-zinc-800 dark:text-zinc-100 uppercase tracking-tighter">
          {state.status === 'connected' 
            ? `${state.packetsSent}/${state.packetsReceived}` 
            : '0 / 0'}
        </div>
      </div>

      {/* active duration */}
      <div className="p-3.5 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-xl transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 dark:text-zinc-400 text-[8px] uppercase tracking-wider font-mono">Uptime</span>
          <Clock size={12} className="text-zinc-400 dark:text-zinc-600" />
        </div>
        <div className="text-lg font-mono text-zinc-800 dark:text-zinc-100">
          {state.status === 'connected' ? formatDuration(uptime) : '0:00'}
        </div>
      </div>
    </div>
  );
}
