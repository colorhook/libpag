import type { Point } from './types';
import { PAGModule } from './pag-module';

export interface Point3D { x: number; y: number; z: number }

export class Transform3D {
  public wasmIns: any;
  // No-arg constructor: create underlying wasm instance automatically.
  public constructor() {
    this.wasmIns = new PAGModule._Transform3D();
  }
  // Internal helper to wrap an existing wasm instance (from native layer).
  public static fromWasm(wasmIns: any): Transform3D {
    const t = new Transform3D();
    t.wasmIns = wasmIns;
    return t;
  }

  // anchorPoint
  public anchorPoint(): Point3D { return this.wasmIns._getAnchorPoint() as Point3D; }
  public setAnchorPoint(v: Point3D): void { this.wasmIns._setAnchorPoint(v); }

  // position (combined) and x/y/z
  public position(): Point3D { return this.wasmIns._getPosition() as Point3D; }
  public setPosition(v: Point3D): void { this.wasmIns._setPosition(v); }
  public xPosition(): number { return this.wasmIns._getXPosition() as number; }
  public setXPosition(v: number): void { this.wasmIns._setXPosition(v); }
  public yPosition(): number { return this.wasmIns._getYPosition() as number; }
  public setYPosition(v: number): void { this.wasmIns._setYPosition(v); }
  public zPosition(): number { return this.wasmIns._getZPosition() as number; }
  public setZPosition(v: number): void { this.wasmIns._setZPosition(v); }

  // scale
  public scale(): Point3D { return this.wasmIns._getScale() as Point3D; }
  public setScale(v: Point3D): void { this.wasmIns._setScale(v); }

  // orientation
  public orientation(): Point3D { return this.wasmIns._getOrientation() as Point3D; }
  public setOrientation(v: Point3D): void { this.wasmIns._setOrientation(v); }

  // rotations
  public xRotation(): number { return this.wasmIns._getXRotation() as number; }
  public setXRotation(v: number): void { this.wasmIns._setXRotation(v); }
  public yRotation(): number { return this.wasmIns._getYRotation() as number; }
  public setYRotation(v: number): void { this.wasmIns._setYRotation(v); }
  public zRotation(): number { return this.wasmIns._getZRotation() as number; }
  public setZRotation(v: number): void { this.wasmIns._setZRotation(v); }

  // opacity
  public opacity(): number { return this.wasmIns._getOpacity() as number; }
  public setOpacity(v: number): void { this.wasmIns._setOpacity(v); }
}
