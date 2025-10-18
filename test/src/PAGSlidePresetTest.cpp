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

#include <array>
#include <cmath>
#include "gtest/gtest.h"
#include "pag/animation/SlidePreset.h"
#include "pag/pag.h"

namespace pag {
namespace {
constexpr int64_t kDuration = 3 * 1000 * 1000;  // 3s in microseconds
constexpr float kStartX = 240.0f;
constexpr float kEndX = 40.0f;
}  // namespace

TEST(SlideLeftGlyphProviderTest, StaggeredOffsets) {
  SlideLeftGlyphProvider provider(kDuration, kEndX - kStartX, 0.6, 1.0);
  std::array<float, 5> dx = {};
  std::array<float, 5> dy = {};
  std::array<float, 5> alpha = {};
  // Halfway through the animation.
  auto applied = provider.compute(kDuration / 2, static_cast<int>(dx.size()), dx.data(), dy.data(),
                                  alpha.data());
  EXPECT_TRUE(applied);
  // First glyph should be leading (ahead of base translation) with near-opaque alpha.
  EXPECT_LT(dx[0], 0.0f);
  EXPECT_NEAR(alpha[0], 1.0f, 1e-3f);
  // Last glyph should lag behind and remain partially transparent.
  EXPECT_GT(dx.back(), 0.0f);
  EXPECT_LT(alpha.back(), 1.0f);

  // Manual progress override should work even if time argument is zero.
  provider.setProgress(0.75);
  dx.fill(0.0f);
  dy.fill(0.0f);
  alpha.fill(1.0f);
  provider.compute(0, static_cast<int>(dx.size()), dx.data(), dy.data(), alpha.data());
  EXPECT_LT(dx[0], 0.0f);
  EXPECT_GT(dx.back(), 0.0f);
  EXPECT_LT(alpha.back(), 1.0f);

  // End of animation, everything should be settled.
  provider.compute(kDuration, static_cast<int>(dx.size()), dx.data(), dy.data(), alpha.data());
  for (size_t i = 0; i < dx.size(); ++i) {
    EXPECT_NEAR(dx[i], 0.0f, 1e-3f);
    EXPECT_NEAR(alpha[i], 1.0f, 1e-3f);
  }
}

TEST(SlideLeftPresetTest, ApplyProgressUpdatesTransform) {
  auto textLayer = PAGTextLayer::Make(kDuration, "Hello", 48.0f, "Arial", "Regular");
  ASSERT_NE(textLayer, nullptr);
  auto preset = SlideLeftPreset::Make(textLayer, kDuration, kStartX, kEndX);
  ASSERT_NE(preset, nullptr);

  preset->apply(0.0);
  auto transform = textLayer->getTransform2D();
  ASSERT_NE(transform, nullptr);
  ASSERT_NE(transform->position, nullptr);
  EXPECT_NEAR(transform->position->value.x, kStartX, 1e-3f);

  preset->apply(0.5);
  transform = textLayer->getTransform2D();
  float expectedMid = kStartX + (kEndX - kStartX) * 0.5f;
  EXPECT_NEAR(transform->position->value.x, expectedMid, 1.0f);
  EXPECT_NEAR(textLayer->getProgress(), 0.5, 1e-3);

  preset->apply(1.0);
  transform = textLayer->getTransform2D();
  EXPECT_NEAR(transform->position->value.x, kEndX, 1e-3f);
  EXPECT_NEAR(textLayer->getProgress(), 1.0, 1e-3);
}

}  // namespace pag
