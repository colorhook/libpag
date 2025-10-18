import { PAGModule } from './pag-module';
import { PAGPlayer } from './pag-player';
import { PAGSurface } from './pag-surface';
import { ColorType, AlphaType } from './types';
import type { PAGFile } from './pag-file';

export interface PAGRecorderOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number; // microseconds
}

export interface PAGRecorderProgressEvent extends Event {
  readonly progress: number;
}

export interface PAGRecorderCompleteEvent extends Event {
  readonly blob: Blob;
  readonly filename: string;
}

export interface PAGRecorderErrorEvent extends Event {
  readonly error: Error;
}

const DEFAULT_FRAME_RATE = 30;

export class PAGRecorder extends EventTarget {
  private readonly pagFile: PAGFile;
  private readonly width: number;
  private readonly height: number;
  private readonly frameRate: number;
  private readonly durationUS: number;
  private readonly totalFrames: number;

  private pagPlayer: PAGPlayer | null = null;
  private pagSurface: PAGSurface | null = null;
  private recording = false;
  private cancelled = false;
  private progressValue = 0;
  private resultBlob: Blob | null = null;
  private outputFilename = '';
  private canvas: HTMLCanvasElement | null = null;

  public constructor(pagFile: PAGFile, options: PAGRecorderOptions = {}) {
    super();
    if (!PAGModule) {
      throw new Error('PAG module is not initialized.');
    }
    this.pagFile = pagFile;
    const width = options.width ?? pagFile.width();
    const height = options.height ?? pagFile.height();
    const sourceFrameRate = pagFile.frameRate() || DEFAULT_FRAME_RATE;
    const frameRate = options.frameRate ?? sourceFrameRate;
    const effectiveFrameRate = frameRate || DEFAULT_FRAME_RATE;
    const durationUS = options.duration ?? pagFile.duration();
    const frameDurationUS = Math.max(1, Math.round(1_000_000 / effectiveFrameRate));
    const totalFrames = Math.max(1, Math.round(durationUS / frameDurationUS));
    this.width = width;
    this.height = height;
    this.frameRate = effectiveFrameRate;
    this.durationUS = durationUS;
    this.totalFrames = totalFrames;
  }

  public start(): void {
    if (this.recording) return;
    this.recording = true;
    this.cancelled = false;
    this.progressValue = 0;
    this.resultBlob = null;
    this.outputFilename = `pag-recording-${Date.now()}.mp4`;
    this.initialize()
      .then(() => this.encode())
      .catch((error) => this.emitError(error));
  }

  public stop(): void {
    if (!this.recording) return;
    this.cancelled = true;
  }

  public cancel(): void {
    this.stop();
  }

  public get progress(): number {
    return this.progressValue;
  }

  public get blob(): Blob | null {
    return this.resultBlob;
  }

  private async initialize(): Promise<void> {
    const canvas = this.ensureRecorderCanvas();
    const surface = PAGSurface.fromCanvas(canvas.id);
    surface.updateSize();
    surface.clearAll();
    this.pagSurface = surface;

    const player = PAGPlayer.create();
    player.setSurface(surface);
    player.setComposition(this.pagFile as unknown as any);
    player.setProgress(0);
    await player.flush();
    this.pagPlayer = player;
  }

  private async encode(): Promise<void> {
    if (!this.pagPlayer || !this.pagSurface) {
      throw new Error('Recorder not initialized.');
    }
    const VideoEncoderCtor = (window as any).VideoEncoder as typeof VideoEncoder | undefined;
    const VideoFrameCtor = (window as any).VideoFrame as typeof VideoFrame | undefined;
    if (typeof VideoEncoderCtor !== 'function' || typeof VideoFrameCtor !== 'function') {
      throw new Error('WebCodecs VideoEncoder is not supported in this browser.');
    }

    const frameDurationUS = Math.round(1_000_000 / this.frameRate);
    const chunkBuffers: Uint8Array[] = [];
    let videoConfig: VideoDecoderConfig | null = null;

    const encoder = new VideoEncoderCtor({
      output: (chunk, metadata) => {
        const chunkData = new Uint8Array(chunk.byteLength);
        chunk.copyTo(chunkData);
        chunkBuffers.push(chunkData);
        if (!videoConfig && metadata?.decoderConfig) {
          videoConfig = metadata.decoderConfig;
        }
      },
      error: (error) => this.emitError(error),
    });

    encoder.configure({
      codec: 'avc1.640032',
      width: this.width,
      height: this.height,
      framerate: this.frameRate,
      avc: { format: 'annexb' },
    });

    for (let frame = 0; frame < this.totalFrames; frame++) {
      if (this.cancelled) break;
      const progress = this.totalFrames > 1 ? frame / (this.totalFrames - 1) : 1;
      const pixels = (await PAGModule.webAssemblyQueue.exec(() => {
        if (!this.pagPlayer || !this.pagSurface) {
          return null;
        }
        try {
          PAGModule.currentPlayer = this.pagPlayer;
          const playerIns = this.pagPlayer.wasmIns;
          playerIns._setProgress(progress);
          playerIns._flush();
          const rowBytes = this.width * 4;
          this.pagSurface.wasmIns._updateSize();
          let data = this.pagSurface.wasmIns._readPixels(
            ColorType.RGBA_8888,
            AlphaType.Premultiplied,
            rowBytes,
          ) as Uint8Array | null;
          if (!data || data.length === 0) {
            playerIns._flush();
            this.pagSurface.wasmIns._updateSize();
            data = this.pagSurface.wasmIns._readPixels(
              ColorType.RGBA_8888,
              AlphaType.Premultiplied,
              rowBytes,
            ) as Uint8Array | null;
          }
          return data ? new Uint8Array(data) : null;
        } finally {
          PAGModule.currentPlayer = null;
        }
      }, this)) as Uint8Array | null;
      if (!pixels || pixels.length === 0) {
        throw new Error('Failed to read pixels from PAGSurface.');
      }
      const planarBuffer = new Uint8Array(pixels);
      const videoFrame = new VideoFrameCtor(planarBuffer, {
        timestamp: frame * frameDurationUS,
        codedWidth: this.width,
        codedHeight: this.height,
        format: 'RGBA',
      });
      encoder.encode(videoFrame);
      videoFrame.close();
      this.progressValue = progress;
      this.emitProgress(progress);
    }

    await encoder.flush();
    encoder.close();

    if (this.cancelled) {
      this.cleanup();
      return;
    }

    if (!videoConfig) {
      throw new Error('Video encoder did not provide configuration.');
    }

    // TODO: parse audio bytes from PAG file and mux audio with video
    this.resultBlob = new Blob(chunkBuffers, { type: 'video/mp4' });
    this.progressValue = 1;
    this.emitProgress(1);
    this.emitComplete();
    this.cleanup();
  }

  private ensureRecorderCanvas(): HTMLCanvasElement {
    let canvas = document.getElementById('pag-recorder-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'pag-recorder-canvas';
      canvas.style.position = 'fixed';
      canvas.style.pointerEvents = 'none';
      canvas.style.opacity = '0';
      canvas.style.top = '-10000px';
      canvas.style.left = '-10000px';
      document.body.appendChild(canvas);
    }
    canvas.width = this.width;
    canvas.height = this.height;
    this.canvas = canvas;
    return canvas;
  }

  private emitProgress(progress: number): void {
    const event = new Event('progress') as PAGRecorderProgressEvent;
    Object.defineProperty(event, 'progress', { value: progress, enumerable: true });
    this.dispatchEvent(event);
  }

  private emitComplete(): void {
    const event = new Event('complete') as PAGRecorderCompleteEvent;
    Object.defineProperty(event, 'blob', { value: this.resultBlob, enumerable: true });
    Object.defineProperty(event, 'filename', { value: this.outputFilename, enumerable: true });
    this.dispatchEvent(event);
  }

  private emitError(error: Error): void {
    const event = new Event('error') as PAGRecorderErrorEvent;
    Object.defineProperty(event, 'error', { value: error, enumerable: true });
    this.dispatchEvent(event);
    this.cleanup();
  }

  private cleanup(): void {
    this.recording = false;
    if (this.pagPlayer) {
      this.pagPlayer.setSurface(null);
      this.pagPlayer.destroy();
      this.pagPlayer = null;
    }
    if (this.pagSurface) {
      this.pagSurface.destroy();
      this.pagSurface = null;
    }
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
  }
}
