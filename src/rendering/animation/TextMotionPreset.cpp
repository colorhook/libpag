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

#include "pag/animation/TextMotionPreset.h"

#include <algorithm>
#include <cmath>
#include <cctype>
#include <utility>
#include <vector>
#include "base/keyframes/MultiDimensionPointKeyframe.h"
#include "base/keyframes/SingleEaseKeyframe.h"
#include "base/utils/TimeUtil.h"
#include "pag/file.h"
#include "rendering/renderers/TextRenderer.h"

namespace pag {
namespace {

struct UnitRange {
  size_t start = 0;
  size_t end = 0;  // exclusive
};

Percent ToPercent(size_t value, size_t total) {
  if (total == 0) {
    return 0.0f;
  }
  return static_cast<Percent>(static_cast<double>(value) / static_cast<double>(total));
}

bool IsWhitespaceGlyph(const GlyphHandle& glyph) {
  auto name = glyph ? glyph->getName() : std::string();
  if (name.empty()) {
    return false;
  }
  if (name == "\n" || name == "\r") {
    return true;
  }
  if (name.size() == 1 && std::isspace(static_cast<unsigned char>(name[0])) != 0) {
    return true;
  }
  return false;
}

std::vector<UnitRange> BuildRanges(TextMotionEffect effect, const std::vector<GlyphHandle>& glyphs) {
  std::vector<UnitRange> ranges;
  if (glyphs.empty()) {
    return ranges;
  }
  switch (effect) {
    case TextMotionEffect::Letter: {
      ranges.reserve(glyphs.size());
      for (size_t i = 0; i < glyphs.size(); ++i) {
        if (IsWhitespaceGlyph(glyphs[i])) {
          continue;
        }
        ranges.push_back({i, i + 1});
      }
      break;
    }
    case TextMotionEffect::Word: {
      bool inWord = false;
      size_t startIndex = 0;
      for (size_t i = 0; i < glyphs.size(); ++i) {
        if (IsWhitespaceGlyph(glyphs[i])) {
          if (inWord) {
            ranges.push_back({startIndex, i});
            inWord = false;
          }
          continue;
        }
        if (!inWord) {
          startIndex = i;
          inWord = true;
        }
      }
      if (inWord) {
        ranges.push_back({startIndex, glyphs.size()});
      }
      break;
    }
    case TextMotionEffect::None:
    default:
      ranges.push_back({0, glyphs.size()});
      break;
  }
  // Guard against empty ranges (e.g., text is spaces only).
  if (ranges.empty()) {
    ranges.push_back({0, glyphs.size()});
  }
  return ranges;
}

double ApplyEffectSmooth(TextMotionEffectSmooth smooth, double t) {
  t = std::clamp(t, 0.0, 1.0);
  switch (smooth) {
    case TextMotionEffectSmooth::Smooth:
      return t * t * (3.0 - 2.0 * t);
    case TextMotionEffectSmooth::EaseIn:
      return t * t;
    case TextMotionEffectSmooth::EaseOut: {
      auto inv = 1.0 - t;
      return 1.0 - inv * inv;
    }
    default:
      return t;
  }
}

struct EasingConfig {
  KeyframeInterpolationType type = KeyframeInterpolationType::Linear;
  Point controlOut = Point::Make(0.0f, 0.0f);
  Point controlIn = Point::Make(1.0f, 1.0f);
};

EasingConfig GetEasingConfig(TextMotionEasing easing) {
  EasingConfig config;
  switch (easing) {
    case TextMotionEasing::EaseIn:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.42f, 0.0f);
      config.controlIn = Point::Make(1.0f, 1.0f);
      break;
    case TextMotionEasing::EaseOut:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.0f, 0.0f);
      config.controlIn = Point::Make(0.58f, 1.0f);
      break;
    case TextMotionEasing::Back:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.36f, -0.2f);
      config.controlIn = Point::Make(0.66f, 1.2f);
      break;
    case TextMotionEasing::Bounce:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.3f, 1.3f);
      config.controlIn = Point::Make(0.6f, 1.0f);
      break;
    case TextMotionEasing::Spring:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.45f, 1.4f);
      config.controlIn = Point::Make(0.8f, 1.0f);
      break;
    case TextMotionEasing::Smooth:
    default:
      config.type = KeyframeInterpolationType::Bezier;
      config.controlOut = Point::Make(0.42f, 0.0f);
      config.controlIn = Point::Make(0.58f, 1.0f);
      break;
  }
  return config;
}

template <typename T>
AnimatableProperty<T>* MakeScalarAnimation(Frame startFrame, Frame endFrame, const T& startValue,
                                           const T& endValue, const EasingConfig& easing) {
  auto* keyframe = new SingleEaseKeyframe<T>();
  keyframe->startTime = startFrame;
  keyframe->endTime = endFrame;
  keyframe->startValue = startValue;
  keyframe->endValue = endValue;
  keyframe->interpolationType = easing.type;
  if (easing.type == KeyframeInterpolationType::Bezier) {
    keyframe->bezierOut.resize(1);
    keyframe->bezierIn.resize(1);
    keyframe->bezierOut[0] = easing.controlOut;
    keyframe->bezierIn[0] = easing.controlIn;
  }
  std::vector<Keyframe<T>*> keyframes = {keyframe};
  return new AnimatableProperty<T>(keyframes);
}

AnimatableProperty<Point>* MakePointAnimation(Frame startFrame, Frame endFrame,
                                              const Point& startValue, const Point& endValue,
                                              const EasingConfig& easing) {
  auto* keyframe = new MultiDimensionPointKeyframe();
  keyframe->startTime = startFrame;
  keyframe->endTime = endFrame;
  keyframe->startValue = startValue;
  keyframe->endValue = endValue;
  keyframe->interpolationType = easing.type;
  if (easing.type == KeyframeInterpolationType::Bezier) {
    keyframe->bezierOut.resize(2);
    keyframe->bezierIn.resize(2);
    keyframe->bezierOut[0] = easing.controlOut;
    keyframe->bezierOut[1] = easing.controlOut;
    keyframe->bezierIn[0] = easing.controlIn;
    keyframe->bezierIn[1] = easing.controlIn;
  }
  std::vector<Keyframe<Point>*> keyframes = {keyframe};
  return new AnimatableProperty<Point>(keyframes);
}

Point ComputeSlideOffset(const TextDocument* document, TextMotionDirection direction,
                         double distance) {
  auto fontSize = document ? document->fontSize : 0.0f;
  auto magnitude = static_cast<float>(distance * fontSize);
  switch (direction) {
    case TextMotionDirection::Up:
      return Point::Make(0.0f, -magnitude);
    case TextMotionDirection::Down:
      return Point::Make(0.0f, magnitude);
    case TextMotionDirection::Left:
      return Point::Make(-magnitude, 0.0f);
    case TextMotionDirection::Right:
      return Point::Make(magnitude, 0.0f);
    case TextMotionDirection::Side:
    default:
      return Point::Make(magnitude, 0.0f);
  }
}

float ComputeSwingAngle(TextMotionDirection direction) {
  switch (direction) {
    case TextMotionDirection::Up:
      return -20.0f;
    case TextMotionDirection::Down:
      return 20.0f;
    case TextMotionDirection::Left:
      return -15.0f;
    case TextMotionDirection::Right:
      return 15.0f;
    case TextMotionDirection::Side:
    default:
      return 12.0f;
  }
}

}  // namespace

TextMotionPreset::TextMotionPreset(TextLayer* textLayer, float rate)
    : layer(textLayer), frameRate(rate) {
  if (layer) {
    baseAnimatorCount = layer->animators.size();
    if (layer->moreOption != nullptr) {
      originalGrouping = layer->moreOption->anchorPointGrouping;
    } else {
      originalGrouping = AnchorPointGrouping::Character;
    }
  }
}

TextMotionPreset::~TextMotionPreset() {
  clear();
}

void TextMotionPreset::clear() {
  if (layer == nullptr) {
    return;
  }
  if (createdMoreOption) {
    if (layer->moreOption != nullptr) {
      delete layer->moreOption;
      layer->moreOption = nullptr;
    }
    createdMoreOption = false;
  } else if (layer->moreOption != nullptr) {
    layer->moreOption->anchorPointGrouping = originalGrouping;
  }
  auto& animators = layer->animators;
  while (animators.size() > baseAnimatorCount) {
    delete animators.back();
    animators.pop_back();
  }
}

bool TextMotionPreset::apply(const TextMotionOptions& options) {
  if (layer == nullptr) {
    return false;
  }
  clear();
  auto textData = layer->getTextDocument();
  if (textData == nullptr) {
    return false;
  }
  auto textDocument = textData.get();
  auto [lines, bounds] = GetLines(textDocument, layer->pathOption);
  (void)bounds;
  std::vector<GlyphHandle> glyphs;
  for (auto& line : lines) {
    for (auto& glyph : line) {
      glyphs.push_back(glyph);
    }
  }
  if (glyphs.empty()) {
    return false;
  }
  auto ranges = BuildRanges(options.effect, glyphs);
  const auto glyphCount = glyphs.size();
  const auto easing = GetEasingConfig(options.easing);
  const double durationUS = std::max(0.0, options.duration);
  const double delayUS = std::max(0.0, options.effectDelay);
  const double totalStaggerUS =
      (ranges.size() > 1) ? delayUS * static_cast<double>(ranges.size() - 1) : 0.0;
  bool anyCreated = false;

  AnchorPointGrouping targetGrouping = AnchorPointGrouping::Character;
  if (options.effect == TextMotionEffect::Word) {
    targetGrouping = AnchorPointGrouping::Word;
  } else if (options.effect == TextMotionEffect::None) {
    targetGrouping = AnchorPointGrouping::All;
  }

  auto alignmentTarget = Point::Make(0.5f, 0.5f);
  if (layer->moreOption == nullptr) {
    layer->moreOption = new TextMoreOptions();
    if (layer->moreOption->groupingAlignment == nullptr) {
      auto* alignProp = new Property<Point>();
      alignProp->value = alignmentTarget;
      layer->moreOption->groupingAlignment = alignProp;
    }
    createdMoreOption = true;
  } else if (layer->moreOption->groupingAlignment == nullptr) {
    auto* alignProp = new Property<Point>();
    alignProp->value = alignmentTarget;
    layer->moreOption->groupingAlignment = alignProp;
  }
  layer->moreOption->anchorPointGrouping = targetGrouping;

  for (size_t i = 0; i < ranges.size(); ++i) {
    auto range = ranges[i];
    range.start = std::min(range.start, glyphCount);
    range.end = std::min(range.end, glyphCount);
    if (range.start >= range.end) {
      continue;
    }
    double offsetUS = 0.0;
    if (options.effect != TextMotionEffect::None && ranges.size() > 1) {
      if (options.effectSmooth == TextMotionEffectSmooth::None) {
        offsetUS = delayUS * static_cast<double>(i);
      } else {
        double normalized = static_cast<double>(i) / static_cast<double>(ranges.size() - 1);
        offsetUS = ApplyEffectSmooth(options.effectSmooth, normalized) * totalStaggerUS;
      }
    }
    auto startFrame = layer->startTime + TimeToFrame(static_cast<int64_t>(std::llround(offsetUS)),
                                                     frameRate);
    auto endFrame = layer->startTime + TimeToFrame(
                                         static_cast<int64_t>(std::llround(offsetUS + durationUS)),
                                         frameRate);
    if (endFrame <= startFrame) {
      endFrame = startFrame + 1;
    }
    auto lastFrame = layer->startTime + layer->duration;
    if (endFrame > lastFrame) {
      endFrame = lastFrame;
      if (endFrame <= startFrame) {
        endFrame = startFrame + 1;
      }
    }

    auto* animator = new TextAnimator();
    auto* selector = new TextRangeSelector();
    selector->start = new Property<Percent>(ToPercent(range.start, glyphCount));
    selector->end = new Property<Percent>(ToPercent(range.end, glyphCount));
    selector->offset = new Property<float>(0.0f);
    selector->units = TextRangeSelectorUnits::Percentage;
    if (options.effect == TextMotionEffect::Word) {
      selector->basedOn = TextSelectorBasedOn::Words;
    } else {
      selector->basedOn = TextSelectorBasedOn::Characters;
    }
    selector->mode = new Property<TextSelectorMode>(TextSelectorMode::Add);
    selector->amount = new Property<Percent>(1.0f);
    selector->shape = TextRangeSelectorShape::Square;
    selector->smoothness = new Property<Percent>(1.0f);
    selector->easeHigh = new Property<Percent>(0.0f);
    selector->easeLow = new Property<Percent>(0.0f);
    selector->randomizeOrder = false;
    selector->randomSeed = new Property<uint16_t>(0);
    animator->selectors.push_back(selector);

    animator->typographyProperties = new TextAnimatorTypographyProperties();
    auto* props = animator->typographyProperties;

    switch (options.type) {
      case TextMotionType::Scale: {
        auto startScale = Point::Make(0.0f, 0.0f);
        auto endScale = Point::Make(1.0f, 1.0f);
        props->scale = MakePointAnimation(startFrame, endFrame, startScale, endScale, easing);
        break;
      }
      case TextMotionType::Slide: {
        auto offset = ComputeSlideOffset(textDocument, options.direction, options.distance);
        props->position = MakePointAnimation(startFrame, endFrame, offset, Point::Zero(), easing);
        break;
      }
      case TextMotionType::Swing: {
        auto startAngle = ComputeSwingAngle(options.direction);
        props->rotation = MakeScalarAnimation<float>(startFrame, endFrame, startAngle, 0.0f, easing);
        break;
      }
      case TextMotionType::Fade:
      default: {
        props->opacity =
            MakeScalarAnimation<Opacity>(startFrame, endFrame, Transparent, Opaque, easing);
        break;
      }
    }

    layer->animators.push_back(animator);
    anyCreated = true;
  }
  return anyCreated;
}

}  // namespace pag
