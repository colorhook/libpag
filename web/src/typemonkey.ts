import { PAGModule } from './pag-module';
import { PAGSurface } from './pag-surface';
import { PAGPlayer } from './pag-player';
import { PAGComposition } from './pag-composition';
import { PAGTextLayer } from './pag-text-layer';
import { PAGImage } from './pag-image';
import { PAGImageLayer } from './pag-image-layer';
import { Matrix } from './core/matrix';
import type { PAGLayer } from './pag-layer';
import { TrackMatteType, type ParagraphJustification, type Rect, type TextDocument } from './types';

type Hex = string; // e.g. '#RRGGBB'

type TrackMatteMode = 'none' | 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';

function hexToRGB(hex?: Hex) {
  if (!hex) return { red: 255, green: 255, blue: 255 };
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { red: 255, green: 255, blue: 255 };
  const n = parseInt(m[1], 16);
  return { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 };
}

function toTrackMatteType(mode: TrackMatteMode = 'alpha'): TrackMatteType {
  switch (mode) {
    case 'alpha':
      return TrackMatteType.Alpha;
    case 'alpha-inverted':
      return TrackMatteType.AlphaInverted;
    case 'luma':
      return TrackMatteType.Luma;
    case 'luma-inverted':
      return TrackMatteType.LumaInverted;
    case 'none':
    default:
      return TrackMatteType.None;
  }
}

export interface TMCreateOptions {
  canvas: HTMLCanvasElement | string;
  width: number;
  height: number;
}

export interface TMTextOptions {
  text: string;
  startMs?: number;
  durationMs: number;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  fillColor?: Hex;
  strokeColor?: Hex;
  strokeWidth?: number;
  justification?: ParagraphJustification | 'Left' | 'Center' | 'Right' | 'Justify';
  leading?: number; // 0 = auto
  tracking?: number;
  // Auto wrap as box text if true
  autoWrap?: boolean;
  // Box rect (used when autoWrap=true)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface TMImageOptions {
  startMs?: number;
  durationMs: number;
  width: number;
  height: number;
  image: PAGImage | TexImageSource; // 支持直接传 TexImageSource
}

export interface TMCharAnimationOptions {
  type: 'fade' | 'slide';
  durationMs?: number;
  delayMs?: number;
  offset?: number;
  from?: 'left' | 'right' | 'top' | 'bottom';
  easing?: (t: number) => number;
  fadeFrom?: number;
}

export interface TMTrackMatteOptions {
  mode?: TrackMatteMode;
  syncTimeline?: boolean;
}

export interface TMRecorderOptions {
  fps?: number;
  mimeType?: string;
  bitsPerSecond?: number;
  timesliceMs?: number;
  ondata?: (chunk: Blob) => void;
}

export class TMProject {
  private _surface!: PAGSurface;
  private _player!: PAGPlayer;
  private _root!: PAGComposition;
  private _canvas!: HTMLCanvasElement;

  static async create(opts: TMCreateOptions) {
    const inst = new TMProject();
    inst.init(opts);
    return inst;
  }

  private init(opts: TMCreateOptions) {
    const canvasEl = typeof opts.canvas === 'string' ? (document.getElementById(opts.canvas) as HTMLCanvasElement) : opts.canvas;
    if (!canvasEl) throw new Error('Canvas element not found!');
    canvasEl.width = opts.width;
    canvasEl.height = opts.height;
    this._canvas = canvasEl;

    this._surface = PAGSurface.fromCanvas(canvasEl.id || this.ensureCanvasId(canvasEl));
    this._player = PAGPlayer.create();
    this._root = PAGComposition.make(opts.width, opts.height);
    this._player.setSurface(this._surface);
    this._player.setComposition(this._root);
  }

  private ensureCanvasId(canvas: HTMLCanvasElement) {
    if (!canvas.id) canvas.id = `pag-canvas-${Math.random().toString(36).slice(2)}`;
    return canvas.id;
  }

  context() {
    return { surface: this._surface, player: this._player, root: this._root };
  }

  canvas() {
    return this._canvas;
  }

  durationMs() {
    return this._player.duration() / 1000;
  }

  async prepare() {
    await this._player.prepare();
  }

  seekMs(ms: number) {
    const d = Math.max(1, this._player.duration());
    const p = (ms % (d / 1000)) / (d / 1000);
    this._player.setProgress(p);
  }

  async flush() {
    await this._player.flush();
  }

  // =============== Add Elements ===============
  addText(opts: TMTextOptions) {
    const dur = Math.max(1, Math.floor(opts.durationMs * 1000));
    const autoWrap = !!opts.autoWrap && !!opts.width;

    const text = opts.text ?? '';
    const size = opts.fontSize ?? 64;
    const fam = opts.fontFamily ?? '';
    const sty = opts.fontStyle ?? '';
    const fill = opts.fillColor;
    const stroke = opts.strokeColor;
    const strokeWidth = opts.strokeWidth ?? 1;

    let finalText = text;
    let wrappedBox: { width: number; height: number } | null = null;
    if (autoWrap) {
      const width = opts.width!;
      const lineHeight = (opts.leading === 0 || opts.leading === undefined) ? size * 1.2 : opts.leading!;
      const measureCanvas = document.createElement('canvas');
      const ctx = measureCanvas.getContext('2d');
      if (ctx) {
        ctx.font = `${size}px ${fam || 'sans-serif'}`;
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (ctx.measureText(test).width <= width) {
            cur = test;
          } else {
            if (cur) lines.push(cur);
            cur = w;
          }
        }
        if (cur) lines.push(cur);
        if (lines.length) {
          finalText = lines.join('\n');
          wrappedBox = { width, height: Math.max(lineHeight * lines.length, size) };
        }
      }
    }

    const textLayer = PAGTextLayer.make(dur, finalText, size, fam, sty);
    const textDoc = textLayer.getTextDocument();
    textDoc.text = finalText;
    textDoc.fontSize = size;
    textDoc.fontFamily = fam;
    textDoc.fontStyle = sty;
    if (opts.leading !== undefined) textDoc.leading = opts.leading;
    if (opts.tracking !== undefined) textDoc.tracking = opts.tracking;
    if (opts.justification) textDoc.justification = opts.justification;

    if (fill) {
      textDoc.applyFill = true;
      textDoc.fillColor = hexToRGB(fill) as any;
    }
    if (stroke) {
      textDoc.applyStroke = true;
      textDoc.strokeColor = hexToRGB(stroke) as any;
      textDoc.strokeWidth = strokeWidth;
    } else {
      textDoc.applyStroke = false;
    }

    if (autoWrap) {
      textDoc.boxText = true;
      (textDoc.boxTextPos as any).x = 0;
      (textDoc.boxTextPos as any).y = 0;
      (textDoc.boxTextSize as any).x = opts.width!;
      (textDoc.boxTextSize as any).y = opts.height ?? wrappedBox?.height ?? size * 1.2;
    } else {
      textDoc.boxText = false;
    }

    textLayer.setTextDocument(textDoc);

    this._root.addLayer(textLayer);
    if (opts.startMs) textLayer.setStartTime(Math.floor(opts.startMs * 1000));

    const handle = new TMTextHandle(this._player, textLayer, textDoc);
    const bx = opts.x ?? 0;
    const by = opts.y ?? 0;
    handle.setBasePosition(bx, by);
    handle.setTRS(bx, by, 1, 1, 0);
    if (autoWrap && !wrappedBox) {
      wrappedBox = { width: opts.width!, height: opts.height ?? size * 1.2 };
    }
    if (wrappedBox) handle.setBoxCache(wrappedBox);
    return handle;
  }

  addImage(opts: TMImageOptions) {
    const dur = Math.max(1, Math.floor(opts.durationMs * 1000));
    const layer = PAGImageLayer.make(opts.width, opts.height, dur);
    const pagImage = (opts.image instanceof PAGImage) ? opts.image : PAGImage.fromSource(opts.image as TexImageSource);
    layer.setImage(pagImage);
    this._root.addLayer(layer);
    if (opts.startMs) layer.setStartTime(Math.floor(opts.startMs * 1000));
    return new TMLayerHandle(this._player, layer);
  }

  addGroup(opts: { width: number; height: number; startMs?: number; durationMs?: number }) {
    const comp = PAGComposition.make(opts.width, opts.height);
    if (opts.durationMs && opts.durationMs > 0) {
      // 仅影响可见范围，libpag 内部以帧管理，保持默认即可
    }
    this._root.addLayer(comp as unknown as PAGLayer);
    if (opts.startMs) (comp as unknown as PAGLayer).setStartTime(Math.floor(opts.startMs * 1000));
    return new TMGroupHandle(this._player, comp);
  }

  applyTrackMatte(
    target: TMLayerHandle | TMTextHandle,
    matte: TMLayerHandle | TMTextHandle,
    options: TMTrackMatteOptions = {},
  ) {
    if (target.layer === matte.layer) throw new Error('Target and matte cannot be the same layer.');
    const mode = toTrackMatteType(options.mode ?? 'alpha');
    const success = target.layer.setTrackMatte(matte.layer, mode);
    if (!success) throw new Error('Failed to set track matte.');
    if (options.syncTimeline !== false) {
      const targetStart = target.layer.startTime();
      if (matte.layer.startTime() !== targetStart) {
        matte.layer.setStartTime(targetStart);
      }
    }
    return target;
  }

  clearTrackMatte(target: TMLayerHandle | TMTextHandle) {
    target.layer.clearTrackMatte();
    return target;
  }

  maskImageWithText(
    image: TMLayerHandle,
    text: TMTextHandle,
    options: TMTrackMatteOptions = {},
  ) {
    return this.applyTrackMatte(image, text, { mode: options.mode ?? 'alpha', syncTimeline: options.syncTimeline });
  }

  createRecorder(options: TMRecorderOptions = {}) {
    return new TMVideoRecorder(this._canvas, options);
  }

  // =============== Measurements ===============
  getLocalBounds(layer: PAGLayer): Rect {
    return (layer as any).getBounds();
  }

  getGlobalBounds(layer: PAGLayer): Rect {
    return this._player.getBounds(layer);
  }

  // =============== Filters ===============
  setGlobalBlur(px: number) {
    // 占位：当前仅能通过 2D Canvas 的 filter 实现整帧模糊，具体接入由业务层决定。
    console.warn('[TMProject] setGlobalBlur is a no-op placeholder in this build.');
  }
}

class TMLayerHandle {
  constructor(protected player: PAGPlayer, public layer: PAGLayer) {}

  setAlpha(a: number) {
    (this.layer as any).setAlpha(a);
    return this;
  }

  translate(x: number, y: number) {
    const m = (this.layer as any).matrix() as Matrix;
    m.postTranslate(x, y);
    (this.layer as any).setMatrix(m);
    return this;
  }

  scale(sx: number, sy?: number) {
    const m = (this.layer as any).matrix() as Matrix;
    m.postScale(sx, sy ?? sx);
    (this.layer as any).setMatrix(m);
    return this;
  }

  rotate(deg: number) {
    const m = (this.layer as any).matrix() as Matrix;
    m.postRotate(deg);
    (this.layer as any).setMatrix(m);
    return this;
  }

  // Reset matrix and set TRS in one go (avoid per-frame accumulation)
  setTRS(tx: number, ty: number, sx: number, sy: number, rotDeg: number) {
    const m = (this.layer as any).matrix() as Matrix;
    m.reset();
    m.postTranslate(tx, ty);
    m.postRotate(rotDeg);
    m.postScale(sx, sy);
    (this.layer as any).setMatrix(m);
    return this;
  }
}

class TMTextHandle extends TMLayerHandle {
  private baseX = 0;
  private baseY = 0;
  private boxCache: { width: number; height: number } | null = null;
  constructor(player: PAGPlayer, public textLayer: PAGTextLayer, private textDocRef: TextDocument | null) {
    super(player, textLayer as unknown as PAGLayer);
  }

  private withDoc(mutator: (doc: TextDocument) => void, commit = true) {
    if (!this.textDocRef) return;
    mutator(this.textDocRef);
    if (commit) this.textLayer.setTextDocument(this.textDocRef);
  }

  setBasePosition(x: number, y: number) { this.baseX = x; this.baseY = y; }
  basePosition() { return { x: this.baseX, y: this.baseY }; }

  setText(text: string) {
    if (this.textDocRef) {
      this.withDoc((doc) => {
        doc.text = text;
      });
    } else {
      this.textLayer.setText(text);
    }
    return this;
  }

  setFillColor(hex: Hex) {
    const color = hexToRGB(hex) as any;
    if (this.textDocRef) {
      this.withDoc((doc) => {
        doc.applyFill = true;
        doc.fillColor = color;
      });
    } else {
      this.textLayer.setFillColor(color);
    }
    return this;
  }

  setStroke(cfg?: { color: Hex; width?: number }) {
    if (this.textDocRef) {
      if (!cfg) {
        this.withDoc((doc) => {
          doc.applyStroke = false;
        });
      } else {
        const color = hexToRGB(cfg.color) as any;
        this.withDoc((doc) => {
          doc.applyStroke = true;
          doc.strokeColor = color;
          if (cfg.width !== undefined) doc.strokeWidth = cfg.width;
        });
      }
    } else if (cfg) {
      this.textLayer.setStrokeColor(hexToRGB(cfg.color) as any);
    }
    return this;
  }

  setFont(font: { family?: string; style?: string }) {
    if (this.textDocRef) {
      this.withDoc((doc) => {
        if (font.family) doc.fontFamily = font.family;
        if (font.style) doc.fontStyle = font.style;
      });
    }
    return this;
  }

  setFontSize(size: number) {
    if (this.textDocRef) {
      this.withDoc((doc) => {
        doc.fontSize = size;
      });
    } else {
      this.textLayer.setFontSize(size);
    }
    return this;
  }

  setSpacing(sp: { leading?: number; tracking?: number }) {
    if (this.textDocRef) {
      this.withDoc((doc) => {
        if (sp.leading !== undefined) doc.leading = sp.leading;
        if (sp.tracking !== undefined) doc.tracking = sp.tracking;
      });
    }
    return this;
  }

  setJustification(j: ParagraphJustification | 'Left' | 'Center' | 'Right' | 'Justify') {
    if (this.textDocRef) {
      this.withDoc((doc) => {
        doc.justification = j as ParagraphJustification;
      });
    }
    return this;
  }

  animateCharacters(opts: TMCharAnimationOptions = { type: 'fade' }) {
    const options: TMCharAnimationOptions = { type: 'fade', ...opts };
    const durationSec = Math.max(0.016, (options.durationMs ?? 400) / 1000);
    const delaySec = Math.max(0, (options.delayMs ?? 60) / 1000);
    const easing = options.easing ?? ((t: number) => {
      const clamped = Math.max(0, Math.min(1, t));
      const inv = 1 - clamped;
      return 1 - inv * inv * inv;
    });
    const fadeFrom = options.fadeFrom ?? 0;

    const offsetDistance = options.offset ?? 80;
    const direction = options.from ?? 'right';
    const offsetVec = (() => {
      switch (direction) {
        case 'left':
          return { x: -offsetDistance, y: 0 };
        case 'top':
          return { x: 0, y: -offsetDistance };
        case 'bottom':
          return { x: 0, y: offsetDistance };
        case 'right':
        default:
          return { x: offsetDistance, y: 0 };
      }
    })();

    this.textLayer.setGlyphTransform(({ index, timeUS }) => {
      const now = (timeUS ?? 0) / 1e6;
      const progressRaw = (now - index * delaySec) / durationSec;
      if (progressRaw <= 0) {
        if (options.type === 'fade') {
          return { alpha: fadeFrom };
        }
        return { alpha: fadeFrom, dx: offsetVec.x, dy: offsetVec.y };
      }
      if (progressRaw >= 1) {
        return { alpha: 1, dx: 0, dy: 0 };
      }
      const easedRaw = easing(progressRaw);
      const eased = Math.max(0, Math.min(1, easedRaw));
      const alphaRaw = fadeFrom + (1 - fadeFrom) * eased;
      const alpha = Math.max(0, Math.min(1, alphaRaw));
      if (options.type === 'fade') {
        return { alpha };
      }
      const inv = 1 - eased;
      return {
        alpha,
        dx: offsetVec.x * inv,
        dy: offsetVec.y * inv,
      };
    });
    return this;
  }

  clearCharacterAnimation() {
    this.textLayer.clearGlyphTransform();
    return this;
  }

  getBoxSize(): { width: number; height: number } | null {
    return this.boxCache;
    }

  setBoxCache(size: { width: number; height: number }) {
    this.boxCache = size;
  }
}

class TMGroupHandle extends TMLayerHandle {
  constructor(player: PAGPlayer, public comp: PAGComposition) {
    super(player, comp as unknown as PAGLayer);
  }

  add(layer: PAGLayer) {
    this.comp.addLayer(layer as any);
    return this;
  }
}

export class TMVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopResolver: ((blob: Blob) => void) | null = null;
  private stopRejecter: ((reason?: any) => void) | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private stream: MediaStream | null = null;
  private readonly fps: number;
  private readonly mimeType: string | undefined;
  private readonly bitsPerSecond?: number;
  private readonly timeslice?: number;
  private readonly ondata?: (chunk: Blob) => void;

  constructor(private canvas: HTMLCanvasElement, opts: TMRecorderOptions = {}) {
    if (typeof window === 'undefined') throw new Error('Recorder is only available in browser environments.');
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API is not supported in this environment.');
    }
    if (typeof canvas.captureStream !== 'function') {
      throw new Error('Current canvas does not support captureStream().');
    }
    this.fps = opts.fps ?? 60;
    this.mimeType = this.pickMimeType(opts.mimeType);
    this.bitsPerSecond = opts.bitsPerSecond;
    this.timeslice = opts.timesliceMs;
    this.ondata = opts.ondata;
  }

  private pickMimeType(requested?: string) {
    const candidates = [requested,
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'];
    for (const type of candidates) {
      if (!type) continue;
      if (typeof (MediaRecorder as any).isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported(type)) return type;
      } else {
        return type;
      }
    }
    return requested;
  }

  private ensureRecorder() {
    if (this.recorder) return;
    this.chunks = [];
    this.stream = this.canvas.captureStream(this.fps);
    const options: MediaRecorderOptions = {};
    if (this.mimeType) options.mimeType = this.mimeType;
    if (this.bitsPerSecond) options.bitsPerSecond = this.bitsPerSecond;
    this.recorder = new MediaRecorder(this.stream, options);

    this.recorder.ondataavailable = (evt) => {
      if (evt.data && evt.data.size > 0) {
        this.chunks.push(evt.data);
        if (this.ondata) this.ondata(evt.data);
      }
    };
    this.recorder.onerror = (evt) => {
      if (this.stopRejecter) this.stopRejecter(evt);
      this.cleanup();
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mimeType || this.recorder?.mimeType || 'video/webm' });
      if (this.stopResolver) this.stopResolver(blob);
      this.cleanup();
    };
  }

  private cleanup() {
    this.recorder = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.stopResolver = null;
    this.stopRejecter = null;
    this.stopPromise = null;
  }

  start() {
    if (this.isRecording()) return;
    this.ensureRecorder();
    if (!this.recorder) throw new Error('Failed to initialize MediaRecorder.');
    this.stopPromise = new Promise<Blob>((resolve, reject) => {
      this.stopResolver = resolve;
      this.stopRejecter = reject;
    });
    this.recorder.start(this.timeslice);
  }

  pause() {
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.pause();
    }
  }

  resume() {
    if (this.recorder && this.recorder.state === 'paused') {
      this.recorder.resume();
    }
  }

  async stop(): Promise<Blob> {
    if (!this.recorder) {
      return new Blob([], { type: this.mimeType || 'video/webm' });
    }
    const promise = this.stopPromise ?? new Promise<Blob>((resolve) => resolve(new Blob([], { type: this.mimeType || 'video/webm' })));
    this.recorder.stop();
    return promise;
  }

  isRecording() {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  streamHandle() {
    return this.stream;
  }

  async download(filename = 'output.webm') {
    const blob = await this.stop();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return blob;
  }
}
