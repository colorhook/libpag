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

#include <cstddef>
#include <cstdint>
#include "pag/animation/TextMotionOptions.h"

namespace pag {

enum class AnchorPointGrouping : uint8_t;
class TextLayer;

/**
 * Utility class that builds runtime text animators from TextMotionOptions.
 */
class TextMotionPreset {
 public:
  TextMotionPreset(TextLayer* textLayer, float frameRate);
  ~TextMotionPreset();

  /**
   * Apply the provided options and rebuild internal text animators.
   * Returns true if any animator was created.
   */
  bool apply(const TextMotionOptions& options);

  /**
   * Removes all animators created by this preset and restores layer state.
   */
  void clear();

 private:
  TextLayer* layer = nullptr;
  float frameRate = 60.0f;
  std::size_t baseAnimatorCount = 0;
  bool createdMoreOption = false;
  AnchorPointGrouping originalGrouping = static_cast<AnchorPointGrouping>(0);
};

}  // namespace pag
