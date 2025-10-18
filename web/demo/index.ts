import { PAGInit, types } from '../src/pag';
import { AudioPlayer } from './module/audio-player';

import type { PAGFile } from '../src/pag-file';
import type { PAGView } from '../src/pag-view';
import type { PAG as PAGNamespace, TextDocument, TextMotionOptions } from '../src/types';
import type { PAGComposition } from '../src/pag-composition';
import type { PAGImageLayer } from '../src/pag-image-layer';
import type { PAGTextLayer } from '../src/pag-text-layer';
import { Transform3D } from '../src/transform-3d';
import { SlideLeftPreset } from '../src/slide-left-preset';

declare global {
  interface Window {
    VConsole: any;
    ffavc: any;
  }
}

let pagView: PAGView;
let pagFile: PAGFile;
let cacheEnabled: boolean;
let videoEnabled: boolean;
let globalCacheScale: number;
let videoEl: HTMLVideoElement;
let pagComposition: PAGComposition;
let audioEl: AudioPlayer;
let PAG: PAGNamespace;
let canvasElementSize = 640;
let isMobile = false;
let slidePreset: SlideLeftPreset | null = null;
let slideAnimationFrame = 0;
let activeRecorder: any = null;
let textMotionLayer: PAGTextLayer | null = null;

function readNumberInput(id: string, fallback: number): number {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) {
    return fallback;
  }
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function updateTextMotionControls(): void {
  const typeSelect = document.getElementById('text-motion-type') as HTMLSelectElement | null;
  const directionSelect = document.getElementById('text-motion-direction') as HTMLSelectElement | null;
  const distanceInput = document.getElementById('text-motion-distance') as HTMLInputElement | null;
  const effectSelect = document.getElementById('text-motion-effect') as HTMLSelectElement | null;
  const effectDelayInput = document.getElementById('text-motion-effect-delay') as HTMLInputElement | null;
  const effectSmoothSelect = document.getElementById('text-motion-effect-smooth') as HTMLSelectElement | null;
  if (!typeSelect) {
    return;
  }
  const type = typeSelect.value;
  const directionEnabled = type === 'slide' || type === 'swing';
  if (directionSelect) directionSelect.disabled = !directionEnabled;
  if (distanceInput) distanceInput.disabled = type !== 'slide';
  const effectValue = effectSelect?.value ?? 'none';
  const effectEnabled = effectValue !== 'none';
  if (effectDelayInput) effectDelayInput.disabled = !effectEnabled;
  if (effectSmoothSelect) effectSmoothSelect.disabled = !effectEnabled;
}

function collectTextMotionOptions(): TextMotionOptions | null {
  const typeSelect = document.getElementById('text-motion-type') as HTMLSelectElement | null;
  const directionSelect = document.getElementById('text-motion-direction') as HTMLSelectElement | null;
  const easingSelect = document.getElementById('text-motion-easing') as HTMLSelectElement | null;
  const effectSelect = document.getElementById('text-motion-effect') as HTMLSelectElement | null;
  const effectSmoothSelect = document.getElementById('text-motion-effect-smooth') as HTMLSelectElement | null;
  if (!typeSelect) {
    return null;
  }
  const type = (typeSelect.value || 'fade') as NonNullable<TextMotionOptions['type']>;
  const direction = (directionSelect?.value || 'up') as NonNullable<TextMotionOptions['direction']>;
  const easing = (easingSelect?.value || 'smooth') as NonNullable<TextMotionOptions['easing']>;
  const effect = (effectSelect?.value || 'none') as NonNullable<TextMotionOptions['effect']>;
  const effectSmooth = (effectSmoothSelect?.value || 'none') as NonNullable<TextMotionOptions['effect_smooth']>;
  const duration = Math.max(0, readNumberInput('text-motion-duration', 1200));
  const distance = Math.max(0, readNumberInput('text-motion-distance', 0.5));
  const effectDelay = Math.max(0, readNumberInput('text-motion-effect-delay', 120));
  const options: TextMotionOptions = {
    type,
    direction,
    duration,
    distance,
    easing,
    effect,
  };
  if (effect !== 'none') {
    options.effect_delay = effectDelay;
    options.effect_smooth = effectSmooth;
  }
  return options;
}

async function applyTextMotionFromUI(): Promise<void> {
  if (!textMotionLayer) {
    console.warn('Text motion layer is not initialized. Click "Text Motion Demo" first.');
    return;
  }
  const options = collectTextMotionOptions();
  if (!options) {
    return;
  }
  textMotionLayer.setTextMotionOptions(options);
  if (pagView) {
    pagView.setProgress(0);
    await pagView.flush();
    pagView.play();
  }
}

async function clearTextMotionOptions(): Promise<void> {
  if (!textMotionLayer) {
    return;
  }
  textMotionLayer.setTextMotionOptions(null);
  if (pagView) {
    pagView.setProgress(0);
    await pagView.flush();
  }
}

async function createTextMotionDemo(): Promise<void> {
  if (!PAG) {
    console.warn('PAG is not initialized yet.');
    return;
  }
  if (slideAnimationFrame) {
    cancelAnimationFrame(slideAnimationFrame);
    slideAnimationFrame = 0;
  }
  slidePreset = null;
  textMotionLayer = null;
  if (pagFile) {
    pagFile.destroy();
  }
  if (pagView) {
    pagView.destroy();
  }
  const width = canvasElementSize;
  const height = canvasElementSize;
  const durationUS = 3_000_000;
  const frameRate = 60;
  const totalFrames = Math.max(1, Math.round((durationUS / 1_000_000) * frameRate));
  const file = PAG.PAGFile.makeEmpty(width, height, totalFrames);
  file.removeAllLayers();

  const textLayer = PAG.PAGTextLayer.make(durationUS, 'Text Motion', 72, 'Helvetica', 'Bold');
  // const doc = textLayer.getTextDocument();
  // doc.fillColor = { red: 255, green: 255, blue: 255 };
  // doc.justification = types.ParagraphJustification.CenterJustify;
  // textLayer.setTextDocument(doc);
  file.addLayer(textLayer);

  const canvas = document.getElementById('pag') as HTMLCanvasElement;
  pagFile = file;
  pagView = (await PAG.PAGView.init(file, canvas)) as PAGView;
  pagView.setRepeatCount(0);
  pagView.setProgress(0);
  await pagView.flush();
  pagComposition = pagView.getComposition();
  audioEl = new AudioPlayer(null);
  document.getElementById('decode-time')!.innerText = 'PAG File decode time: -';
  document.getElementById('initialized-time')!.innerText = 'PAG View initialized time: -';
  document.getElementById('control')!.style.display = '';
  textMotionLayer = textLayer;
  textMotionLayer.setTextMotionOptions(null);
  updateTextMotionControls();
  await applyTextMotionFromUI();
}

window.onload = async () => {
  PAG = await PAGInit({ locateFile: (file: string) => '../lib/' + file });
  // Mobile
  isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  if (isMobile) {
    document
      .querySelector('meta[name="viewport"]')
      ?.setAttribute(
        'content',
        'viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no',
      );
    await loadScript('https://cdn.jsdelivr.net/npm/vconsole@latest/dist/vconsole.min.js');
    const vconsole = new window.VConsole();
    canvasElementSize = 320;
    const canvas = document.getElementById('pag') as HTMLCanvasElement;
    canvas.width = canvasElementSize;
    canvas.height = canvasElementSize;
    const tablecloth = document.getElementById('tablecloth');
    tablecloth!.style.width = `${canvasElementSize}px`;
    tablecloth!.style.height = `${canvasElementSize}px`;
  }

  console.log(`wasm loaded! SDKVersion ${PAG.SDKVersion()}`, PAG);

  document.getElementById('waiting')!.style.display = 'none';
  document.getElementById('container')!.style.display = isMobile ? 'block' : '';

  // 加载测试字体
  document.getElementById('btn-test-font')?.addEventListener('click', () => {
    const url = './assets/SourceHanSerifCN-Regular.ttf';
    fetch(url)
      .then((response) => response.blob())
      .then(async (blob) => {
        const file = new window.File([blob], url.replace(/(.*\/)*([^.]+)/i, '$2'));
        await PAG.PAGFont.registerFont('SourceHanSerifCN', file);
        console.log(`已加载${file.name}`);
      });
  });

  // 加载PAG
  document.getElementById('btn-upload-pag')?.addEventListener('click', () => {
    document.getElementById('upload-pag')?.click();
  });
  document.getElementById('upload-pag')?.addEventListener('change', (event: any) => {
    if (event.target) {
      createPAGView(event.target.files[0] as File);
    }
  });
  document.getElementById('btn-test-vector-pag')?.addEventListener('click', () => {
    const url = './assets/blank.pag';
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        createPAGView(arrayBuffer);
      });
  });
  document.getElementById('btn-test-video-pag')?.addEventListener('click', () => {
    const url = './assets/particle_video.pag';
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        const file = new window.File([blob], url.replace(/(.*\/)*([^.]+)/i, '$2'));
        createPAGView(file);
      });
  });
  document.getElementById('btn-test-text-pag')?.addEventListener('click', async () => {
    const url = './assets/test2.pag';
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new window.File([blob], url.replace(/(.*\/)*([^.]+)/i, '$2'));
    await createPAGView(file);
    const textDoc = pagFile.getTextData(0);
    console.log(textDoc);
    textDoc.text = '替换后的文字🤔#️⃣#*️⃣*1️⃣🔟🇨🇳🏴󠁧󠁢󠁥󠁮󠁧󠁿🤡👨🏼‍🦱👨‍👨‍👧‍👦';
    textDoc.fillColor = { red: 255, green: 255, blue: 255 };
    textDoc.applyFill = true;
    textDoc.backgroundAlpha = 100;
    textDoc.backgroundColor = { red: 255, green: 0, blue: 0 };
    textDoc.baselineShift = 200;
    textDoc.fauxBold = true;
    textDoc.fauxItalic = false;
    textDoc.fontFamily = 'SourceHanSerifCN';
    textDoc.fontSize = 100;
    textDoc.justification = types.ParagraphJustification.CenterJustify;
    textDoc.strokeWidth = 20;
    textDoc.strokeColor = { red: 0, green: 0, blue: 0 };
    textDoc.applyStroke = true;
    textDoc.strokeOverFill = true;
    textDoc.tracking = 600;
    pagFile.replaceText(0, textDoc);
    console.log(pagFile.getTextData(0));
    await pagView.flush();
  });
  document.getElementById('btn-slide-left')?.addEventListener('click', async () => {
    await createSlideLeftDemo();
  });
  document.getElementById('btn-text-motion-demo')?.addEventListener('click', async () => {
    await createTextMotionDemo();
  });
  document.getElementById('btn-apply-text-motion')?.addEventListener('click', async () => {
    await applyTextMotionFromUI();
  });
  document.getElementById('btn-clear-text-motion')?.addEventListener('click', async () => {
    await clearTextMotionOptions();
  });
  document.getElementById('text-motion-type')?.addEventListener('change', () => {
    updateTextMotionControls();
  });
  document.getElementById('text-motion-effect')?.addEventListener('change', () => {
    updateTextMotionControls();
  });
  updateTextMotionControls();
  document.getElementById('btn-record')?.addEventListener('click', async () => {
    if (!PAG || !PAG.PAGRecorder) {
      alert('Recorder is not available in this environment.');
      return;
    }
    if (!pagFile) {
      alert('Please load a PAG file first.');
      return;
    }
    if (activeRecorder) {
      return;
    }
    const recordButton = document.getElementById('btn-record') as HTMLButtonElement | null;
    const progressEl = document.getElementById('record-progress');
    const resultEl = document.getElementById('record-result');
    if (recordButton) {
      recordButton.disabled = true;
    }
    if (progressEl) {
      progressEl.textContent = 'Recording... 0%';
    }
    if (resultEl) {
      resultEl.innerHTML = '';
    }
    try {
      activeRecorder = new PAG.PAGRecorder(pagFile, {
        frameRate: pagFile.frameRate(),
        mimeType: 'video/mp4',
      });
    } catch (error) {
      console.error(error);
      if (progressEl) progressEl.textContent = `Recorder init failed: ${(error as Error).message}`;
      if (recordButton) recordButton.disabled = false;
      activeRecorder = null;
      return;
    }

    let cleanupRecorderListeners: () => void;

    const onProgress = (event: Event) => {
      const progress = (event as any).progress ?? 0;
      if (progressEl) {
        progressEl.textContent = `Recording... ${(progress * 100).toFixed(0)}%`;
      }
    };
    const onComplete = (event: Event) => {
      const { blob, filename } = event as any;
      if (progressEl) {
        progressEl.textContent = 'Recording complete.';
      }
      if (resultEl && blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'recording.mp4';
        link.textContent = 'Download recording';
        link.className = 'mt-12';
        resultEl.innerHTML = '';
        resultEl.appendChild(link);
      }
      cleanupRecorderListeners();
      if (recordButton) recordButton.disabled = false;
      activeRecorder = null;
    };
    const onError = (event: Event) => {
      const error = (event as any).error;
      console.error('Recording failed', error);
      if (progressEl) {
        progressEl.textContent = `Recording failed: ${error?.message ?? error}`;
      }
      cleanupRecorderListeners();
      if (recordButton) recordButton.disabled = false;
      activeRecorder = null;
    };

    cleanupRecorderListeners = () => {
      if (!activeRecorder) return;
      activeRecorder.removeEventListener('progress', onProgress);
      activeRecorder.removeEventListener('complete', onComplete);
      activeRecorder.removeEventListener('error', onError);
    };

    activeRecorder.addEventListener('progress', onProgress);
    activeRecorder.addEventListener('complete', onComplete);
    activeRecorder.addEventListener('error', onError);
    activeRecorder.start();
  });
  document.getElementById('btn-enabled-decoder')?.addEventListener('click', async () => {
    if (!window.ffavc) await loadScript('https://cdn.jsdelivr.net/npm/ffavc@latest/lib/ffavc.min.js');
    const FFAVC = await window.ffavc.FFAVCInit();
    const ffavcDecoderFactory = new FFAVC.FFAVCDecoderFactory();
    PAG.registerSoftwareDecoderFactory(ffavcDecoderFactory);
    console.log('=== 开启 ffavc 软件解码 ===');
  });
  document.getElementById('btn-enabled-decoder')?.addEventListener('click', async () => {
    if (window.ffavc) {
      const FFAVC = await window.ffavc.FFAVCInit();
      const ffavcDecoderFactory = new FFAVC.FFAVCDecoderFactory();
      PAG.registerSoftwareDecoderFactory(ffavcDecoderFactory);
    }
  });

  // Get PAGFile duration
  document.getElementById('btn-pagfile-get-duration')?.addEventListener('click', () => {
    const duration = pagFile.duration();
    console.log(`PAGFile duration ${duration}`);
  });

  // PAGFile setDuration
  document.getElementById('btn-pagfile-set-duration')?.addEventListener('click', () => {
    const duration = Number((document.getElementById('input-pagfile-duration') as HTMLInputElement).value);
    pagFile.setDuration(duration);
    console.log(`Set PAGFile duration ${duration} `);
  });

  // Get timeStretchMode
  document.getElementById('btn-pagfile-time-stretch-mode')?.addEventListener('click', () => {
    const timeStretchMode = pagFile.timeStretchMode();
    console.log(`PAGFile timeStretchMode ${timeStretchMode} `);
  });

  document.getElementById('btn-pagfile-set-time-stretch-mode')?.addEventListener('click', () => {
    const mode = Number((document.getElementById('select-time-stretch-mode') as HTMLSelectElement).value);
    pagFile.setTimeStretchMode(mode);
    console.log(`Set PAGFile timeStretchMode ${mode}`);
  });

  // 控制
  document.getElementById('btn-play')?.addEventListener('click', () => {
    pagView.play();
    audioEl.play();
    console.log('开始');
  });
  document.getElementById('btn-pause')?.addEventListener('click', () => {
    pagView.pause();
    audioEl.pause();
    console.log('暂停');
  });
  document.getElementById('btn-stop')?.addEventListener('click', () => {
    pagView.stop();
    audioEl.stop();
    console.log('停止');
  });
  document.getElementById('btn-destroy')?.addEventListener('click', () => {
    pagView.destroy();
    audioEl.destroy();
    console.log('销毁');
  });

  document.getElementById('btn-flush')?.addEventListener('click', () => {
    pagView.flush();
    console.log('刷新');
  });

  // 获取进度
  document.getElementById('btn-getProgress')?.addEventListener('click', () => {
    console.log(`当前进度：${pagView.getProgress()}`);
  });

  // 设置进度
  document.getElementById('setProgress')?.addEventListener('click', () => {
    let progress = Number((document.getElementById('progress') as HTMLInputElement).value);
    if (!(progress >= 0 && progress <= 1)) {
      alert('请输入0～1之间');
    }
    pagView.setProgress(progress);
    console.log(`已设置进度：${progress}`);
  });

  // 设置循环次数
  document.getElementById('setRepeatCount')?.addEventListener('click', () => {
    let repeatCount = Number((document.getElementById('repeatCount') as HTMLInputElement).value);
    pagView.setRepeatCount(repeatCount);
    console.log(`已设置循环次数：${repeatCount}`);
  });

  // maxFrameRate
  document.getElementById('btn-maxFrameRate')?.addEventListener('click', () => {
    console.log(`maxFrameRate: ${pagView.maxFrameRate()}`);
  });
  document.getElementById('setMaxFrameRate')?.addEventListener('click', () => {
    let maxFrameRate = Number((document.getElementById('maxFrameRate') as HTMLInputElement).value);
    pagView.setMaxFrameRate(maxFrameRate);
  });

  // scaleMode
  document.getElementById('btn-scaleMode')?.addEventListener('click', () => {
    console.log(`scaleMode: ${pagView.scaleMode()}`);
  });
  document.getElementById('setScaleMode')?.addEventListener('click', () => {
    let scaleMode = Number((document.getElementById('scaleMode') as HTMLSelectElement).value);
    pagView.setScaleMode(scaleMode);
  });

  // videoEnabled
  videoEnabled = true;
  document.getElementById('btn-videoEnabled')?.addEventListener('click', () => {
    videoEnabled = pagView.videoEnabled();
    console.log(`videoEnabled status: ${videoEnabled}`);
  });
  document.getElementById('btn-setVideoEnabled')?.addEventListener('click', () => {
    pagView.setVideoEnabled(!videoEnabled);
  });

  // cacheEnabled
  cacheEnabled = true;
  document.getElementById('btn-cacheEnabled')?.addEventListener('click', () => {
    cacheEnabled = pagView.cacheEnabled();
    console.log(`cacheEnabled status: ${cacheEnabled}`);
  });
  document.getElementById('btn-setCacheEnabled')?.addEventListener('click', () => {
    pagView.setCacheEnabled(!cacheEnabled);
  });

  // PAGComposition
  document.getElementById('btn-composition')?.addEventListener('click', () => {
    testPAGCompositionAPi();
  });

  // freeCache
  document.getElementById('btn-freeCache')?.addEventListener('click', () => {
    pagView.freeCache();
  });
  // freeCache
  document.getElementById('btn-makeSnapshot')?.addEventListener('click', () => {
    pagView.makeSnapshot().then((bitmap) => console.log('makeSnapshot:', bitmap));
  });

  // cacheScale
  globalCacheScale = 1;
  document.getElementById('btn-cacheScale')?.addEventListener('click', () => {
    globalCacheScale = pagView.cacheScale();
    console.log(`cacheScale status: ${globalCacheScale}`);
  });
  document.getElementById('btn-setCacheScale')?.addEventListener('click', () => {
    let cacheScale = Number((document.getElementById('cacheScale') as HTMLInputElement).value);
    if (!(cacheScale >= 0 && cacheScale <= 1)) {
      alert('请输入0～1之间');
    }
    pagView.setCacheScale(cacheScale);
  });
};

const runSlideLeftAnimation = (durationUS: number) => {
  const durationSec = durationUS / 1_000_000;
  const start = performance.now();
  const tick = () => {
    if (!slidePreset || !pagView) {
      return;
    }
    const elapsedSec = (performance.now() - start) / 1000;
    const progress = Math.min(elapsedSec / durationSec, 1);
    slidePreset.apply(progress);
    pagView.flush();
    if (progress < 1) {
      slideAnimationFrame = requestAnimationFrame(tick);
    } else {
      slideAnimationFrame = 0;
    }
  };
  if (slideAnimationFrame) {
    cancelAnimationFrame(slideAnimationFrame);
  }
  slideAnimationFrame = requestAnimationFrame(tick);
};

const createSlideLeftDemo = async () => {
  textMotionLayer = null;
  const width = canvasElementSize;
  const height = canvasElementSize;
  const durationUS = 3_000_000;
  const frameRate = 60;
  const totalFrames = Math.max(1, Math.round((durationUS / 1_000_000) * frameRate));
  if (pagFile) {
    pagFile.destroy();
  }
  const file = PAG.PAGFile.makeEmpty(width, height, totalFrames);
  file.removeAllLayers();

  const textLayer = PAG.PAGTextLayer.make(durationUS, 'Hello', 30, 'Helvetica', 'Bold');
  const doc = textLayer.getTextDocument();
  doc.fillColor = { red: 255, green: 255, blue: 255 };
  // doc.justification = types.ParagraphJustification.CenterJustify;
  textLayer.setTextDocument(doc);
  file.addLayer(textLayer);
  textLayer.setMotionBlur(true)

  if (pagView) {
    pagView.destroy();
  }

  const canvas = document.getElementById('pag') as HTMLCanvasElement;
  pagFile = file;
  pagView = (await PAG.PAGView.init(file, canvas)) as PAGView;
  pagView.setRepeatCount(0);
  slidePreset = SlideLeftPreset.make(textLayer, durationUS, width * 0.8, width * 0.15, 0.6, 1.0);
  slidePreset.apply(0);
  await pagView.flush();
  pagComposition = pagView.getComposition();
  audioEl = new AudioPlayer(null);
  document.getElementById('decode-time')!.innerText = 'PAG File decode time: -';
  document.getElementById('initialized-time')!.innerText = 'PAG View initialized time: -';
  document.getElementById('control')!.style.display = '';
  runSlideLeftAnimation(durationUS);
};

const existsLayer = (pagLayer: object) => {
  if (pagLayer) return true;
  console.log('no Layer');
  return false;
};

// PAGComposition api test
const testPAGComposition: { [key: string]: () => void } = {
  rect: () => {
    console.log(`test result: width: ${pagComposition.width()}, height: ${pagComposition.height()}`);
  },
  setContentSize: () => {
    pagComposition.setContentSize(360, 640);
    console.log(`test setContentSize result: width: ${pagComposition.width()}, height: ${pagComposition.height()}`);
  },
  numChildren: () => {
    console.log(`test numChildren: ${pagComposition.numChildren()}`);
  },
  getLayerAt: () => {
    const pagLayer = pagComposition.getLayerAt(0);
    if (!existsLayer(pagLayer)) return;
    console.log(`test getLayerAt index 0, layerName: ${pagLayer.layerName()}`);
  },
  getLayersByName: () => {
    const pagLayer = pagComposition.getLayerAt(0);
    if (!existsLayer(pagLayer)) return;
    const layerName = pagLayer.layerName();
    const vectorPagLayer = pagComposition.getLayersByName(layerName);
    for (let j = 0; j < vectorPagLayer.size(); j++) {
      const pagLayerWasm = vectorPagLayer.get(j);
      const pagLayer_1 = new PAG.PAGLayer(pagLayerWasm);
      console.log(`test getLayersByName: layerName: ${pagLayer_1.layerName()}`);
    }
  },
  audioStartTime: () => {
    const audioStartTime = pagComposition.audioStartTime();
    console.log('test audioStartTime:', audioStartTime);
  },
  audioMarkers: () => {
    const audioMarkers = pagComposition.audioMarkers();
    console.log(`test audioMarkers: size`, audioMarkers.size());
  },
  audioBytes: () => {
    const audioBytes = pagComposition.audioBytes();
    console.log('test audioBytes：', audioBytes);
  },
  getLayerIndex: () => {
    const pagLayer = pagComposition.getLayerAt(0);
    const index = pagComposition.getLayerIndex(pagLayer);
    console.log(`test GetLayerIndex: ${index}`);
  },
  swapLayerAt: () => {
    swapLayer('swapLayerAt');
  },
  swapLayer: () => {
    swapLayer('swapLayer');
  },
  contains: () => {
    const pagLayer = pagComposition.getLayerAt(0);
    const isContains = pagComposition.contains(pagLayer);
    if (isContains) {
      console.log('test contains');
    }
  },
  addLayer: () => {
    const pagLayer = pagComposition.getLayerAt(0);
    pagComposition.removeLayerAt(0);
    const oldNum = pagComposition.numChildren();
    const isSuccess: boolean = pagComposition.addLayer(pagLayer);
    if (isSuccess) {
      console.log(`test addLayer success: old num ${oldNum} current num ${pagComposition.numChildren()}`);
    }
  },
  removeLayerAt: () => {
    const oldNum = pagComposition.numChildren();
    pagComposition.removeLayerAt(0);
    console.log(
      `test delete Layer[0] success: old LayersNum: ${oldNum} current LayersNum ${pagComposition.numChildren()}`,
    );
  },
  removeAllLayers: () => {
    const oldNum = pagComposition.numChildren();
    pagComposition.removeAllLayers();
    console.log(
      `test removeAllLayers success: old LayersNum${oldNum} current LayersNum ${pagComposition.numChildren()}`,
    );
  },
};
const testPAGCompositionAPi = () => {
  console.log(`-------------------TEST PAGCompositionAPI START--------------------- `);
  Object.keys(testPAGComposition).forEach((key) => {
    if (testPAGComposition.hasOwnProperty(key)) {
      testPAGComposition[`${key}`]();
    }
  });
  console.log(`-------------------TEST PAGCompositionAPI END--------------------- `);
};

const swapLayer = (type: string) => {
  const pagLayer_0 = pagComposition.getLayerAt(0);
  const pagLayer_1 = pagComposition.getLayerAt(1);
  if (!pagLayer_0 || !pagLayer_1) {
    console.log('No layer switching');
    return;
  }
  const pagLayer_name_0 = pagLayer_0.layerName();
  const pagLayer_name_1 = pagLayer_1.layerName();
  if (type === 'swapLayer') {
    pagComposition.swapLayer(pagLayer_0, pagLayer_1);
  } else {
    pagComposition.swapLayerAt(0, 1);
  }
  const pagLayer_exch_0 = pagComposition.getLayerAt(0);
  const pagLayer_exch_1 = pagComposition.getLayerAt(1);
  const pagLayer__exch_0 = pagLayer_exch_0.layerName();
  const pagLayer__exch_1 = pagLayer_exch_1.layerName();
  console.log(
    `test ${type}:  oldLayerName_0=${pagLayer_name_0}, oldLayerName_1=${pagLayer_name_1} exchange LayerName_0=${pagLayer__exch_0}, LayerName_1=${pagLayer__exch_1} `,
  );
};

let solidLayer;
/**
 * patch
 * @param file 
 * @returns 
 */
const debugPagView = async (pagFile: PAGFile) => {
 

  const pagComposition = pagFile as PAGComposition
  // const layer =  pagComposition.getLayerAt(0);
  // const lastLayer =  pagComposition.getLayerAt(pagComposition.numChildren()-1);
  // console.log("numChildren&[0]===", pagComposition.numChildren(),":", layer.layerName(), layer.layerType(), layer.uniqueID(), layer.visible())
  // console.log("last child===", lastLayer.layerName(), lastLayer.layerType(), lastLayer.uniqueID(), lastLayer.visible())
  // pagComposition.getLayerAt(0).setMotionBlur(true);
  pagComposition.setMotionBlur(true);
  const textLayer = PAG.PAGTextLayer.make(8000000, 'TypeMonkey', 30, 'LibertinusKeyboard', 'Regular');
  // const matrix = textLayer.matrix();
  // matrix.setTranslate(100, 100);
  // textLayer.setMatrix(matrix);
  
  textLayer.setMotionBlur(true)
  const transform = textLayer.getTransform2D()
  console.log("transform.position()", transform.position(), pagComposition.uniqueID())
  
  
  transform.setXPosition(100);
  
  transform.setPositionKeyframes([
    {
      startValue: { x: 30, y: 120 },
      endValue: {x: 60, y: 60},
      startTime: 0,
      endTime: 150,
      interpolationType: 1,
      bezierIn: [],
      bezierOut: [],
    },
    {
      startValue: { x: 60, y: 260 },
      endValue: {x: 30, y: 430},
      startTime: 50,
      endTime: 220,
      interpolationType: 1,
      bezierIn: [],
      bezierOut: [],
    },
  ])
  textLayer.setTransform2D(transform)
  
  console.log("transform.position()", textLayer.getTransform2D().getPositionKeyframes())

  
  // const pagFont = PAG.PAGFont.create('Libertinus Keyboard', 'Regular');
  // textLayer.setFont(pagFont);

  console.log("textLayer.getTextDocument() = ", textLayer.getTextDocument())
  textLayer.setFontSize(90);
  
  const doc = textLayer.getTextDocument();
  // doc.applyStroke = true;

  textLayer.setTextDocument(doc)
  textLayer.setFillColor({
    red: 255,
    green: 140,
    blue: 0,
  })
  textLayer.setStrokeColor({
    red: 0,
    green: 140,
    blue: 255,
  })
  
  console.log("textLayer.fillColor", textLayer.fillColor())
  console.log("textLayer.font", textLayer.font())

  // const t3 = new Transform3D();
  // t3.setAnchorPoint({x:0,y:0,z:0});
  // t3.setPosition({x:0,y:0,z:0});
  // t3.setScale({x:1,y:2,z:1});
  // t3.setXRotation(0); t3.setYRotation(0); t3.setZRotation(0);
  // t3.setOpacity(255);
  // textLayer.setTransform3D(t3);

  // console.log("transform.position()", t3.scale())
  
  
  console.log("textLayer.uniqueID =", textLayer.uniqueID());
  // pagComposition.attachFile(textLayer);
  const layerAdded = pagComposition.addLayer(textLayer);
  console.log(">>>>>> layerAdded", layerAdded);
  console.log("pagComposition.numChildren() after", pagComposition.numChildren());

  const textLayer2 = PAG.PAGTextLayer.make(6000000, 'One Two Three', 90, 'Helvetica', 'Bold');
  textLayer2.setStartTime(100000)
  textLayer2.setFillColor({
    red: 255,
    green: 255,
    blue: 255,
  })
  textLayer2.setText("TypeMonkey")
  console.log("textLayer2.getBounds = ", textLayer2.getBounds())
  pagComposition.addLayer(textLayer2);



  solidLayer = PAG.PAGSolidLayer.make(600000, 90, 90, { red: 255, green: 0, blue: 0 }, 100);
  // pagComposition.attachFile(solidLayer);
  pagComposition.addLayer(solidLayer);

  console.log("pagComposition.numChildren() after2", pagComposition.numChildren());

  console.log(">>>>>> solidLayer.uniqueID", solidLayer.uniqueID());

  console.log(">>>>>> textLayer.numChildren", pagComposition.numChildren());
  console.log(">>>>>> textLayer.fontSize", textLayer.fontSize());
  console.log(">>>>>> textLayer.text", textLayer.text());
  console.log(">>>>>> textLayer.fillColor", textLayer.fillColor());
  console.log(">>>>>> textLayer.numChildren", pagComposition.numChildren());

  // v1 demo: simple per-glyph fly-in from right to left with stagger and fade-in
  const duration = 0.35;
  const perDelay = 0.06;
  const slideX = 120;
  function easeOutCubic(t:number){ t = Math.max(0, Math.min(1, t)); const u = 1 - t; return 1 - u*u*u }


  textLayer.setGlyphTransform(({ index, timeUS }) => {
    const nowSec = (timeUS ?? 0) / 1e6; // layer local time from wasm
    const p = easeOutCubic((nowSec - index * perDelay) / duration);
    // if (p <= 0) return { alpha: 0 };
    return { dx: 0, dy: 20 * index, alpha: 1 };
  });

  // pagView.addListener('onFrame', (event) => {
  //   console.log("onFrame", event);
  //   const transform = textLayer2.getTransform2D();
  //   transform.setXPosition(transform.xPosition() + 1)
  //   textLayer2.setTransform2D(transform);
  // });
}

const createPAGView = async (file: File | ArrayBuffer | Blob) => {
  textMotionLayer = null;
  const url = 'https://fonts.gstatic.com/s/libertinuskeyboard/v2/NaPEcYrQAP5Z2JsyIac0i2DYHaapaf43dru5tEg8zfg.woff2';
  const blob = await fetch(url).then(r => r.blob());
  const fontfile = new File([blob], 'Libertinus Keyboard.woff2', { type: 'font/woff2' });
  await PAG.PAGFont.registerFont('LibertinusKeyboard', fontfile);


  if (pagFile) pagFile.destroy();
  if (pagView) pagView.destroy();
  const decodeTime = performance.now();
  pagFile = (await PAG.PAGFile.load(file)) as PAGFile;
  //pagFile = PAG.PAGFile.makeEmpty(720, 1280, 1500);
  const pagCanvas = document.getElementById('pag') as HTMLCanvasElement;
  pagView = (await PAG.PAGView.init(pagFile, pagCanvas)) as PAGView;
  await debugPagView(pagFile)
  document.getElementById('decode-time')!.innerText = `PAG File decode time: ${Math.floor(
    performance.now() - decodeTime,
  )}ms`;
  
  const initializedTime = performance.now();
  
  document.getElementById('initialized-time')!.innerText = `PAG View initialized time: ${Math.floor(
    performance.now() - initializedTime,
  )}ms`;
  pagView.setRepeatCount(0);
  pagView.flush()
  
  // 绑定事件监听
  pagView.addListener('onAnimationStart', (event) => {
    console.log('onAnimationStart', event);
  });
  pagView.addListener('onAnimationEnd', (event) => {
    console.log('onAnimationEnd', event);
  });
  pagView.addListener('onAnimationCancel', (event) => {
    console.log('onAnimationCancel', event);
  });
  pagView.addListener('onAnimationRepeat', (event) => {
    console.log('onAnimationRepeat', event);
    audioEl.stop();
    audioEl.play();
  });
  pagView.addListener('onAnimationUpdate', (event) => {
    console.log('onAnimationUpdate', event);
    document.getElementById('fps')!.innerText = `PAG View FPS: ${pagView.getDebugData().FPS}`;
  });
  pagView.addListener('onAnimationPlay', (event) => {
    console.log('onAnimationPlay', event);
  });
  pagView.addListener('onAnimationPause', (event) => {
    console.log('onAnimationPause', event);
  });
  document.getElementById('control')!.style.display = '';
  // 图层编辑
  const editableLayers = getEditableLayer(pagFile);
  renderEditableLayer(editableLayers);
  if (pagComposition) {
    pagComposition.destroy();
  }
  pagComposition = pagView.getComposition();
  audioEl = new AudioPlayer(pagComposition.audioBytes());
  return pagView;
};

const loadVideoReady = (el: HTMLVideoElement, src: string) => {
  return new Promise((resolve) => {
    const listener = () => {
      el.removeEventListener('canplay', listener);
      console.log('canplay');
      resolve(true);
    };
    el.addEventListener('canplay', listener);
    el.src = src;
  });
};

const setVideoTime = (el: HTMLVideoElement, time: number) => {
  return new Promise((resolve) => {
    const listener = () => {
      el.removeEventListener('timeupdate', listener);
      console.log('timeupdate');
      resolve(true);
    };
    el.addEventListener('timeupdate', listener);
    el.currentTime = time;
  });
};

const getEditableLayer = (pagFile: PAGFile) => {
  let res: any[] = [];
  const indices = pagFile.getEditableIndices(types.LayerType.Image);
  indices.forEach((index) => {
    const imageLayers = pagFile.getLayersByEditableIndex(index, types.LayerType.Image);
    for (let j = 0; j < imageLayers.size(); j++) {
      const layer = imageLayers.get(j) as PAGImageLayer;
      const uniqueID = layer.uniqueID();
      const layerType = layer.layerType();
      const layerName = layer.layerName();
      const alpha = layer.alpha();
      const visible = layer.visible();
      const editableIndex = layer.editableIndex();
      const duration = layer.duration();
      const frameRate = layer.frameRate();
      const localStartTime = layer.startTime();
      const startTime = layer.localTimeToGlobal(localStartTime);
      res.push({ uniqueID, layerType, layerName, alpha, visible, editableIndex, frameRate, startTime, duration });
    }
  });
  return res;
};

const renderEditableLayer = (editableLayers: any[]) => {
  const editLayerContent = document.getElementById('editLayer-content');
  const childNodes = editLayerContent!.childNodes;
  if (childNodes.length > 0) {
    childNodes.forEach((node) => editLayerContent?.removeChild(node));
  }
  const box = document.createElement('div');
  box.className = 'mt-24';
  box.innerText = 'Editable layer:';
  editableLayers.forEach((layer) => {
    const item = document.createElement('div');
    item.className = 'mt-24';
    item.innerText = `editableIndex: ${layer.editableIndex} startTime: ${layer.startTime} duration: ${layer.duration}`;
    const replaceImageBtn = document.createElement('button');
    replaceImageBtn.addEventListener('click', () => {
      replaceImage(item, layer.editableIndex);
    });
    replaceImageBtn.style.marginLeft = '12px';
    replaceImageBtn.innerText = '替换图片';
    item.appendChild(replaceImageBtn);
    const replaceVideoBtn = document.createElement('button');
    replaceVideoBtn.addEventListener('click', () => {
      replaceVideo(item, layer.editableIndex);
    });
    replaceVideoBtn.style.marginLeft = '12px';
    replaceVideoBtn.innerText = '替换视频';
    item.appendChild(replaceVideoBtn);
    box.appendChild(item);
  });
  editLayerContent?.appendChild(box);
};

// 替换图片
const replaceImage = (element: HTMLDivElement, index: number) => {
  const inputEl = document.createElement('input');
  inputEl.type = 'file';
  inputEl.style.display = 'none';
  element.appendChild(inputEl);
  inputEl.addEventListener('change', async (event: any) => {
    const pagImage = await PAG.PAGImage.fromFile(event.target.files[0]);
    const pagFile = pagView.getComposition() as PAGFile;
    pagFile.replaceImage(index, pagImage);
    await pagView.flush();
    pagImage.destroy();
  });
  inputEl.click();
  element.removeChild(inputEl);
};

// 替换视频
const replaceVideo = (element: HTMLDivElement, index: number) => {
  const inputEl = document.createElement('input');
  inputEl.type = 'file';
  inputEl.style.display = 'none';
  element.appendChild(inputEl);
  inputEl.addEventListener('change', async (event: any) => {
    if (!videoEl) videoEl = document.createElement('video');
    await loadVideoReady(videoEl, URL.createObjectURL(event.target.files[0]));
    await setVideoTime(videoEl, 0.05);
    const pagImage = PAG.PAGImage.fromSource(videoEl);
    const pagFile = pagView.getComposition() as PAGFile;
    pagFile.replaceImage(index, pagImage);
    await pagView.flush();
    pagImage.destroy();
  });
  inputEl.click();
  element.removeChild(inputEl);
};

const loadScript = (url: string) => {
  return new Promise((resolve, reject) => {
    const scriptEl = document.createElement('script');
    scriptEl.type = 'text/javascript';
    scriptEl.onload = () => {
      resolve(true);
    };
    scriptEl.onerror = (e) => {
      reject(e);
    };
    scriptEl.src = url;
    document.body.appendChild(scriptEl);
  });
};
