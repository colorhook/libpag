/////////////////////////////////////////////////////////////////////////////////////////////////
//
//  Tencent is pleased to support the open source community by making libpag available.
//
//  Copyright (C) 2021 Tencent. All rights reserved.
//
//  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file
//  except in compliance with the License. You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
//  unless required by applicable law or agreed to in writing, software distributed under the
//  license is distributed on an "as is" basis, without warranties or conditions of any kind,
//  either express or implied. see the license for the specific language governing permissions
//  and limitations under the license.
//
/////////////////////////////////////////////////////////////////////////////////////////////////

#include "base/utils/TimeUtil.h"
#include "pag/pag.h"
#include "rendering/caches/LayerCache.h"
#include "rendering/editing/TextReplacement.h"
#include "rendering/utils/LockGuard.h"
#include "rendering/renderers/TextRenderer.h"

namespace pag {
std::shared_ptr<PAGTextLayer> PAGTextLayer::Make(int64_t duration, std::string text, float fontSize,
                                                 std::string fontFamily, std::string fontStyle) {
  if (duration <= 0) {
    return nullptr;
  }
  auto textDocument = std::shared_ptr<TextDocument>(new TextDocument());
  textDocument->text = std::move(text);
  textDocument->fontSize = fontSize;
  textDocument->fontFamily = std::move(fontFamily);
  textDocument->fontStyle = std::move(fontStyle);
  return Make(duration, textDocument);
}

std::shared_ptr<PAGTextLayer> PAGTextLayer::Make(int64_t duration,
                                                 std::shared_ptr<TextDocument> textDocumentHandle) {
  if (duration <= 0 || textDocumentHandle == nullptr) {
    return nullptr;
  }
  auto layer = new TextLayer();
  auto transform = Transform2D::MakeDefault();
  transform->position->value = Point::Make(0.0, textDocumentHandle->fontSize);
  layer->transform = transform.release();
  auto sourceText = new Property<TextDocumentHandle>();
  sourceText->value = std::move(textDocumentHandle);
  layer->sourceText = sourceText;

  layer->duration = TimeToFrame(duration, 60);
  auto textLayer = std::make_shared<PAGTextLayer>(nullptr, layer);
  textLayer->emptyTextLayer = layer;
  textLayer->weakThis = textLayer;
  return textLayer;
}

PAGTextLayer::PAGTextLayer(std::shared_ptr<pag::File> file, TextLayer* layer)
    : PAGLayer(file, layer) {
}

PAGTextLayer::~PAGTextLayer() {
  delete replacement;
  delete emptyTextLayer;
}

Color PAGTextLayer::fillColor() const {
  LockGuard autoLock(rootLocker);
  return textDocumentForRead()->fillColor;
}

void PAGTextLayer::setFillColor(const Color& value) {
  LockGuard autoLock(rootLocker);
  textDocumentForWrite()->fillColor = value;
}

PAGFont PAGTextLayer::font() const {
  LockGuard autoLock(rootLocker);
  auto textDocument = textDocumentForRead();
  return {textDocument->fontFamily, textDocument->fontStyle};
}

void PAGTextLayer::setFont(const PAGFont& font) {
  LockGuard autoLock(rootLocker);
  auto textDocument = textDocumentForWrite();
  textDocument->fontFamily = font.fontFamily;
  textDocument->fontStyle = font.fontStyle;
}

float PAGTextLayer::fontSize() const {
  LockGuard autoLock(rootLocker);
  return textDocumentForRead()->fontSize;
}

void PAGTextLayer::setFontSize(float size) {
  LockGuard autoLock(rootLocker);
  textDocumentForWrite()->fontSize = size;
}

Color PAGTextLayer::strokeColor() const {
  LockGuard autoLock(rootLocker);
  return textDocumentForRead()->strokeColor;
}

void PAGTextLayer::setStrokeColor(const Color& color) {
  LockGuard autoLock(rootLocker);
  textDocumentForWrite()->strokeColor = color;
}

std::string PAGTextLayer::text() const {
  LockGuard autoLock(rootLocker);
  return textDocumentForRead()->text;
}

void PAGTextLayer::setText(const std::string& text) {
  LockGuard autoLock(rootLocker);
  textDocumentForWrite()->text = text;
}

std::shared_ptr<TextDocument> PAGTextLayer::getTextDocument() {
  LockGuard autoLock(rootLocker);
  auto src = textDocumentForRead();
  if (src == nullptr) return nullptr;
  auto copy = std::make_shared<TextDocument>();
  // Copy all fields (read-only ones will be ignored on set).
  copy->applyFill = src->applyFill;
  copy->applyStroke = src->applyStroke;
  copy->baselineShift = src->baselineShift;
  copy->boxText = src->boxText;
  copy->boxTextPos = src->boxTextPos;
  copy->boxTextSize = src->boxTextSize;
  copy->firstBaseLine = src->firstBaseLine;
  copy->fauxBold = src->fauxBold;
  copy->fauxItalic = src->fauxItalic;
  copy->fillColor = src->fillColor;
  copy->fontFamily = src->fontFamily;
  copy->fontStyle = src->fontStyle;
  copy->fontSize = src->fontSize;
  copy->strokeColor = src->strokeColor;
  copy->strokeOverFill = src->strokeOverFill;
  copy->strokeWidth = src->strokeWidth;
  copy->text = src->text;
  copy->justification = src->justification;
  copy->leading = src->leading;
  copy->tracking = src->tracking;
  copy->backgroundColor = src->backgroundColor;
  copy->backgroundAlpha = src->backgroundAlpha;
  copy->direction = src->direction;
  return copy;
}

void PAGTextLayer::setTextDocument(std::shared_ptr<TextDocument> textData) {
  LockGuard autoLock(rootLocker);
  replaceTextInternal(std::move(textData));
}

void PAGTextLayer::replaceTextInternal(std::shared_ptr<TextDocument> textData) {
  if (textData == nullptr) {
    reset();
  } else {
    auto textDocument = textDocumentForWrite();
    // 仅以下属性支持外部修改：
    textDocument->applyFill = textData->applyFill;
    textDocument->applyStroke = textData->applyStroke;
    textDocument->fauxBold = textData->fauxBold;
    textDocument->fauxItalic = textData->fauxItalic;
    textDocument->fillColor = textData->fillColor;
    textDocument->fontFamily = textData->fontFamily;
    textDocument->fontStyle = textData->fontStyle;
    textDocument->fontSize = textData->fontSize;
    textDocument->strokeColor = textData->strokeColor;
    textDocument->strokeWidth = textData->strokeWidth;
    textDocument->text = textData->text;
    textDocument->backgroundColor = textData->backgroundColor;
    textDocument->backgroundAlpha = textData->backgroundAlpha;
    textDocument->justification = textData->justification;
    textDocument->leading = textData->leading;
    textDocument->tracking = textData->tracking;
  }
}

const TextDocument* PAGTextLayer::textDocumentForRead() const {
  return replacement ? replacement->getTextDocument()
                     : static_cast<TextLayer*>(layer)->sourceText->value.get();
}

TextDocument* PAGTextLayer::textDocumentForWrite() {
  if (replacement == nullptr) {
    replacement = new TextReplacement(this);
  } else {
    replacement->clearCache();
  }
  notifyModified(true);
  invalidateCacheScale();
  return replacement->getTextDocument();
}

void PAGTextLayer::reset() {
  if (replacement != nullptr) {
    delete replacement;
    replacement = nullptr;
    notifyModified(true);
    invalidateCacheScale();
  }
}

Content* PAGTextLayer::getContent() {
  if (replacement != nullptr) {
    return replacement->getContent(contentFrame);
  }
  return layerCache->getContent(contentFrame);
}

bool PAGTextLayer::contentModified() const {
  return replacement != nullptr;
}

void PAGTextLayer::setMatrixInternal(const Matrix& matrix) {
  if (matrix == layerMatrix) {
    return;
  }
  PAGLayer::setMatrixInternal(matrix);
}

TextMetrics PAGTextLayer::measureText() const {
  LockGuard autoLock(rootLocker);
  TextMetrics m = {};
  auto td = textDocumentForRead();

  // Measure text bounds using existing layout logic (no text-path options here).
  tgfx::Rect bounds = tgfx::Rect::MakeEmpty();
  {
    auto result = GetLines(td, nullptr);
    bounds = result.second;
  }

  // Calculate font ascent/descent from glyph metrics.
  float minAscent = 0.0f;
  float maxDescent = 0.0f;
  CalculateTextAscentAndDescent(td, &minAscent, &maxDescent);

  // Reconstruct font box top/bottom using the same rule as layout (line gap factor 1.2).
  const float lineGapFactor = 1.2f;
  float lineHeight = td->fontSize * lineGapFactor;
  float fontBottom = (maxDescent / (maxDescent - minAscent)) * lineHeight;
  float fontTop = fontBottom - lineHeight; // negative value

  // Fill metrics.
  m.width = bounds.width();
  m.actualBoundingBoxLeft = -bounds.left;
  m.actualBoundingBoxRight = bounds.right;
  m.actualBoundingBoxAscent = -bounds.top;
  m.actualBoundingBoxDescent = bounds.bottom;

  m.fontBoundingBoxAscent = -fontTop;
  m.fontBoundingBoxDescent = fontBottom;

  // Map em box to font size using proportions from font ascent/descent.
  float ascAbs = -minAscent;
  float desAbs = maxDescent;
  float sum = ascAbs + desAbs;
  if (sum > 0.0f) {
    m.emHeightAscent = td->fontSize * (ascAbs / sum);
    m.emHeightDescent = td->fontSize * (desAbs / sum);
  } else {
    // Fallback split.
    m.emHeightAscent = td->fontSize * 0.8f;
    m.emHeightDescent = td->fontSize * 0.2f;
  }

  // Baseline distances relative to alphabetic baseline (approximate).
  m.alphabeticBaseline = 0.0f;
  m.hangingBaseline = 0.0f;
  m.ideographicBaseline = 0.0f;

  return m;
}

}  // namespace pag
