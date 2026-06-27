/**
 * High-performance, gapless PCM audio player designed for 24kHz 16-bit little-endian
 * audio stream playback from the Gemini Multimodal Live API.
 */
export class PCMAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;

  constructor() {
    // Initialise audio lazily on user interaction to avoid browser warnings
  }

  private initContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
      this.nextStartTime = this.audioCtx.currentTime;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public playChunk(base64Data: string) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      // Decode base64 to binary array
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit Signed integer PCM data to Float32 array for AudioBuffer
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0; // Normalise to -1.0 .. 1.0
      }

      // Create AudioBuffer
      const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Create AudioBufferSourceNode
      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      // Track timeline alignment for gapless playback
      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.isPlaying = true;
      
      // Advance play cursor timeline
      this.nextStartTime += audioBuffer.duration;
    } catch (e) {
      console.error('Error playing raw PCM chunk:', e);
    }
  }

  public stop() {
    // Reset audio queue
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.isPlaying = false;
    this.nextStartTime = 0;
  }
}
