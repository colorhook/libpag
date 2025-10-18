import { PAGModule } from './pag-module';
import type { PAGTextLayer } from './pag-text-layer';

export class SlideLeftPreset {
  public wasmIns: any;

  private constructor(wasmIns: any) {
    this.wasmIns = wasmIns;
  }

  public static make(
    layer: PAGTextLayer,
    durationUS: number,
    startX: number,
    endX: number,
    staggerFraction = 0.6,
    trailingFactor = 1.0,
  ): SlideLeftPreset {
    const wasmIns = PAGModule._SlideLeftPreset._Make(
      layer.wasmIns,
      durationUS,
      startX,
      endX,
      staggerFraction,
      trailingFactor,
    );
    if (!wasmIns) {
      throw new Error('SlideLeftPreset creation failed.');
    }
    return new SlideLeftPreset(wasmIns);
  }

  public apply(progress: number): void {
    this.wasmIns._apply(progress);
  }

  public reset(): void {
    this.wasmIns._reset();
  }

  public duration(): number {
    return this.wasmIns._duration() as number;
  }

  public progress(): number {
    return this.wasmIns._progress() as number;
  }
}

