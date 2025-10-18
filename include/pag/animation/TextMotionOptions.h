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

#include "pag/types.h"

namespace pag {

enum class TextMotionType {
  Fade,
  Scale,
  Slide,
  Swing,
};

enum class TextMotionDirection {
  Up,
  Left,
  Right,
  Down,
  Side,
};

enum class TextMotionEasing {
  Smooth,
  EaseIn,
  EaseOut,
  Back,
  Bounce,
  Spring,
};

enum class TextMotionEffect {
  None,
  Letter,
  Word,
};

enum class TextMotionEffectSmooth {
  None,
  Smooth,
  EaseIn,
  EaseOut,
};

/**
 * Runtime options for constructing a preset text motion on PAGTextLayer.
 * All time units are in microseconds when reaching native code.
 */
struct TextMotionOptions {
  TextMotionType type = TextMotionType::Fade;
  TextMotionDirection direction = TextMotionDirection::Up;
  double duration = 0.0;     // microseconds
  double distance = 0.5;     // relative intensity, commonly scaled by font size
  TextMotionEasing easing = TextMotionEasing::Smooth;
  TextMotionEffect effect = TextMotionEffect::None;
  double effectDelay = 0.0;  // microseconds between successive units
  TextMotionEffectSmooth effectSmooth = TextMotionEffectSmooth::None;
};

}  // namespace pag

