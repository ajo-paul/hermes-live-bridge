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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* State Status */}
      <div className="p-3 bg-white/5 border border-white/5 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 text-[8px] uppercase tracking-tighter">Connection</span>
          {state.status === 'connected' ? <Wifi size={12} className="text-white" /> : <WifiOff size={12} className="text-zinc-600" />}
        </div>
        <div className={`text-xl font-light ${state.status === 'connected' ? 'text-zinc-100' : 'text-zinc-400 capitalize'}`}>
          {state.status === 'connected' ? 'ACTIVE' : state.status}
        </div>
      </div>

      {/* simulated Latency */}
      <div className="p-3 bg-white/5 border border-white/5 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 text-[8px] uppercase tracking-tighter">Latency</span>
          <Activity size={12} className="text-zinc-600" />
        </div>
        <div className="text-xl font-light text-zinc-100">
          {state.status === 'connected' ? `${state.latencyMs}ms` : '--'}
        </div>
      </div>

      {/* Packets count */}
      <div className="p-3 bg-white/5 border border-white/5 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 text-[8px] uppercase tracking-tighter">Frame I/O</span>
          <LogIn size={12} className="text-zinc-600" />
        </div>
        <div className="text-xl font-light text-zinc-100 uppercase tracking-tighter">
          {state.status === 'connected' 
            ? `${state.packetsSent} / ${state.packetsReceived}` 
            : '0 / 0'}
        </div>
      </div>

      {/* active duration */}
      <div className="p-3 bg-white/5 border border-white/5 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-zinc-500 text-[8px] uppercase tracking-tighter">Uptime</span>
          <Clock size={12} className="text-zinc-600" />
        </div>
        <div className="text-xl font-light text-zinc-100">
          {state.status === 'connected' ? formatDuration(uptime) : '0:00'}
        </div>
      </div>
    </div>
  );
}
