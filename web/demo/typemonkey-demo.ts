import { PAGInit } from '../src/pag';
import { setPAGModule } from '../src/pag-module';
import type { Project } from '../src/typemonkey/types';
import { buildPAGFileFromProject } from '../src/typemonkey/builder';

const mockProject: Project = {
  width: 720,
  height: 1280,
  framerate: 30,
  duration: 18,
  background: {
    type: 'linear-gradient',
    angle: 120,
    stops: [
      { offset: 0, color: { r: 0.12, g: 0.04, b: 0.38, a: 1 } },
      { offset: 0.5, color: { r: 0.45, g: 0.12, b: 0.68, a: 1 } },
      { offset: 1, color: { r: 0.95, g: 0.54, b: 0.26, a: 1 } },
    ],
  },
  globalStyle: {
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
    fontWeight: 'bold',
    fontSize: 72,
    lineHeight: 84,
    letterSpacing: 4,
    fill: { r: 0.96, g: 0.97, b: 0.99, a: 1 },
    stroke: {
      color: { r: 0.05, g: 0.07, b: 0.16, a: 0.8 },
      width: 2,
    },
  },
  blocks: [
    {
      text: 'TypeMonkey Demo',
      startTime: 0,
      motionType: 'slideLeft',
      easingType: 'easeOut',
      speed: 'medium',
      layout: 'bottom',
      style: {
        fontSize: 94,
        letterSpacing: 8,
      },
    },
    {
      text: 'Dynamic Layouts',
      startTime: 3.2,
      motionType: 'scaleIn',
      easingType: 'easeInOut',
      speed: 'slow',
      layout: 'cw',
      style: {
        fill: { r: 0.99, g: 0.92, b: 0.67, a: 1 },
      },
    },
    {
      text: 'Motion Presets',
      startTime: 7,
      motionType: 'swing',
      easingType: 'backOut',
      speed: 'fast',
      layout: 'ccw',
      style: {
        fill: { r: 0.89, g: 0.97, b: 1, a: 1 },
      },
    },
    {
      text: 'Custom Timing',
      startTime: 10.5,
      motionType: 'slideDown',
      easingType: 'bounceOut',
      speed: 'medium',
      layout: 'bottom',
      style: {
        fontSize: 78,
      },
    },
    {
      text: 'Scripted Backgrounds',
      startTime: 14,
      motionType: 'fade',
      easingType: 'linear',
      speed: 'slow',
      layout: 'cw',
      style: {
        fill: { r: 0.96, g: 0.76, b: 0.96, a: 1 },
      },
    },
  ],
};

async function main() {
  const statusEl = document.getElementById('status') as HTMLSpanElement | null;
  if (statusEl) statusEl.textContent = 'Loading wasm...';

  const PAG = await PAGInit({ locateFile: (file) => '../lib/' + file });
  setPAGModule(PAG);
  if (statusEl) statusEl.textContent = 'Building project...';

  const pagFile = await buildPAGFileFromProject(mockProject);

  const canvas = document.getElementById('tm-canvas') as HTMLCanvasElement;
  const pagView = await PAG.PAGView.init(pagFile, canvas);

  if (statusEl) statusEl.textContent = 'Playing';
  pagView?.play();
}

main().catch((error) => {
  console.error('Failed to start TypeMonkey demo', error);
  const statusEl = document.getElementById('status') as HTMLSpanElement | null;
  if (statusEl) statusEl.textContent = 'Error';
});
