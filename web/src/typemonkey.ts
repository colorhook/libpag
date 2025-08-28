import { PAGModule } from './pag-module';
import { PAGSurface } from './pag-surface';
import { PAGPlayer } from './pag-player';
import { PAGComposition } from './pag-composition';
import { PAGTextLayer } from './pag-text-layer';
import { PAGImage } from './pag-image';
import { PAGImageLayer } from './pag-image-layer';
import { Matrix } from './core/matrix';
import type { PAGLayer } from './pag-layer';
import type { ParagraphJustification, Rect } from './types';

type Hex = string; // e.g. '#RRGGBB'

function hexToRGB(hex?: Hex) {
  if (!hex) return { red: 255, green: 255, blue: 255 };
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { red: 255, green: 255, blue: 255 };
  const n = parseInt(m[1], 16);
  return { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 };
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

export class TMProject {
  private _surface!: PAGSurface;
  private _player!: PAGPlayer;
  private _root!: PAGComposition;

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
    let textLayer: PAGTextLayer;
    let wrappedBox: { width: number; height: number } | null = null;
    const autoWrap = !!opts.autoWrap && !!opts.width;

    // fallback auto-wrap via manual newlines measured by Canvas2D
    const text = opts.text ?? '';
    const size = opts.fontSize ?? 64;
    const fam = opts.fontFamily ?? '';
    const sty = opts.fontStyle ?? '';
    const fill = opts.fillColor;
    const stroke = opts.strokeColor;
    const strokeWidth = opts.strokeWidth ?? 1;

    let finalText = text;
    if (autoWrap) {
      const width = opts.width!;
      const lineHeight = (opts.leading === 0 || opts.leading === undefined) ? size * 1.2 : (opts.leading!);
      const measureCanvas = document.createElement('canvas');
      const ctx = measureCanvas.getContext('2d')!;
      ctx.font = `${size}px ${fam || 'sans-serif'}`;
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width <= width) {
          cur = test;
        } else {
          if (cur) lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      finalText = lines.join('\n');
      wrappedBox = { width, height: Math.max(lineHeight * lines.length, size) };
    }

    textLayer = PAGTextLayer.make(dur, finalText, size, fam, sty);
    if (fill) textLayer.setFillColor(hexToRGB(fill) as any);
    if (stroke) {
      textLayer.setStrokeColor(hexToRGB(stroke) as any);
      // strokeWidth not exposed directly; retained in doc cache only
    }

    this._root.addLayer(textLayer);
    if (opts.startMs) textLayer.setStartTime(Math.floor(opts.startMs * 1000));

    const handle = new TMTextHandle(this._player, textLayer, null);
    // initial placement via transform (top-left approx)
    const bx = opts.x ?? 0;
    const by = opts.y ?? 0;
    handle.setBasePosition(bx, by);
    handle.setTRS(bx, by, 1, 1, 0);
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
  constructor(player: PAGPlayer, public textLayer: PAGTextLayer, private textDocRef: any | null) {
    super(player, textLayer as unknown as PAGLayer);
  }

  setBasePosition(x: number, y: number) { this.baseX = x; this.baseY = y; }
  basePosition() { return { x: this.baseX, y: this.baseY }; }

  setText(text: string) {
    this.textLayer.setText(text);
    if (this.textDocRef) this.textDocRef.text = text;
    return this;
  }

  setFillColor(hex: Hex) {
    this.textLayer.setFillColor(hexToRGB(hex) as any);
    if (this.textDocRef) this.textDocRef.fillColor = hexToRGB(hex);
    return this;
  }

  setStroke(cfg: { color: Hex; width: number }) {
    this.textLayer.setStrokeColor(hexToRGB(cfg.color) as any);
    if (this.textDocRef) {
      this.textDocRef.applyStroke = true;
      this.textDocRef.strokeColor = hexToRGB(cfg.color);
      this.textDocRef.strokeWidth = cfg.width;
    }
    return this;
  }

  setFont(font: { family?: string; style?: string }) {
    if (this.textDocRef) {
      if (font.family) this.textDocRef.fontFamily = font.family;
      if (font.style) this.textDocRef.fontStyle = font.style;
    }
    // 运行时也可通过 PAGFont 注册并 setFont，这里保持轻量
    return this;
  }

  setFontSize(size: number) {
    this.textLayer.setFontSize(size);
    if (this.textDocRef) this.textDocRef.fontSize = size;
    return this;
  }

  setSpacing(sp: { leading?: number; tracking?: number }) {
    if (this.textDocRef) {
      if (sp.leading !== undefined) this.textDocRef.leading = sp.leading;
      if (sp.tracking !== undefined) this.textDocRef.tracking = sp.tracking;
    }
    return this;
  }

  setJustification(j: ParagraphJustification | 'Left' | 'Center' | 'Right' | 'Justify') {
    if (this.textDocRef) this.textDocRef.justification = j;
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
