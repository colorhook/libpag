import { PAGModule } from './pag-module';
import { PAGFont } from './pag-font';
import { PAGLayer } from './pag-layer';
import { destroyVerify } from './utils/decorators';

import type { Color, TextDocument, TextMetrics, TextMotionOptions } from './types';

@destroyVerify
export class PAGTextLayer extends PAGLayer {
  public static make(
    duration: number,
    text: string,
    fontSize: number,
    fontFamily: string,
    fontStyle: string,
  ): PAGTextLayer;
  public static make(duration: number, textDocumentHandle: TextDocument): PAGTextLayer;
  public static make(
    duration: number,
    text: string | TextDocument,
    fontSize = 0,
    fontFamily = '',
    fontStyle = '',
  ): PAGTextLayer {
    if (typeof text === 'string') {
      return new PAGTextLayer(PAGModule._PAGTextLayer._Make(duration, text, fontSize, fontFamily, fontStyle));
    } else {
      return new PAGTextLayer(PAGModule._PAGTextLayer._Make(duration, text));
    }
  }

  /**
   * Returns the text layer’s fill color.
   */
  public fillColor(): Color {
    return this.wasmIns._fillColor() as Color;
  }
  /**
   * Set the text layer’s fill color.
   */
  public setFillColor(value: Color) {
    this.wasmIns._setFillColor(value);
  }
  /**
   * Returns the text layer's font.
   */
  public font(): PAGFont {
    return new PAGFont(this.wasmIns._font());
  }
  /**
   * Set the text layer's font.
   */
  public setFont(pagFont: PAGFont) {
    this.wasmIns._setFont(pagFont.wasmIns);
  }
  /**
   * Returns the text layer's font size.
   */
  public fontSize(): number {
    return this.wasmIns._fontSize() as number;
  }
  /**
   * Set the text layer's font size.
   */
  public setFontSize(size: number) {
    this.wasmIns._setFontSize(size);
  }
  /**
   * Returns the text layer's stroke color.
   */
  public strokeColor(): Color {
    return this.wasmIns._strokeColor() as Color;
  }
  /**
   * Set the text layer's stroke color.
   */
  public setStrokeColor(value: Color) {
    this.wasmIns._setStrokeColor(value);
  }
  /**
   * Returns the text layer's text.
   */
  public text(): string {
    return this.wasmIns._text() as string;
  }
  /**
   * Set the text layer's text.
   */
  public setText(text: string) {
    this.wasmIns._setText(text);
  }
  /**
   * Reset the text layer to its default text data.
   */
  public reset() {
    this.wasmIns._reset();
  }

  /**
   * Measure the current text metrics, similar to CanvasRenderingContext2D.measureText().
   */
  public measureText(): TextMetrics {
    return this.wasmIns._measureText() as TextMetrics;
  }

  /**
   * Get a copy of the TextDocument for this layer.
   */
  public getTextDocument(): TextDocument {
    return this.wasmIns._getTextDocument() as TextDocument;
  }

  /**
   * Set/replace text properties by a TextDocument. Only subset of fields are applied.
   */
  public setTextDocument(doc: TextDocument) {
    this.wasmIns._setTextDocument(doc);
  }

  /**
   * v1: Set a runtime per-glyph transform callback.
   * The callback receives {index,total} and returns {dx,dy,alpha}.
   */
  public setGlyphTransform(cb: (info: { index: number; total: number; timeUS?: number }) =>
    { dx?: number; dy?: number; alpha?: number } | void) {
    this.wasmIns._setGlyphTransform(cb as any);
  }

  /**
   * Clear the runtime per-glyph transform.
   */
  public clearGlyphTransform() {
    this.wasmIns._clearGlyphTransform();
  }

  public setTextMotionOptions(options: TextMotionOptions | null) {
    this.wasmIns._setTextMotionOptions(options ?? null);
  }
}
