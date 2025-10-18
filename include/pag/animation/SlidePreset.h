/////////////////////////////////////////////////////////////////////////////////////////////////
//
//  Tencent is pleased to support the open source community by making libpag available.
//
//  Copyright (C) 2025 Tencent. All rights reserved.
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

#pragma once

#include <memory>
#include "pag/pag.h"

namespace pag {

/**
 * Glyph provider used by SlideLeftPreset. Applies a staggered offset and opacity ramp.
 */
class PAG_API SlideLeftGlyphProvider : public GlyphOffsetAlphaProvider {
 public:
  SlideLeftGlyphProvider(int64_t durationUS, double translationDeltaX, double staggerFraction,
                         double trailingFactor);
  ~SlideLeftGlyphProvider() override = default;

  void setProgress(double progress);

  bool compute(int64_t layerTimeUS, int totalGlyphs, float* dx, float* dy,
               float* alpha) override;

  int64_t duration() const {
    return durationUS;
  }

 private:
  int64_t durationUS = 0;
  double staggerFraction = 0.6;
  double trailingFactor = 1.0;
  double translationDeltaX = 0.0;
  double manualTimeUS = -1.0;
};

/**
 * A helper preset that animates a PAGTextLayer with a slide-left effect and glyph staggering.
 * Call apply(progress) with progress in [0, 1] to update the animation.
 */
class PAG_API SlideLeftPreset : public std::enable_shared_from_this<SlideLeftPreset> {
 public:
  static std::shared_ptr<SlideLeftPreset> Make(std::shared_ptr<PAGTextLayer> textLayer,
                                               int64_t durationUS, float startX, float endX,
                                               double staggerFraction = 0.6,
                                               double trailingFactor = 1.0);

  ~SlideLeftPreset();

  /**
   * Apply the preset to the specified progress (0~1).
   */
  void apply(double progress);

  /**
   * Reset the preset to the initial state (progress = 0).
   */
  void reset();

  /**
   * Returns the configured duration in microseconds.
   */
  int64_t duration() const {
    return durationUS;
  }

  /**
   * Returns the latest applied progress.
   */
  double progress() const {
    return currentProgress;
  }

 private:
  SlideLeftPreset(std::shared_ptr<PAGTextLayer> layer, int64_t durationUS, float startX, float endX,
                  double staggerFraction, double trailingFactor);

  void initialize();
  void updateTransform(double easedProgress);

  std::weak_ptr<PAGTextLayer> weakLayer;
  int64_t durationUS = 0;
  double staggerFraction = 0.6;
  double trailingFactor = 1.0;
  double currentProgress = 0.0;

  Point anchorPoint = Point::Zero();
  Point startPosition = Point::Zero();
  Point endPosition = Point::Zero();
  Point scale = Point::Make(1, 1);
  float rotation = 0.0f;
  Opacity opacity = Opaque;

  std::shared_ptr<SlideLeftGlyphProvider> glyphProvider = nullptr;
};

}  // namespace pag
