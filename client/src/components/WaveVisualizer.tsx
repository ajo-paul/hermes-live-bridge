import { useEffect, useRef } from 'react';

interface WaveVisualizerProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  isStreaming: boolean;
  isAudioMode: boolean;
}

export default function WaveVisualizer({ status, isStreaming, isAudioMode }: WaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Render loop
    const render = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clean canvas
      ctx.clearRect(0, 0, width, height);

      if (status === 'disconnected') {
        // Draw flat line
        ctx.beginPath();
        ctx.strokeStyle = '#27272a'; // Zinc 800
        ctx.lineWidth = 1.0;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      // Base speeds and heights based on states
      let speed = isStreaming ? 0.25 : 0.05;
      let maxAmplitude = isStreaming ? 24 : 6;

      if (status === 'connecting') {
        speed = 0.12;
        maxAmplitude = 10;
      }
      
      if (isAudioMode && isStreaming) {
        speed = 0.35;
        maxAmplitude = 36;
      }

      phase += speed;

      // Draw three overlay waves
      const waveTypes = [
        { amplitude: maxAmplitude, frequency: 0.015, color: 'rgba(245, 158, 11, 0.65)' },  // Amber 500
        { amplitude: maxAmplitude * 0.6, frequency: 0.03, color: 'rgba(252, 211, 77, 0.45)' }, // Amber 300
        { amplitude: maxAmplitude * 0.3, frequency: 0.05, color: 'rgba(254, 243, 199, 0.25)' }, // Amber 100
      ];

      waveTypes.forEach((wave) => {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.amplitude === maxAmplitude ? 2.5 : 1.2;

        for (let x = 0; x <= width; x += 2) {
          // Dynamic sine computation
          const baseSin = Math.sin(x * wave.frequency + phase);
          const noise = isStreaming ? Math.sin(x * 0.08 - phase * 1.5) * 2 : 0;
          const y = height / 2 + baseSin * wave.amplitude + noise;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      // Ambient dots showing active data packets
      if (isStreaming) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
        for (let i = 0; i < 4; i++) {
          const dotX = (width * 0.2 + (phase * 60 + i * width * 0.22)) % width;
          const dotY = height / 2 + Math.sin(dotX * 0.02 + phase) * 12;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [status, isStreaming, isAudioMode]);

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active Datastream Buffer</h2>
      <div className="relative w-full h-24 bg-black/60 rounded flex items-end justify-center p-4">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-[8px] font-mono text-zinc-700">
            {status === 'disconnected' ? '0.00dB (Suppressed)' : isStreaming ? 'STREAMING' : 'READY (IDLE)'}
          </span>
        </div>
      </div>
    </div>
  );
}
