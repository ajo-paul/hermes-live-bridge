/**
 * Lightweight, high-compatibility audio recorder that captures browser microphone audio,
 * downsamples it to 16kHz 16-bit little-endian mono PCM, and streams the base64 chunks
 * in real-time, designed specifically for the Gemini Multimodal Live API.
 */
export class PCMAudioRecorder {
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioChunk: (base64Data: string) => void;
  public isRecording: boolean = false;

  constructor(onAudioChunk: (base64Data: string) => void) {
    this.onAudioChunk = onAudioChunk;
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      // 1. Request microphone input stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize AudioContext
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const inputSampleRate = this.audioCtx.sampleRate;
      const targetSampleRate = 16000;

      this.source = this.audioCtx.createMediaStreamSource(this.stream);

      // 3. Create ScriptProcessorNode (buffer size 4096 / mono input & output)
      // Note: We use ScriptProcessorNode here for broad, zero-dependency browser compatibility
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording) return;

        const inputBuffer = e.inputBuffer.getChannelData(0);
        const downsampled = this.downsample(inputBuffer, inputSampleRate, targetSampleRate);
        const base64 = this.intArrayToBase64(downsampled);

        if (base64) {
          this.onAudioChunk(base64);
        }
      };

      // 4. Connect graph nodes
      this.source.connect(this.processor);
      this.processor.connect(this.audioCtx.destination);

      this.isRecording = true;
      console.log(`🎙️ Microphone recording started (Captured sample rate: ${inputSampleRate}Hz -> target: ${targetSampleRate}Hz)`);
    } catch (err) {
      console.error('❌ Failed to start microphone recording:', err);
      this.stop();
      throw err;
    }
  }

  public stop(): void {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioCtx) {
      if (this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
      }
      this.audioCtx = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    console.log('🎙️ Microphone recording stopped');
  }

  /**
   * Linear downsampling algorithm to convert buffer sample rates to 16kHz
   */
  private downsample(buffer: Float32Array, inputSR: number, outputSR: number): Int16Array {
    if (inputSR === outputSR) {
      const intBuffer = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        intBuffer[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
      }
      return intBuffer;
    }

    const sampleRateRatio = inputSR / outputSR;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const val = count > 0 ? accum / count : 0;
      result[offsetResult] = Math.min(1, Math.max(-1, val)) * 32767;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  /**
   * High performance array buffer encoder to base64 string
   */
  private intArrayToBase64(int16Array: Int16Array): string {
    const buffer = int16Array.buffer;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
