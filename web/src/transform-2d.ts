import type { Point } from './types';

export interface KeyframePointLite {
  startValue: Point;
  endValue: Point;
  startTime: number;
  endTime: number;
  interpolationType: number; // KeyframeInterpolationType
  bezierOut: Point[];
  bezierIn: Point[];
}

export interface KeyframeFloatLite {
  startValue: number;
  endValue: number;
  startTime: number;
  endTime: number;
  interpolationType: number; // KeyframeInterpolationType
  bezierOut: Point[];
  bezierIn: Point[];
}

export class Transform2D {
  public wasmIns: any;

  public constructor(wasmIns: any) {
    this.wasmIns = wasmIns;
  }

  // Instances are created natively via PAGLayer.getTransform2D().

  // anchorPoint
  public anchorPoint(): Point {
    return this.wasmIns._getAnchorPoint() as Point;
  }
  public setAnchorPoint(p: Point): void {
    this.wasmIns._setAnchorPoint(p);
  }

  // position (combined)
  public position(): Point {
    return this.wasmIns._getPosition() as Point;
  }
  public setPosition(p: Point): void {
    this.wasmIns._setPosition(p);
  }

  // separated x/y position
  public xPosition(): number {
    return this.wasmIns._getXPosition() as number;
  }
  public setXPosition(v: number): void {
    this.wasmIns._setXPosition(v);
  }
  public yPosition(): number {
    return this.wasmIns._getYPosition() as number;
  }
  public setYPosition(v: number): void {
    this.wasmIns._setYPosition(v);
  }

  // scale
  public scale(): Point {
    return this.wasmIns._getScale() as Point;
  }
  public setScale(p: Point): void {
    this.wasmIns._setScale(p);
  }

  // rotation
  public rotation(): number {
    return this.wasmIns._getRotation() as number;
  }
  public setRotation(v: number): void {
    this.wasmIns._setRotation(v);
  }

  // opacity
  public opacity(): number {
    return this.wasmIns._getOpacity() as number;
  }
  public setOpacity(v: number): void {
    this.wasmIns._setOpacity(v);
  }

  // --- Keyframes: getters ---
  public getAnchorPointKeyframes(): KeyframePointLite[] {
    return this.wasmIns._getAnchorPointKeyframes() as KeyframePointLite[];
  }
  public getPositionKeyframes(): KeyframePointLite[] {
    return this.wasmIns._getPositionKeyframes() as KeyframePointLite[];
  }
  public getScaleKeyframes(): KeyframePointLite[] {
    return this.wasmIns._getScaleKeyframes() as KeyframePointLite[];
  }
  public getRotationKeyframes(): KeyframeFloatLite[] {
    return this.wasmIns._getRotationKeyframes() as KeyframeFloatLite[];
  }
  public getOpacityKeyframes(): KeyframeFloatLite[] {
    return this.wasmIns._getOpacityKeyframes() as KeyframeFloatLite[];
  }

  // --- Keyframes: setters ---
  public setAnchorPointKeyframes(list: KeyframePointLite[]): void {
    this.wasmIns._setAnchorPointKeyframes(list);
  }
  public setPositionKeyframes(list: KeyframePointLite[]): void {
    this.wasmIns._setPositionKeyframes(list);
  }
  public setScaleKeyframes(list: KeyframePointLite[]): void {
    this.wasmIns._setScaleKeyframes(list);
  }
  public setRotationKeyframes(list: KeyframeFloatLite[]): void {
    this.wasmIns._setRotationKeyframes(list);
  }
  public setOpacityKeyframes(list: KeyframeFloatLite[]): void {
    this.wasmIns._setOpacityKeyframes(list);
  }
}
