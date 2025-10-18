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

#include "pag/animation/SlidePreset.h"
#include <algorithm>
#include <cmath>
#include <memory>
#include "base/utils/TimeUtil.h"

namespace pag {
namespace {
constexpr double kEpsilon = 1e-6;

inline double Clamp01(double value) {
  if (value < 0.0) {
    return 0.0;
  }
  if (value > 1.0) {
    return 1.0;
  }
  return value;
}

inline double EaseOutCubic(double t) {
  t = Clamp01(t);
  auto inv = 1.0 - t;
  return 1.0 - inv * inv * inv;
}

Point GetPositionFromTransform(const std::shared_ptr<Transform2D>& transform) {
  if (!transform) {
    return Point::Zero();
  }
  if (transform->position != nullptr) {
    return transform->position->value;
  }
  if (transform->xPosition != nullptr && transform->yPosition != nullptr) {
    return Point::Make(transform->xPosition->value, transform->yPosition->value);
  }
  return Point::Zero();
}
}  // namespace

SlideLeftGlyphProvider::SlideLeftGlyphProvider(int64_t duration, double translationDeltaX,
                                               double stagger, double trailing)
    : durationUS(std::max<int64_t>(duration, 1)),
      staggerFraction(std::max(0.0, std::min(stagger, 0.95))),
      trailingFactor(std::max(0.0, trailing)),
      translationDeltaX(translationDeltaX) {
}

void SlideLeftGlyphProvider::setProgress(double progress) {
  manualTimeUS = Clamp01(progress) * static_cast<double>(durationUS);
}

bool SlideLeftGlyphProvider::compute(int64_t layerTimeUS, int totalGlyphs, float* dx, float* dy,
                                     float* alpha) {
  if (totalGlyphs <= 0 || dx == nullptr || dy == nullptr || alpha == nullptr) {
    return false;
  }
  double time = manualTimeUS >= 0.0 ? manualTimeUS : static_cast<double>(layerTimeUS);
  time = std::clamp(time, 0.0, static_cast<double>(durationUS));
  double baseNormalized = durationUS > 0 ? time / static_cast<double>(durationUS) : 0.0;
  double baseEased = EaseOutCubic(baseNormalized);
  double totalDelay = durationUS * staggerFraction;
  double perGlyphDelay =
      (totalGlyphs > 1) ? totalDelay / static_cast<double>(totalGlyphs - 1) : 0.0;
  double activeDuration = durationUS - totalDelay;
  if (activeDuration <= kEpsilon) {
    activeDuration = static_cast<double>(durationUS);
  }
  bool applied = false;
  for (int i = 0; i < totalGlyphs; ++i) {
    auto startTime = perGlyphDelay * static_cast<double>(i);
    double local = time - startTime;
    double t = 0.0;
    if (local <= 0.0) {
      t = 0.0;
    } else if (local >= activeDuration) {
      t = 1.0;
    } else {
      t = local / activeDuration;
    }
    auto glyphEased = EaseOutCubic(t);
    auto offset =
        static_cast<float>((glyphEased - baseEased) * translationDeltaX * trailingFactor);
    dx[i] = offset;
    dy[i] = 0.0f;
    alpha[i] = static_cast<float>(Clamp01(glyphEased));
    if (std::abs(offset) > kEpsilon || alpha[i] > 0.0f) {
      applied = true;
    }
  }
  return applied;
}

SlideLeftPreset::SlideLeftPreset(std::shared_ptr<PAGTextLayer> layer, int64_t presetDuration,
                                 float startX, float endX, double stagger, double trailing)
    : weakLayer(layer),
      durationUS(presetDuration),
      staggerFraction(stagger),
      trailingFactor(trailing) {
  auto sharedLayer = weakLayer.lock();
  if (sharedLayer) {
    auto baseTransform = sharedLayer->getTransform2D();
    if (!baseTransform) {
      baseTransform = Transform2D::MakeDefault();
    }
    anchorPoint = baseTransform->anchorPoint ? baseTransform->anchorPoint->value : Point::Zero();
    scale = baseTransform->scale ? baseTransform->scale->value : Point::Make(1, 1);
    rotation = baseTransform->rotation ? baseTransform->rotation->value : 0.0f;
    opacity = baseTransform->opacity ? baseTransform->opacity->value : Opaque;
    startPosition = GetPositionFromTransform(baseTransform);
    endPosition = startPosition;
    startPosition.x = startX;
    endPosition.x = endX;
  }
  initialize();
}

SlideLeftPreset::~SlideLeftPreset() {
  auto layer = weakLayer.lock();
  if (layer) {
    layer->clearGlyphTransform();
  }
}

std::shared_ptr<SlideLeftPreset> SlideLeftPreset::Make(std::shared_ptr<PAGTextLayer> textLayer,
                                                       int64_t duration, float startX, float endX,
                                                       double stagger, double trailing) {
  if (!textLayer || duration <= 0) {
    return nullptr;
  }
  auto preset = std::shared_ptr<SlideLeftPreset>(
      new SlideLeftPreset(std::move(textLayer), duration, startX, endX, stagger, trailing));
  return preset;
}

void SlideLeftPreset::initialize() {
  auto layer = weakLayer.lock();
  if (!layer) {
    return;
  }
  glyphProvider = std::make_shared<SlideLeftGlyphProvider>(
      durationUS, static_cast<double>(endPosition.x - startPosition.x), staggerFraction,
      trailingFactor);
  if (glyphProvider) {
    glyphProvider->setProgress(0.0);
    layer->setGlyphTransformProvider(glyphProvider);
  }
  layer->setProgress(0.0);
  updateTransform(0.0);
  layer->notifyModified(true);
}

void SlideLeftPreset::apply(double progress) {
  currentProgress = Clamp01(progress);
  auto layer = weakLayer.lock();
  if (!layer) {
    return;
  }
  layer->setProgress(currentProgress);
  auto eased = EaseOutCubic(currentProgress);
  if (glyphProvider) {
    glyphProvider->setProgress(currentProgress);
  }
  updateTransform(eased);
  layer->notifyModified(true);
}

void SlideLeftPreset::reset() {
  apply(0.0);
}

void SlideLeftPreset::updateTransform(double easedProgress) {
  auto layer = weakLayer.lock();
  if (!layer) {
    return;
  }
  auto transform = Transform2D::MakeDefault();
  transform->anchorPoint->value = anchorPoint;
  transform->scale->value = scale;
  transform->rotation->value = rotation;
  transform->opacity->value = opacity;
  auto position = Point::Make(
      startPosition.x + static_cast<float>((endPosition.x - startPosition.x) * easedProgress),
      startPosition.y + static_cast<float>((endPosition.y - startPosition.y) * easedProgress));
  transform->position->value = position;
  auto sharedTransform = std::shared_ptr<Transform2D>(transform.release());
  layer->setTransform2D(sharedTransform);
}

}  // namespace pag
