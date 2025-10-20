/**
 * Shared schema definitions for TypeMonkey-inspired demos. These interfaces
 * describe the project JSON structure consumed by the runtime builder.
 */

/** RGBA color stored as floating point components in the range [0, 1]. */
export interface RGBAColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Supported easing functions for motion presets. */
export type EasingFunction =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backIn'
  | 'backOut'
  | 'backInOut'
  | 'bounceOut';

/** Built-in motion presets exposed to project authors. */
export type MotionType =
  | 'fade'
  | 'slideLeft'
  | 'slideDown'
  | 'scaleIn'
  | 'swing';

/**
 * Text styling applied to blocks. Nested objects mirror libpag expectations so
 * they can be mapped directly onto TextDocument instances.
 */
export interface TextStyle {
  readonly fontFamily: string;
  readonly fontWeight?: number | 'normal' | 'bold';
  readonly fontSize: number; // pixels
  readonly lineHeight?: number; // pixels
  readonly letterSpacing?: number; // pixels
  readonly fill: RGBAColor;
  readonly stroke?: {
    readonly color: RGBAColor;
    readonly width: number; // pixels
  };
}

/** Text block containing content and motion metadata. */
export interface TextBlock {
  readonly text: string;
  readonly style?: Partial<TextStyle>;
  readonly startTime: number; // seconds from project start
  readonly motionType: MotionType;
  readonly easingType: EasingFunction;
  readonly speed: 'fast' | 'medium' | 'slow';
  readonly layout: 'bottom' | 'cw' | 'ccw';
}

/** Background definitions supported by the demo builder. */
export type ProjectBackground =
  | { readonly type: 'solid'; readonly color: RGBAColor }
  | {
      readonly type: 'linear-gradient';
      readonly angle: number; // degrees
      readonly stops: readonly { offset: number; color: RGBAColor }[];
    }
  | { readonly type: 'pag'; readonly url: string }
  | { readonly type: 'image'; readonly url: string };

/** Root project container used to drive the builder. */
export interface Project {
  readonly width: number;
  readonly height: number;
  readonly background: ProjectBackground;
  readonly framerate: number; // frames per second for deterministic playback
  readonly duration: number; // total seconds
  readonly audioTrack?: {
    readonly url: string;
    readonly offset?: number; // seconds relative to project start
  };
  readonly globalStyle: TextStyle;
  readonly blocks: readonly TextBlock[];
}
