import { PAGFile } from '../pag-file';
import { PAGSolidLayer } from '../pag-solid-layer';
import { PAGTextLayer } from '../pag-text-layer';
import { PAGImageLayer } from '../pag-image-layer';
import { PAGImage } from '../pag-image';
import type { Transform2D } from '../transform-2d';
import type { Color, TextDocument, TextMotionOptions } from '../types';

import type { Project, ProjectBackground, TextBlock, TextStyle, RGBAColor } from './types';

const SPEED_DURATION_SECONDS: Record<TextBlock['speed'], number> = {
  fast: 1.6,
  medium: 2.4,
  slow: 3.2,
};

const SPEED_EFFECT_DELAY: Record<TextBlock['speed'], number> = {
  fast: 0.035,
  medium: 0.055,
  slow: 0.08,
};

const DISTANCE_BY_MOTION: Record<TextBlock['motionType'], number> = {
  fade: 0,
  slideLeft: 220,
  slideDown: 160,
  scaleIn: 0,
  swing: 120,
};

const DEFAULT_TEXT_EFFECT: TextMotionOptions['effect'] = 'letter';

export interface BuildOptions {
  /** Optional scaling factor applied to all layout calculations. */
  readonly pixelRatio?: number;
}

/** Build a PAGFile from a serialized project description. */
export async function buildPAGFileFromProject(project: Project, options: BuildOptions = {}): Promise<PAGFile> {
  const durationFrames = Math.max(1, Math.round(project.duration * project.framerate));
  const durationUS = Math.max(1, Math.round(project.duration * 1_000_000));
  const pagFile = PAGFile.makeEmpty(project.width, project.height, durationFrames);

  await applyBackground(pagFile, project.background, project, durationUS);

  const blocks = [...project.blocks].sort((a, b) => a.startTime - b.startTime);
  blocks.forEach((block, index) => {
    const mergedStyle = mergeStyles(project.globalStyle, block.style);
    const layerDuration = SPEED_DURATION_SECONDS[block.speed] ?? SPEED_DURATION_SECONDS.medium;
    const layerDurationUS = Math.max(500_000, Math.round(layerDuration * 1_000_000));
    const textLayer = PAGTextLayer.make(layerDurationUS, block.text, mergedStyle.fontSize, mergedStyle.fontFamily, deriveFontStyle(mergedStyle));

    const textDoc = textLayer.getTextDocument();
    applyTextStyle(textDoc, mergedStyle, block.text);
    textLayer.setTextDocument(textDoc);

    const motion = createMotionOptions(block);
    textLayer.setTextMotionOptions(motion);

    const transform = textLayer.getTransform2D();
    applyLayoutTransform(transform, block, index, blocks.length, project, options.pixelRatio ?? 1);
    textLayer.setTransform2D(transform);

    textLayer.setStartTime(Math.max(0, Math.round(block.startTime * 1_000_000)));
    pagFile.addLayer(textLayer);
  });

  return pagFile;
}

function mergeStyles(base: TextStyle, override?: Partial<TextStyle>): TextStyle {
  if (!override) return base;
  return {
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontWeight: override.fontWeight ?? base.fontWeight,
    fontSize: override.fontSize ?? base.fontSize,
    lineHeight: override.lineHeight ?? base.lineHeight,
    letterSpacing: override.letterSpacing ?? base.letterSpacing,
    fill: override.fill ?? base.fill,
    stroke: override.stroke ?? base.stroke,
  };
}

function deriveFontStyle(style: TextStyle): string {
  const weight = style.fontWeight;
  if (weight === 'bold') return 'Bold';
  if (typeof weight === 'number') {
    if (weight >= 600) return 'Bold';
    if (weight <= 300) return 'Light';
  }
  if (weight === 'normal' || weight === undefined) return '';
  return String(weight);
}

function applyTextStyle(doc: TextDocument, style: TextStyle, text: string) {
  doc.text = text;
  doc.fontFamily = style.fontFamily;
  doc.fontStyle = deriveFontStyle(style);
  doc.fontSize = style.fontSize;
  if (style.lineHeight !== undefined) doc.leading = style.lineHeight;
  if (style.letterSpacing !== undefined) doc.tracking = style.letterSpacing;

  doc.applyFill = true;
  doc.fillColor = rgbaToColor(style.fill);

  if (style.stroke) {
    doc.applyStroke = true;
    doc.strokeColor = rgbaToColor(style.stroke.color);
    doc.strokeWidth = style.stroke.width;
    doc.strokeOverFill = true;
  } else {
    doc.applyStroke = false;
  }
}

function createMotionOptions(block: TextBlock): TextMotionOptions {
  const durationSeconds = SPEED_DURATION_SECONDS[block.speed] ?? SPEED_DURATION_SECONDS.medium;
  const easing = mapEasing(block.easingType);
  const base: TextMotionOptions = {
    effect: DEFAULT_TEXT_EFFECT,
    duration: durationSeconds,
    easing,
  };

  switch (block.motionType) {
    case 'fade':
      base.type = 'fade';
      break;
    case 'slideLeft':
      base.type = 'slide';
      base.direction = 'left';
      base.distance = DISTANCE_BY_MOTION.slideLeft;
      break;
    case 'slideDown':
      base.type = 'slide';
      base.direction = 'down';
      base.distance = DISTANCE_BY_MOTION.slideDown;
      break;
    case 'scaleIn':
      base.type = 'scale';
      break;
    case 'swing':
      base.type = 'swing';
      base.direction = 'side';
      break;
  }

  base.effect_delay = SPEED_EFFECT_DELAY[block.speed] ?? 0.05;
  base.effect_smooth = easing === 'smooth' ? 'smooth' : easing;

  return base;
}

function mapEasing(easing: TextBlock['easingType']): TextMotionOptions['easing'] {
  switch (easing) {
    case 'easeIn':
      return 'easeIn';
    case 'easeOut':
      return 'easeOut';
    case 'backIn':
    case 'backOut':
    case 'backInOut':
      return 'back';
    case 'bounceOut':
      return 'bounce';
    case 'easeInOut':
    case 'linear':
    default:
      return 'smooth';
  }
}

function applyLayoutTransform(
  transform: Transform2D,
  block: TextBlock,
  index: number,
  total: number,
  project: Project,
  pixelRatio: number,
) {
  const centerX = (project.width * pixelRatio) / 2;
  const centerY = (project.height * pixelRatio) / 2;
  let position = { x: centerX, y: centerY };
  let rotation = 0;

  switch (block.layout) {
    case 'bottom': {
      position = { x: centerX, y: project.height * pixelRatio * 0.78 };
      break;
    }
    case 'cw':
    case 'ccw': {
      const radius = Math.min(project.width, project.height) * pixelRatio * 0.3;
      const direction = block.layout === 'cw' ? 1 : -1;
      const angleStep = (Math.PI * 2) / Math.max(total, 3);
      const theta = -Math.PI / 2 + direction * angleStep * index;
      position = {
        x: centerX + Math.cos(theta) * radius,
        y: centerY + Math.sin(theta) * radius,
      };
      rotation = (theta * 180) / Math.PI + (block.layout === 'cw' ? 90 : -90);
      break;
    }
  }

  transform.setPosition(position);
  transform.setRotation(rotation);
  transform.setOpacity(255);
}

function rgbaToColor(color: RGBAColor): Color {
  return {
    red: Math.round(color.r * 255),
    green: Math.round(color.g * 255),
    blue: Math.round(color.b * 255),
  };
}

async function applyBackground(
  pagFile: PAGFile,
  background: ProjectBackground,
  project: Project,
  durationUS: number,
) {
  switch (background.type) {
    case 'solid': {
      const layer = PAGSolidLayer.make(durationUS, project.width, project.height, rgbaToColor(background.color),
        Math.round(background.color.a * 255),
      );
      pagFile.addLayer(layer);
      break;
    }
    case 'linear-gradient': {
      const canvas = await renderGradientToCanvas(background, project.width, project.height);
      if (canvas) {
        const pagImage = PAGImage.fromSource(canvas);
        const imageLayer = PAGImageLayer.make(project.width, project.height, durationUS);
        imageLayer.setImage(pagImage);
        pagFile.addLayer(imageLayer);
      }
      break;
    }
    case 'image': {
      const image = await loadImage(background.url);
      const pagImage = PAGImage.fromSource(image);
      const imageLayer = PAGImageLayer.make(project.width, project.height, durationUS);
      imageLayer.setImage(pagImage);
      pagFile.addLayer(imageLayer);
      break;
    }
    case 'pag': {
      const buffer = await fetch(background.url).then((resp) => {
        if (!resp.ok) throw new Error(`Failed to load PAG background: ${resp.status}`);
        return resp.arrayBuffer();
      });
      const nested = PAGFile.loadFromBuffer(buffer);
      pagFile.addLayer(nested);
      break;
    }
  }
}

async function renderGradientToCanvas(
  background: Extract<ProjectBackground, { type: 'linear-gradient' }>,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const angleRad = (background.angle % 360) * (Math.PI / 180);
  const halfW = width / 2;
  const halfH = height / 2;
  const diag = Math.sqrt(width * width + height * height);
  const x0 = halfW - Math.cos(angleRad) * (diag / 2);
  const y0 = halfH - Math.sin(angleRad) * (diag / 2);
  const x1 = halfW + Math.cos(angleRad) * (diag / 2);
  const y1 = halfH + Math.sin(angleRad) * (diag / 2);
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  background.stops.forEach((stop) => {
    const color = stop.color;
    grad.addColorStop(stop.offset, `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') throw new Error('Image constructor unavailable in this environment.');
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = (err) => reject(err);
    image.src = url;
  });
}
