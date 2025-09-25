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

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "base/utils/TGFXCast.h"
#include "pag/pag.h"
#include "pag/types.h"
#include "pag/file.h"
#include "platform/web/GPUDrawable.h"
#include "base/keyframes/MultiDimensionPointKeyframe.h"
#include "base/keyframes/SingleEaseKeyframe.h"
#include "platform/web/WebSoftwareDecoderFactory.h"
#include "rendering/editing/StillImage.h"
#include "tgfx/core/ImageInfo.h"
#include "tgfx/core/PathTypes.h"
#include "tgfx/gpu/opengl/GLDefines.h"

using namespace emscripten;

namespace pag {

// --- Lite DTOs for keyframes across WASM boundary ---
struct KeyframePointLite {
  Point startValue;
  Point endValue;
  int startTime;
  int endTime;
  int interpolationType;
  std::vector<Point> bezierOut;
  std::vector<Point> bezierIn;
};

struct KeyframeFloatLite {
  float startValue;
  float endValue;
  int startTime;
  int endTime;
  int interpolationType;
  std::vector<Point> bezierOut;
  std::vector<Point> bezierIn;
};

template <typename T>
static std::vector<KeyframePointLite> GetPointKeyframesFromProperty(Property<T>* /*unused*/);

static std::vector<KeyframePointLite> ToLites(const std::vector<Keyframe<Point>*>& kfs) {
  std::vector<KeyframePointLite> list;
  list.reserve(kfs.size());
  for (auto* k : kfs) {
    KeyframePointLite lite{};
    lite.startValue = k->startValue;
    lite.endValue = k->endValue;
    lite.startTime = static_cast<int>(k->startTime);
    lite.endTime = static_cast<int>(k->endTime);
    lite.interpolationType = static_cast<int>(k->interpolationType);
    lite.bezierOut = k->bezierOut;
    lite.bezierIn = k->bezierIn;
    list.push_back(std::move(lite));
  }
  return list;
}

static std::vector<KeyframeFloatLite> ToLites(const std::vector<Keyframe<float>*>& kfs) {
  std::vector<KeyframeFloatLite> list;
  list.reserve(kfs.size());
  for (auto* k : kfs) {
    KeyframeFloatLite lite{};
    lite.startValue = k->startValue;
    lite.endValue = k->endValue;
    lite.startTime = static_cast<int>(k->startTime);
    lite.endTime = static_cast<int>(k->endTime);
    lite.interpolationType = static_cast<int>(k->interpolationType);
    lite.bezierOut = k->bezierOut;
    lite.bezierIn = k->bezierIn;
    list.push_back(std::move(lite));
  }
  return list;
}

static Keyframe<Point>* FromLite(const KeyframePointLite& lite) {
  auto* k = new MultiDimensionPointKeyframe();
  k->startValue = lite.startValue;
  k->endValue = lite.endValue;
  k->startTime = static_cast<Frame>(lite.startTime);
  k->endTime = static_cast<Frame>(lite.endTime);
  k->interpolationType = static_cast<KeyframeInterpolationType>(lite.interpolationType);
  k->bezierOut = lite.bezierOut;
  k->bezierIn = lite.bezierIn;
  return k;
}

static Keyframe<float>* FromLite(const KeyframeFloatLite& lite) {
  auto* k = new SingleEaseKeyframe<float>();
  k->startValue = lite.startValue;
  k->endValue = lite.endValue;
  k->startTime = static_cast<Frame>(lite.startTime);
  k->endTime = static_cast<Frame>(lite.endTime);
  k->interpolationType = static_cast<KeyframeInterpolationType>(lite.interpolationType);
  k->bezierOut = lite.bezierOut;
  k->bezierIn = lite.bezierIn;
  return k;
}

static val ToJSPointArray(const std::vector<Point>& points) {
  auto arr = val::array();
  for (size_t i = 0; i < points.size(); ++i) {
    arr.call<void>("push", points[i]);
  }
  return arr;
}

// Helpers: parse JS arrays (plain) into lite vectors, to allow passing native JS arrays.
static std::vector<Point> ParsePointArray(const val& jsArray) {
  std::vector<Point> out;
  if (!jsArray.as<bool>()) return out;
  auto len = jsArray["length"].as<unsigned>();
  out.reserve(len);
  for (unsigned i = 0; i < len; i++) {
    auto item = jsArray[i];
    try {
      out.push_back(item.as<Point>());
    } catch (...) {
      // Fallback: try pick x/y numbers.
      Point p{};
      p.x = item.hasOwnProperty("x") ? item["x"].as<float>() : 0.0f;
      p.y = item.hasOwnProperty("y") ? item["y"].as<float>() : 0.0f;
      out.push_back(p);
    }
  }
  return out;
}

static std::vector<KeyframePointLite> ParseKeyframePointLites(const val& jsArray) {
  std::vector<KeyframePointLite> list;
  if (!jsArray.as<bool>()) return list;
  auto len = jsArray["length"].as<unsigned>();
  list.reserve(len);
  for (unsigned i = 0; i < len; i++) {
    auto item = jsArray[i];
    KeyframePointLite lite{};
    try {
      lite.startValue = item["startValue"].as<Point>();
    } catch (...) {
      lite.startValue = Point::Zero();
    }
    try {
      lite.endValue = item["endValue"].as<Point>();
    } catch (...) {
      lite.endValue = Point::Zero();
    }
    lite.startTime = item.hasOwnProperty("startTime") ? item["startTime"].as<int>() : 0;
    lite.endTime = item.hasOwnProperty("endTime") ? item["endTime"].as<int>() : 0;
    lite.interpolationType = item.hasOwnProperty("interpolationType") ? item["interpolationType"].as<int>() : 0;
    lite.bezierOut = item.hasOwnProperty("bezierOut") ? ParsePointArray(item["bezierOut"]) : std::vector<Point>{};
    lite.bezierIn = item.hasOwnProperty("bezierIn") ? ParsePointArray(item["bezierIn"]) : std::vector<Point>{};
    list.push_back(std::move(lite));
  }
  return list;
}

static std::vector<KeyframeFloatLite> ParseKeyframeFloatLites(const val& jsArray) {
  std::vector<KeyframeFloatLite> list;
  if (!jsArray.as<bool>()) return list;
  auto len = jsArray["length"].as<unsigned>();
  list.reserve(len);
  for (unsigned i = 0; i < len; i++) {
    auto item = jsArray[i];
    KeyframeFloatLite lite{};
    lite.startValue = item.hasOwnProperty("startValue") ? item["startValue"].as<float>() : 0.0f;
    lite.endValue = item.hasOwnProperty("endValue") ? item["endValue"].as<float>() : 0.0f;
    lite.startTime = item.hasOwnProperty("startTime") ? item["startTime"].as<int>() : 0;
    lite.endTime = item.hasOwnProperty("endTime") ? item["endTime"].as<int>() : 0;
    lite.interpolationType = item.hasOwnProperty("interpolationType") ? item["interpolationType"].as<int>() : 0;
    lite.bezierOut = item.hasOwnProperty("bezierOut") ? ParsePointArray(item["bezierOut"]) : std::vector<Point>{};
    lite.bezierIn = item.hasOwnProperty("bezierIn") ? ParsePointArray(item["bezierIn"]) : std::vector<Point>{};
    list.push_back(std::move(lite));
  }
  return list;
}

template <typename T>
static void ReplaceWithAnimatable(Property<T>** target, const std::vector<Keyframe<T>*>& keyframes,
                                  const T& fallback) {
  if (target == nullptr) return;
  if (!keyframes.empty()) {
    delete *target;
    *target = new AnimatableProperty<T>(keyframes);
  } else {
    // clear animation and use simple property with current or default value
    T value = fallback;
    if (*target != nullptr) {
      value = (*target)->getValueAt(ZeroFrame);
    }
    delete *target;
    *target = new Property<T>(value);
  }
}

std::unique_ptr<ByteData> CopyDataFromUint8Array(const val& emscriptenData) {
  if (!emscriptenData.as<bool>()) {
    return nullptr;
  }
  auto length = emscriptenData["length"].as<size_t>();
  if (length == 0) {
    return nullptr;
  }
  auto buffer = ByteData::Make(length);
  if (!buffer) {
    return nullptr;
  }
  auto memory = val::module_property("HEAPU8")["buffer"];
  auto memoryView =
      val::global("Uint8Array").new_(memory, reinterpret_cast<uintptr_t>(buffer->data()), length);
  memoryView.call<void>("set", emscriptenData);
  return buffer;
}

bool PAGBindInit() {
  class_<PAGLayer>("_PAGLayer")
      .smart_ptr<std::shared_ptr<PAGLayer>>("_PAGLayer")
      .function("_uniqueID", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.uniqueID());
                }))
      .function("_layerType", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.layerType());
                }))
      .function("_layerName", &PAGLayer::layerName)
      .function("_matrix", &PAGLayer::matrix)
      .function("_setMatrix", &PAGLayer::setMatrix)
      .function("_resetMatrix", &PAGLayer::resetMatrix)
      .function("_getTotalMatrix", &PAGLayer::getTotalMatrix)
      .function("_alpha", &PAGLayer::alpha)
      .function("_setAlpha", &PAGLayer::setAlpha)
      .function("_visible", &PAGLayer::visible)
      .function("_setVisible", &PAGLayer::setVisible)
      .function("_editableIndex", &PAGLayer::editableIndex)
      .function("_parent", &PAGLayer::parent)
      .function("_markers", optional_override([](PAGLayer& pagLayer) {
                  std::vector<Marker> result = {};
                  for (auto marker_ptr : pagLayer.markers()) {
                    Marker marker;
                    marker.startTime = marker_ptr->startTime;
                    marker.duration = marker_ptr->duration;
                    marker.comment = marker_ptr->comment;
                    result.push_back(marker);
                  }
                  return result;
                }))
      .function("_globalToLocalTime", optional_override([](PAGLayer& pagLayer, int globalTime) {
                  return static_cast<int>(pagLayer.globalToLocalTime(globalTime));
                }))
      .function("_localTimeToGlobal", optional_override([](PAGLayer& pagLayer, int localTime) {
                  return static_cast<int>(pagLayer.localTimeToGlobal(localTime));
                }))
      .function("_duration", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.duration());
                }))
      .function("_frameRate", &PAGLayer::frameRate)
      .function("_startTime", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.startTime());
                }))
      .function("_startTime", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.startTime());
                }))
      .function("_setStartTime", optional_override([](PAGLayer& pagLayer, int time) {
                  return pagLayer.setStartTime(static_cast<int64_t>(time));
                }))
      .function("_currentTime", optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.currentTime());
                }))
      .function("_setCurrentTime", optional_override([](PAGLayer& pagLayer, int time) {
                  return pagLayer.setCurrentTime(static_cast<int64_t>(time));
                }))
      .function("_getProgress", &PAGLayer::getProgress)
      .function("_setProgress", &PAGLayer::setProgress)
      .function("_preFrame", &PAGLayer::preFrame)
      .function("_nextFrame", &PAGLayer::nextFrame)
      .function("_getBounds", &PAGLayer::getBounds)
      .function("_trackMatteLayer", &PAGLayer::trackMatteLayer)
      .function("_trackMatteType",
                optional_override([](PAGLayer& pagLayer) {
                  return static_cast<int>(pagLayer.trackMatteType());
                }))
      .function("_setTrackMatte",
                optional_override([](PAGLayer& pagLayer,
                                     std::shared_ptr<PAGLayer> matteLayer, int type) {
                  return pagLayer.setTrackMatte(matteLayer,
                                                static_cast<TrackMatteType>(type));
                }))
      .function("_clearTrackMatte", &PAGLayer::clearTrackMatte)
      .function("_excludedFromTimeline", &PAGLayer::excludedFromTimeline)
      .function("_setExcludedFromTimeline", &PAGLayer::setExcludedFromTimeline)
      .function("_isPAGFile", &PAGLayer::isPAGFile)
      // WASM extension: Transform2D get/set
      .function("_getTransform2D", &PAGLayer::getTransform2D)
      .function("_setTransform2D", &PAGLayer::setTransform2D)
      // WASM extension: Transform3D get/set
      .function("_getTransform3D", &PAGLayer::getTransform3D)
      .function("_setTransform3D", &PAGLayer::setTransform3D)
      /** @patch */
      .function("_getMotionBlur", &PAGLayer::getMotionBlur)
      /** @patch */
      .function("_setMotionBlur", &PAGLayer::setMotionBlur);

  class_<PAGSolidLayer, base<PAGLayer>>("_PAGSolidLayer")
      .smart_ptr<std::shared_ptr<PAGSolidLayer>>("_PAGSolidLayer")
      .class_function("_Make", optional_override([](int duration, int width, int height,
                                                    Color solidColor, int opacity) {
                        return PAGSolidLayer::Make(static_cast<int64_t>(duration), width, height,
                                                   solidColor, opacity);
                      }))
      .function("_solidColor", &PAGSolidLayer::solidColor)
      .function("_setSolidColor", &PAGSolidLayer::setSolidColor);

  class_<PAGImageLayer, base<PAGLayer>>("_PAGImageLayer")
      .smart_ptr<std::shared_ptr<PAGImageLayer>>("_PAGImageLayer")
      .class_function("_Make", optional_override([](int width, int height, int duration) {
                        return PAGImageLayer::Make(width, height, static_cast<int64_t>(duration));
                      }))
      .function("_contentDuration", optional_override([](PAGImageLayer& pagImageLayer) {
                  return static_cast<int>(pagImageLayer.contentDuration());
                }))
      .function("_getVideoRanges", optional_override([](PAGImageLayer& pagImageLayer) {
                  auto res = val::array();
                  for (auto videoRange : pagImageLayer.getVideoRanges()) {
                    auto videoRangeVal = val::object();
                    videoRangeVal.set("startTime", static_cast<float>(videoRange.startTime()));
                    videoRangeVal.set("endTime", static_cast<float>(videoRange.endTime()));
                    videoRangeVal.set("playDuration",
                                      static_cast<float>(videoRange.playDuration()));
                    videoRangeVal.set("reversed", videoRange.reversed());
                    res.call<int>("push", videoRangeVal);
                  }
                  return res;
                }))
      .function("_replaceImage", &PAGImageLayer::replaceImage)
      .function("_setImage", &PAGImageLayer::setImage)
      .function("_layerTimeToContent",
                optional_override([](PAGImageLayer& pagImageLayer, int layerTime) {
                  return static_cast<int>(pagImageLayer.layerTimeToContent(layerTime));
                }))
      .function("_contentTimeToLayer",
                optional_override([](PAGImageLayer& pagImageLayer, int contentTime) {
                  return static_cast<int>(pagImageLayer.contentTimeToLayer(contentTime));
                }))
      .function("_imageBytes", optional_override([](PAGImageLayer& pagImageLayer) {
                  ByteData* result = pagImageLayer.imageBytes();
                  if (result->length() == 0) {
                    return val::null();
                  }
                  return val(typed_memory_view(result->length(), result->data()));
                }));

  class_<PAGTextLayer, base<PAGLayer>>("_PAGTextLayer")
      .smart_ptr<std::shared_ptr<PAGTextLayer>>("_PAGTextLayer")
      .class_function("_Make", optional_override([](int duration, std::string text, float fontSize,
                                                    std::string fontFamily, std::string fontStyle) {
                        return PAGTextLayer::Make(static_cast<int64_t>(duration), text, fontSize,
                                                  fontFamily, fontStyle);
                      }))
      .class_function(
          "_Make",
          optional_override([](int duration, std::shared_ptr<TextDocument> textDocumentHandle) {
            return PAGTextLayer::Make(static_cast<int64_t>(duration), textDocumentHandle);
          }))
      .function("_fillColor", &PAGTextLayer::fillColor)
      .function("_setFillColor", &PAGTextLayer::setFillColor)
      .function("_font", &PAGTextLayer::font)
      .function("_setFont", &PAGTextLayer::setFont)
      .function("_fontSize", &PAGTextLayer::fontSize)
      .function("_setFontSize", &PAGTextLayer::setFontSize)
      .function("_strokeColor", &PAGTextLayer::strokeColor)
      .function("_setStrokeColor", &PAGTextLayer::setStrokeColor)
      .function("_text", &PAGTextLayer::text)
      .function("_setText", &PAGTextLayer::setText)
      .function("_reset", &PAGTextLayer::reset)
      .function("_getTextDocument", optional_override([](PAGTextLayer& l) {
                  return l.getTextDocument();
                }))
      .function("_setTextDocument", &PAGTextLayer::setTextDocument)
      .function("_measureText", &PAGTextLayer::measureText)
      // v1: per-glyph offset+alpha runtime callback from JS
      .function("_setGlyphTransform",
                optional_override([](std::shared_ptr<PAGTextLayer> l, const val& jsFunc) {
                  struct WebGlyphProvider : public GlyphOffsetAlphaProvider {
                    val fn;
                    explicit WebGlyphProvider(val cb) : fn(std::move(cb)) {
                    }
                    bool compute(int64_t layerTimeUS, int totalGlyphs, float* dx, float* dy,
                                 float* alpha) override {
                      if (!fn.as<bool>()) return false;
                      // Call per-glyph JS function: fn({index, total}) -> {dx,dy,alpha}
                      for (int i = 0; i < totalGlyphs; i++) {
                        auto info = val::object();
                        info.set("index", i);
                        info.set("total", totalGlyphs);
                        info.set("timeUS", static_cast<double>(layerTimeUS));
                        val ret = fn(info);
                        if (ret.as<bool>()) {
                          float rdx = 0.0f, rdy = 0.0f, ra = 1.0f;
                          if (ret.hasOwnProperty("dx")) rdx = ret["dx"].as<float>();
                          if (ret.hasOwnProperty("dy")) rdy = ret["dy"].as<float>();
                          if (ret.hasOwnProperty("alpha")) ra = ret["alpha"].as<float>();
                          dx[i] = rdx;
                          dy[i] = rdy;
                          alpha[i] = ra;
                        } else {
                          dx[i] = 0.0f;
                          dy[i] = 0.0f;
                          alpha[i] = 1.0f;
                        }
                      }
                      return true;
                    }
                  };
                  if (jsFunc.as<bool>()) {
                    l->setGlyphTransformProvider(std::make_shared<WebGlyphProvider>(jsFunc));
                  } else {
                    l->clearGlyphTransform();
                  }
                }))
      .function("_clearGlyphTransform", optional_override([](std::shared_ptr<PAGTextLayer> l) {
                l->clearGlyphTransform();
              }));

  class_<PAGComposition, base<PAGLayer>>("_PAGComposition")
      .smart_ptr<std::shared_ptr<PAGComposition>>("_PAGComposition")
      .class_function("_Make", PAGComposition::Make)
      .function("_width", &PAGComposition::width)
      .function("_height", &PAGComposition::height)
      .function("_setContentSize", &PAGComposition::setContentSize)
      .function("_numChildren", &PAGComposition::numChildren)
      .function("_getLayerAt", &PAGComposition::getLayerAt)
      .function("_getLayerIndex", &PAGComposition::getLayerIndex)
      .function("_setLayerIndex", &PAGComposition::setLayerIndex)
      .function("_addLayer", &PAGComposition::addLayer)
      .function("_addLayerAt", &PAGComposition::addLayerAt)
      // @patch
      .function("_attachFile", &PAGComposition::attachFile)
      .function("_contains", &PAGComposition::contains)
      .function("_removeLayer", &PAGComposition::removeLayer)
      .function("_removeLayerAt", &PAGComposition::removeLayerAt)
      .function("_removeAllLayers", &PAGComposition::removeAllLayers)
      .function("_swapLayer", &PAGComposition::swapLayer)
      .function("_swapLayerAt", &PAGComposition::swapLayerAt)
      .function("_audioBytes", optional_override([](PAGComposition& pagComposition) {
                  ByteData* result = pagComposition.audioBytes();
                  if (result->length() == 0) {
                    return val::null();
                  }
                  return val(typed_memory_view(result->length(), result->data()));
                }))
      .function("_audioMarkers", optional_override([](PAGComposition& pagComposition) {
                  std::vector<Marker> result = {};
                  for (auto marker_ptr : pagComposition.audioMarkers()) {
                    Marker marker;
                    marker.startTime = marker_ptr->startTime;
                    marker.duration = marker_ptr->duration;
                    marker.comment = marker_ptr->comment;
                    result.push_back(marker);
                  }
                  return result;
                }))
      .function("_audioStartTime", optional_override([](PAGComposition& pagComposition) {
                  return static_cast<int>(pagComposition.audioStartTime());
                }))
      .function("_getLayersByName", &PAGComposition::getLayersByName)
      .function("_getLayersUnderPoint", &PAGComposition::getLayersUnderPoint);

  class_<PAGFile, base<PAGComposition>>("_PAGFile")
      .smart_ptr<std::shared_ptr<PAGFile>>("_PAGFile")
      .class_function("_MaxSupportedTagLevel", PAGFile::MaxSupportedTagLevel)
      .class_function("_MakeEmpty",
                      optional_override([](int width, int height, int duration) {
                        return PAGFile::MakeEmpty(width, height, static_cast<Frame>(duration));
                      }))
      .class_function("_Load",
                      optional_override([](const val& emscriptenData) -> std::shared_ptr<PAGFile> {
                        auto data = CopyDataFromUint8Array(emscriptenData);
                        if (data == nullptr) {
                          return nullptr;
                        }
                        return PAGFile::Load(data->data(), data->length());
                      }))
      .function("_tagLevel", &PAGFile::tagLevel)
      .function("_numTexts", &PAGFile::numTexts)
      .function("_numImages", &PAGFile::numImages)
      .function("_numVideos", &PAGFile::numVideos)
      .function("_getTextData", &PAGFile::getTextData)
      .function("_replaceText", &PAGFile::replaceText)
      .function("_replaceImage", &PAGFile::replaceImage)
      .function("_getLayersByEditableIndex",
                optional_override([](PAGFile& pagFile, int editableIndex, int layerType) {
                  return pagFile.getLayersByEditableIndex(editableIndex,
                                                          static_cast<LayerType>(layerType));
                }))
      .function(
          "_getEditableIndices", optional_override([](PAGFile& pagFile, int layerType) {
            auto res = val::array();
            for (auto indices : pagFile.getEditableIndices(static_cast<LayerType>(layerType))) {
              res.call<int>("push", indices);
            }
            return res;
          }))
      .function("_timeStretchMode", optional_override([](PAGFile& pagFile) {
                  return static_cast<int>(pagFile.timeStretchMode());
                }))
      .function("_setTimeStretchMode", optional_override([](PAGFile& pagfile, int timeStretchMode) {
                  pagfile.setTimeStretchMode(static_cast<PAGTimeStretchMode>(timeStretchMode));
                }))
      .function("_setDuration", optional_override([](PAGFile& pagFile, int duration) {
                  return pagFile.setDuration(static_cast<int64_t>(duration));
                }))
      .function("_copyOriginal", &PAGFile::copyOriginal);

  class_<PAGSurface>("_PAGSurface")
      .smart_ptr<std::shared_ptr<PAGSurface>>("_PAGSurface")
      .class_function("_FromCanvas", optional_override([](const std::string& canvasID) {
                        return PAGSurface::MakeFrom(GPUDrawable::FromCanvasID(canvasID));
                      }))
      .class_function("_FromTexture",
                      optional_override([](int textureID, int width, int height, bool flipY) {
                        GLTextureInfo glInfo = {};
                        glInfo.target = GL_TEXTURE_2D;
                        glInfo.id = static_cast<unsigned>(textureID);
                        glInfo.format = GL_RGBA8;
                        BackendTexture glTexture(glInfo, width, height);
                        auto origin = flipY ? ImageOrigin::BottomLeft : ImageOrigin::TopLeft;
                        return PAGSurface::MakeFrom(glTexture, origin);
                      }))
      .class_function("_FromRenderTarget",
                      optional_override([](int frameBufferID, int width, int height, bool flipY) {
                        GLFrameBufferInfo glFrameBufferInfo = {};
                        glFrameBufferInfo.id = static_cast<unsigned>(frameBufferID);
                        glFrameBufferInfo.format = GL_RGBA8;
                        BackendRenderTarget glRenderTarget(glFrameBufferInfo, width, height);
                        auto origin = flipY ? ImageOrigin::BottomLeft : ImageOrigin::TopLeft;
                        return PAGSurface::MakeFrom(glRenderTarget, origin);
                      }))
      .function("_width", &PAGSurface::width)
      .function("_height", &PAGSurface::height)
      .function("_updateSize", &PAGSurface::updateSize)
      .function("_clearAll", &PAGSurface::clearAll)
      .function("_freeCache", &PAGSurface::freeCache)
      .function("_readPixels", optional_override([](PAGSurface& pagSurface, int colorType,
                                                    int alphaType, size_t dstRowBytes) -> val {
                  auto dataSize = dstRowBytes * pagSurface.height();
                  if (dataSize == 0) {
                    return val::null();
                  }
                  std::unique_ptr<uint8_t[]> uint8Array(new (std::nothrow) uint8_t[dataSize]);
                  if (uint8Array && pagSurface.readPixels(static_cast<ColorType>(colorType),
                                                          static_cast<AlphaType>(alphaType),
                                                          uint8Array.get(), dstRowBytes)) {
                    auto memory = val::module_property("HEAPU8")["buffer"];
                    auto memoryView =
                        val::global("Uint8Array")
                            .new_(memory, reinterpret_cast<uintptr_t>(uint8Array.get()), dataSize);
                    auto newArrayBuffer = val::global("ArrayBuffer").new_(dataSize);
                    auto newUint8Array = val::global("Uint8Array").new_(newArrayBuffer);
                    newUint8Array.call<void>("set", memoryView);
                    return newUint8Array;
                  }
                  return val::null();
                }));

  class_<PAGImage>("_PAGImage")
      .smart_ptr<std::shared_ptr<PAGImage>>("_PAGImage")
      .class_function("_FromBytes",
                      optional_override([](const val& emscriptenData) -> std::shared_ptr<PAGImage> {
                        auto data = CopyDataFromUint8Array(emscriptenData);
                        if (data == nullptr) {
                          return nullptr;
                        }
                        return PAGImage::FromBytes(reinterpret_cast<void*>(data->data()),
                                                   data->length());
                      }))
      .class_function("_FromNativeImage", optional_override([](val nativeImage) {
                        auto image = tgfx::Image::MakeFrom(nativeImage);
                        return std::static_pointer_cast<PAGImage>(StillImage::MakeFrom(image));
                      }))
      .class_function(
          "_FromPixels",
          optional_override([](const val& pixels, int width, int height, size_t rowBytes,
                               int colorType, int alphaType) -> std::shared_ptr<PAGImage> {
            auto data = CopyDataFromUint8Array(pixels);
            if (data == nullptr) {
              return nullptr;
            }
            return PAGImage::FromPixels(reinterpret_cast<void*>(data->data()), width, height,
                                        rowBytes, static_cast<ColorType>(colorType),
                                        static_cast<AlphaType>(alphaType));
          }))
      .class_function("_FromTexture",
                      optional_override([](int textureID, int width, int height, bool flipY) {
                        GLTextureInfo glInfo = {};
                        glInfo.target = GL_TEXTURE_2D;
                        glInfo.id = static_cast<unsigned>(textureID);
                        glInfo.format = GL_RGBA8;
                        BackendTexture glTexture(glInfo, width, height);
                        auto origin = flipY ? ImageOrigin::BottomLeft : ImageOrigin::TopLeft;
                        return PAGImage::FromTexture(glTexture, origin);
                      }))
      .function("_width", &PAGImage::width)
      .function("_height", &PAGImage::height)
      .function("_scaleMode", optional_override([](PAGImage& pagImage) {
                  return static_cast<int>(pagImage.scaleMode());
                }))
      .function("_setScaleMode", optional_override([](PAGImage& pagImage, int scaleMode) {
                  pagImage.setScaleMode(static_cast<PAGScaleMode>(scaleMode));
                }))
      .function("_matrix", &PAGImage::matrix)
      .function("_setMatrix", &PAGImage::setMatrix);

  class_<PAGPlayer>("_PAGPlayer")
      .smart_ptr_constructor("_PAGPlayer", &std::make_shared<PAGPlayer>)
      .function("_setProgress", &PAGPlayer::setProgress)
      .function("_flush", &PAGPlayer::flush)
      .function("_duration", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.duration());
                }))
      .function("_getProgress", &PAGPlayer::getProgress)
      .function("_currentFrame", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.currentFrame());
                }))
      .function("_videoEnabled", &PAGPlayer::videoEnabled)
      .function("_setVideoEnabled", &PAGPlayer::setVideoEnabled)
      .function("_cacheEnabled", &PAGPlayer::cacheEnabled)
      .function("_setCacheEnabled", &PAGPlayer::setCacheEnabled)
      .function("_cacheScale", &PAGPlayer::cacheScale)
      .function("_setCacheScale", &PAGPlayer::setCacheScale)
      .function("_maxFrameRate", &PAGPlayer::maxFrameRate)
      .function("_setMaxFrameRate", &PAGPlayer::setMaxFrameRate)
      .function("_scaleMode", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.scaleMode());
                }))
      .function("_setScaleMode", optional_override([](PAGPlayer& pagPlayer, int scaleMode) {
                  pagPlayer.setScaleMode(static_cast<PAGScaleMode>(scaleMode));
                }))
      .function("_setSurface", &PAGPlayer::setSurface)
      .function("_getComposition", &PAGPlayer::getComposition)
      .function("_setComposition", &PAGPlayer::setComposition)
      .function("_getSurface", &PAGPlayer::getSurface)
      .function("_matrix", &PAGPlayer::matrix)
      .function("_setMatrix", &PAGPlayer::setMatrix)
      .function("_nextFrame", &PAGPlayer::nextFrame)
      .function("_preFrame", &PAGPlayer::preFrame)
      .function("_autoClear", &PAGPlayer::autoClear)
      .function("_setAutoClear", &PAGPlayer::setAutoClear)
      .function("_getBounds", &PAGPlayer::getBounds)
      .function("_getLayersUnderPoint", &PAGPlayer::getLayersUnderPoint)
      .function("_hitTestPoint", &PAGPlayer::hitTestPoint)
      .function("_renderingTime", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.renderingTime());
                }))
      .function("_imageDecodingTime", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.imageDecodingTime());
                }))
      .function("_presentingTime", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.presentingTime());
                }))
      .function("_graphicsMemory", optional_override([](PAGPlayer& pagPlayer) {
                  return static_cast<int>(pagPlayer.graphicsMemory());
                }))
      .function("_prepare", &PAGPlayer::prepare);

  class_<PAGFont>("_PAGFont")
      .smart_ptr<std::shared_ptr<PAGFont>>("_PAGFont")
      .class_function("_create",
                      optional_override([](std::string fontFamily, std::string fontStyle) {
                        return pag::PAGFont(fontFamily, fontStyle);
                      }))
      .class_function("_SetFallbackFontNames", PAGFont::SetFallbackFontNames)
      .property("fontFamily", &PAGFont::fontFamily)
      .property("fontStyle", &PAGFont::fontStyle);

  class_<Matrix>("_Matrix")
      .class_function("_MakeAll", Matrix::MakeAll)
      .class_function("_MakeScale", optional_override([](float sx, float sy) {
                        return Matrix::MakeScale(sx, sy);
                      }))
      .class_function("_MakeScale",
                      optional_override([](float scale) { return Matrix::MakeScale(scale); }))
      .class_function("_MakeTrans", Matrix::MakeTrans)
      .function("_get", &Matrix::get)
      .function("_set", &Matrix::set)
      .function("_setAll", &Matrix::setAll)
      .function("_setAffine", &Matrix::setAffine)
      .function("_reset", &Matrix::reset)
      .function("_setTranslate", &Matrix::setTranslate)
      .function("_setScale",
                optional_override([](Matrix& matrix, float sx, float sy, float px, float py) {
                  return matrix.setScale(sx, sy, px, py);
                }))
      .function("_setRotate",
                optional_override([](Matrix& matrix, float degrees, float px, float py) {
                  return matrix.setRotate(degrees, px, py);
                }))
      .function("_setSinCos",
                optional_override([](Matrix& matrix, float sinV, float cosV, float px, float py) {
                  return matrix.setSinCos(sinV, cosV, px, py);
                }))
      .function("_setSkew",
                optional_override([](Matrix& matrix, float kx, float ky, float px, float py) {
                  return matrix.setSkew(kx, ky, px, py);
                }))
      .function("_setConcat", &Matrix::setConcat)
      .function("_preTranslate", &Matrix::preTranslate)
      .function("_preScale",
                optional_override([](Matrix& matrix, float sx, float sy, float px, float py) {
                  return matrix.preScale(sx, sy, px, py);
                }))
      .function("_preRotate",
                optional_override([](Matrix& matrix, float degrees, float px, float py) {
                  return matrix.preRotate(degrees, px, py);
                }))
      .function("_preSkew",
                optional_override([](Matrix& matrix, float kx, float ky, float px, float py) {
                  return matrix.preSkew(kx, ky, px, py);
                }))
      .function("_preConcat", &Matrix::preConcat)
      .function("_postTranslate", &Matrix::postTranslate)
      .function("_postScale",
                optional_override([](Matrix& matrix, float sx, float sy, float px, float py) {
                  return matrix.postScale(sx, sy, px, py);
                }))
      .function("_postRotate",
                optional_override([](Matrix& matrix, float degrees, float px, float py) {
                  return matrix.postRotate(degrees, px, py);
                }))
      .function("_postSkew",
                optional_override([](Matrix& matrix, float kx, float ky, float px, float py) {
                  return matrix.postSkew(kx, ky, px, py);
                }))
      .function("_postConcat", &Matrix::postConcat);
  
  class_<TextDocument>("TextDocument")
      .smart_ptr<std::shared_ptr<TextDocument>>("TextDocument")
      .property("applyFill", &TextDocument::applyFill)
      .property("applyStroke", &TextDocument::applyStroke)
      .property("baselineShift", &TextDocument::baselineShift)
      .property("boxText", &TextDocument::boxText)
      .property("boxTextPos", &TextDocument::boxTextPos)
      .property("boxTextSize", &TextDocument::boxTextSize)
      .property("firstBaseLine", &TextDocument::firstBaseLine)
      .property("fauxBold", &TextDocument::fauxBold)
      .property("fauxItalic", &TextDocument::fauxItalic)
      .property("fillColor", &TextDocument::fillColor)
      .property("fontFamily", &TextDocument::fontFamily)
      .property("fontStyle", &TextDocument::fontStyle)
      .property("fontSize", &TextDocument::fontSize)
      .property("strokeColor", &TextDocument::strokeColor)
      .property("strokeOverFill", &TextDocument::strokeOverFill)
      .property("strokeWidth", &TextDocument::strokeWidth)
      .property("text", &TextDocument::text)
      .property("justification", &TextDocument::justification)
      .property("leading", &TextDocument::leading)
      .property("tracking", &TextDocument::tracking)
      .property("backgroundColor", &TextDocument::backgroundColor)
      .property("backgroundAlpha", &TextDocument::backgroundAlpha)
      .property("direction", &TextDocument::direction);

  value_object<Rect>("Rect")
      .field("left", &Rect::left)
      .field("top", &Rect::top)
      .field("right", &Rect::right)
      .field("bottom", &Rect::bottom);

  value_object<Point>("Point").field("x", &Point::x).field("y", &Point::y);
  value_object<Point3D>("Point3D").field("x", &Point3D::x).field("y", &Point3D::y).field("z", &Point3D::z);

  value_object<Color>("Color")
      .field("red", &Color::red)
      .field("green", &Color::green)
      .field("blue", &Color::blue);

  value_object<TextMetrics>("TextMetrics")
      .field("width", &TextMetrics::width)
      .field("actualBoundingBoxLeft", &TextMetrics::actualBoundingBoxLeft)
      .field("actualBoundingBoxRight", &TextMetrics::actualBoundingBoxRight)
      .field("fontBoundingBoxAscent", &TextMetrics::fontBoundingBoxAscent)
      .field("fontBoundingBoxDescent", &TextMetrics::fontBoundingBoxDescent)
      .field("actualBoundingBoxAscent", &TextMetrics::actualBoundingBoxAscent)
      .field("actualBoundingBoxDescent", &TextMetrics::actualBoundingBoxDescent)
      .field("emHeightAscent", &TextMetrics::emHeightAscent)
      .field("emHeightDescent", &TextMetrics::emHeightDescent)
      .field("hangingBaseline", &TextMetrics::hangingBaseline)
      .field("alphabeticBaseline", &TextMetrics::alphabeticBaseline)
      .field("ideographicBaseline", &TextMetrics::ideographicBaseline);

  value_object<Marker>("Marker")
      .field("startTime", optional_override([](const Marker& marker) {
               return static_cast<int>(marker.startTime);
             }),
             optional_override(
                 [](Marker& marker, int value) { marker.startTime = static_cast<int64_t>(value); }))
      .field("duration", optional_override([](const Marker& marker) {
               return static_cast<int>(marker.duration);
             }),
             optional_override(
                 [](Marker& marker, int value) { marker.duration = static_cast<int64_t>(value); }))
      .field("comment", &Marker::comment);

  function("_registerSoftwareDecoderFactory", optional_override([](val factory) {
             static std::unique_ptr<SoftwareDecoderFactory> softwareDecoderFactory = nullptr;
             auto webFactory = WebSoftwareDecoderFactory::Make(factory);
             PAGVideoDecoder::RegisterSoftwareDecoderFactory(webFactory.get());
             softwareDecoderFactory = std::move(webFactory);
           }));

  function("_SDKVersion", &PAG::SDKVersion);

  register_vector<std::shared_ptr<PAGLayer>>("VectorPAGLayer");
  register_vector<Marker>("VectorMarker");
  register_vector<Point>("VectorPoint");

  // Transform3D bindings
  class_<Transform3D>("_Transform3D")
      .smart_ptr_constructor("_Transform3D", &std::make_shared<Transform3D>)
      .function("_getAnchorPoint", optional_override([](Transform3D& t) {
                return t.anchorPoint ? t.anchorPoint->getValueAt(ZeroFrame) : Point3D::Zero();
              }))
      .function("_setAnchorPoint", optional_override([](Transform3D& t, const Point3D& v) {
                if (!t.anchorPoint) t.anchorPoint = new Property<Point3D>();
                t.anchorPoint->value = v;
              }))
      .function("_getPosition", optional_override([](Transform3D& t) {
                if (t.position) return t.position->getValueAt(ZeroFrame);
                Point3D p = Point3D::Zero();
                if (t.xPosition) p.x = t.xPosition->getValueAt(ZeroFrame);
                if (t.yPosition) p.y = t.yPosition->getValueAt(ZeroFrame);
                if (t.zPosition) p.z = t.zPosition->getValueAt(ZeroFrame);
                return p;
              }))
      .function("_setPosition", optional_override([](Transform3D& t, const Point3D& v) {
                if (!t.position) t.position = new Property<Point3D>();
                t.position->value = v;
                if (t.xPosition) { delete t.xPosition; t.xPosition = nullptr; }
                if (t.yPosition) { delete t.yPosition; t.yPosition = nullptr; }
                if (t.zPosition) { delete t.zPosition; t.zPosition = nullptr; }
              }))
      .function("_getXPosition", optional_override([](Transform3D& t) {
                return t.xPosition ? t.xPosition->getValueAt(ZeroFrame) : (t.position ? t.position->getValueAt(ZeroFrame).x : 0.0f);
              }))
      .function("_setXPosition", optional_override([](Transform3D& t, float v) {
                if (t.position) { t.position->value.x = v; return; }
                if (!t.xPosition) t.xPosition = new Property<float>();
                t.xPosition->value = v;
              }))
      .function("_getYPosition", optional_override([](Transform3D& t) {
                return t.yPosition ? t.yPosition->getValueAt(ZeroFrame) : (t.position ? t.position->getValueAt(ZeroFrame).y : 0.0f);
              }))
      .function("_setYPosition", optional_override([](Transform3D& t, float v) {
                if (t.position) { t.position->value.y = v; return; }
                if (!t.yPosition) t.yPosition = new Property<float>();
                t.yPosition->value = v;
              }))
      .function("_getZPosition", optional_override([](Transform3D& t) {
                return t.zPosition ? t.zPosition->getValueAt(ZeroFrame) : (t.position ? t.position->getValueAt(ZeroFrame).z : 0.0f);
              }))
      .function("_setZPosition", optional_override([](Transform3D& t, float v) {
                if (t.position) { t.position->value.z = v; return; }
                if (!t.zPosition) t.zPosition = new Property<float>();
                t.zPosition->value = v;
              }))
      .function("_getScale", optional_override([](Transform3D& t) {
                return t.scale ? t.scale->getValueAt(ZeroFrame) : Point3D::Make(1,1,1);
              }))
      .function("_setScale", optional_override([](Transform3D& t, const Point3D& v) {
                if (!t.scale) t.scale = new Property<Point3D>();
                t.scale->value = v;
              }))
      .function("_getOrientation", optional_override([](Transform3D& t) {
                return t.orientation ? t.orientation->getValueAt(ZeroFrame) : Point3D::Zero();
              }))
      .function("_setOrientation", optional_override([](Transform3D& t, const Point3D& v) {
                if (!t.orientation) t.orientation = new Property<Point3D>();
                t.orientation->value = v;
              }))
      .function("_getXRotation", optional_override([](Transform3D& t) {
                return t.xRotation ? t.xRotation->getValueAt(ZeroFrame) : 0.0f;
              }))
      .function("_setXRotation", optional_override([](Transform3D& t, float v) {
                if (!t.xRotation) t.xRotation = new Property<float>();
                t.xRotation->value = v;
              }))
      .function("_getYRotation", optional_override([](Transform3D& t) {
                return t.yRotation ? t.yRotation->getValueAt(ZeroFrame) : 0.0f;
              }))
      .function("_setYRotation", optional_override([](Transform3D& t, float v) {
                if (!t.yRotation) t.yRotation = new Property<float>();
                t.yRotation->value = v;
              }))
      .function("_getZRotation", optional_override([](Transform3D& t) {
                return t.zRotation ? t.zRotation->getValueAt(ZeroFrame) : 0.0f;
              }))
      .function("_setZRotation", optional_override([](Transform3D& t, float v) {
                if (!t.zRotation) t.zRotation = new Property<float>();
                t.zRotation->value = v;
              }))
      .function("_getOpacity", optional_override([](Transform3D& t) {
                return t.opacity ? static_cast<int>(t.opacity->getValueAt(ZeroFrame)) : static_cast<int>(Opaque);
              }))
      .function("_setOpacity", optional_override([](Transform3D& t, int v) {
                if (!t.opacity) t.opacity = new Property<Opacity>();
                t.opacity->value = static_cast<Opacity>(v);
              }));

  // Lite keyframe bindings
  value_object<KeyframePointLite>("KeyframePointLite")
      .field("startValue", &KeyframePointLite::startValue)
      .field("endValue", &KeyframePointLite::endValue)
      .field("startTime", &KeyframePointLite::startTime)
      .field("endTime", &KeyframePointLite::endTime)
      .field("interpolationType", &KeyframePointLite::interpolationType)
      .field("bezierOut", &KeyframePointLite::bezierOut)
      .field("bezierIn", &KeyframePointLite::bezierIn);

  value_object<KeyframeFloatLite>("KeyframeFloatLite")
      .field("startValue", &KeyframeFloatLite::startValue)
      .field("endValue", &KeyframeFloatLite::endValue)
      .field("startTime", &KeyframeFloatLite::startTime)
      .field("endTime", &KeyframeFloatLite::endTime)
      .field("interpolationType", &KeyframeFloatLite::interpolationType)
      .field("bezierOut", &KeyframeFloatLite::bezierOut)
      .field("bezierIn", &KeyframeFloatLite::bezierIn);

  register_vector<KeyframePointLite>("VectorKeyframePointLite");
  register_vector<KeyframeFloatLite>("VectorKeyframeFloatLite");

  // --- WASM extension: basic Property/Keyframe and Transform2D bindings ---
  class_<Property<float>>("_PropertyFloat")
      .function("_getValue", optional_override([](Property<float>& p) { return p.value; }))
      .function("_setValue", optional_override([](Property<float>& p, float v) { p.value = v; }));

  class_<Property<Point>>("_PropertyPoint")
      .function("_getValue", optional_override([](Property<Point>& p) { return p.value; }))
      .function("_setValue", optional_override([](Property<Point>& p, const Point& v) {
                p.value = v;
              }));

  class_<Property<Opacity>>("_PropertyOpacity")
      .function("_getValue", optional_override([](Property<Opacity>& p) {
                return static_cast<int>(p.value);
              }))
      .function("_setValue", optional_override([](Property<Opacity>& p, int v) {
                p.value = static_cast<Opacity>(v);
              }));

  // Keyframe export omitted to keep bindings minimal and avoid policy instantiation issues.

  class_<AnimatableProperty<float>, base<Property<float>>>("_AnimatablePropertyFloat");
  class_<AnimatableProperty<Point>, base<Property<Point>>>("_AnimatablePropertyPoint");

  class_<Transform2D>("_Transform2D")
      .smart_ptr<std::shared_ptr<Transform2D>>("_Transform2D")
      // anchorPoint
      .function("_getAnchorPoint", optional_override([](Transform2D& t) {
                return t.anchorPoint ? t.anchorPoint->value : Point::Zero();
              }))
      .function("_setAnchorPoint", optional_override([](Transform2D& t, const Point& v) {
                if (!t.anchorPoint) t.anchorPoint = new Property<Point>();
                t.anchorPoint->value = v;
              }))
      // position
      .function("_getPosition", optional_override([](Transform2D& t) {
                if (t.position) return t.position->value;
                Point p = Point::Zero();
                if (t.xPosition) p.x = t.xPosition->value;
                if (t.yPosition) p.y = t.yPosition->value;
                return p;
              }))
      .function("_setPosition", optional_override([](Transform2D& t, const Point& v) {
                if (!t.position) t.position = new Property<Point>();
                t.position->value = v;
                if (t.xPosition) {
                  delete t.xPosition;
                  t.xPosition = nullptr;
                }
                if (t.yPosition) {
                  delete t.yPosition;
                  t.yPosition = nullptr;
                }
              }))
      .function("_getXPosition", optional_override([](Transform2D& t) {
                return t.xPosition ? t.xPosition->value : (t.position ? t.position->value.x : 0.0f);
              }))
      .function("_setXPosition", optional_override([](Transform2D& t, float v) {
                if (t.position) {
                  t.position->value.x = v;
                } else {
                  if (!t.xPosition) t.xPosition = new Property<float>();
                  t.xPosition->value = v;
                }
              }))
      .function("_getYPosition", optional_override([](Transform2D& t) {
                return t.yPosition ? t.yPosition->value : (t.position ? t.position->value.y : 0.0f);
              }))
      .function("_setYPosition", optional_override([](Transform2D& t, float v) {
                if (t.position) {
                  t.position->value.y = v;
                } else {
                  if (!t.yPosition) t.yPosition = new Property<float>();
                  t.yPosition->value = v;
                }
              }))
      // scale
      .function("_getScale", optional_override([](Transform2D& t) {
                return t.scale ? t.scale->value : Point::Make(1, 1);
              }))
      .function("_setScale", optional_override([](Transform2D& t, const Point& v) {
                if (!t.scale) t.scale = new Property<Point>();
                t.scale->value = v;
              }))
      // rotation
      .function("_getRotation", optional_override([](Transform2D& t) {
                return t.rotation ? t.rotation->value : 0.0f;
              }))
      .function("_setRotation", optional_override([](Transform2D& t, float v) {
                if (!t.rotation) t.rotation = new Property<float>();
                t.rotation->value = v;
              }))
      // opacity
      .function("_getOpacity", optional_override([](Transform2D& t) {
                return t.opacity ? static_cast<int>(t.opacity->value) : static_cast<int>(Opaque);
                }))
      .function("_setOpacity", optional_override([](Transform2D& t, int v) {
                if (!t.opacity) t.opacity = new Property<Opacity>();
                t.opacity->value = static_cast<Opacity>(v);
              }))
      // --- Keyframes getters ---
      .function("_getAnchorPointKeyframes",
                optional_override([](Transform2D& t) {
                  auto arr = val::array();
                  if (t.anchorPoint && t.anchorPoint->animatable()) {
                    auto* ap = static_cast<AnimatableProperty<Point>*>(t.anchorPoint);
                    auto res = ToLites(ap->keyframes);
                    for (unsigned i = 0; i < res.size(); ++i) {
                      const auto& lite = res[i];
                      auto o = val::object();
                      o.set("startValue", lite.startValue);
                      o.set("endValue", lite.endValue);
                      o.set("startTime", lite.startTime);
                      o.set("endTime", lite.endTime);
                      o.set("interpolationType", lite.interpolationType);
                      o.set("bezierOut", ToJSPointArray(lite.bezierOut));
                      o.set("bezierIn", ToJSPointArray(lite.bezierIn));
                      arr.call<void>("push", o);
                    }
                  }
                  return arr;
                }))
      .function("_getPositionKeyframes",
                optional_override([](Transform2D& t) {
                  auto arr = val::array();
                  if (t.position && t.position->animatable()) {
                    auto* p = static_cast<AnimatableProperty<Point>*>(t.position);
                    auto res = ToLites(p->keyframes);
                    for (unsigned i = 0; i < res.size(); ++i) {
                      const auto& lite = res[i];
                      auto o = val::object();
                      o.set("startValue", lite.startValue);
                      o.set("endValue", lite.endValue);
                      o.set("startTime", lite.startTime);
                      o.set("endTime", lite.endTime);
                      o.set("interpolationType", lite.interpolationType);
                      o.set("bezierOut", ToJSPointArray(lite.bezierOut));
                      o.set("bezierIn", ToJSPointArray(lite.bezierIn));
                      arr.call<void>("push", o);
                    }
                  }
                  return arr;
                }))
      .function("_getScaleKeyframes",
                optional_override([](Transform2D& t) {
                  auto arr = val::array();
                  if (t.scale && t.scale->animatable()) {
                    auto* p = static_cast<AnimatableProperty<Point>*>(t.scale);
                    auto res = ToLites(p->keyframes);
                    for (unsigned i = 0; i < res.size(); ++i) {
                      const auto& lite = res[i];
                      auto o = val::object();
                      o.set("startValue", lite.startValue);
                      o.set("endValue", lite.endValue);
                      o.set("startTime", lite.startTime);
                      o.set("endTime", lite.endTime);
                      o.set("interpolationType", lite.interpolationType);
                      o.set("bezierOut", ToJSPointArray(lite.bezierOut));
                      o.set("bezierIn", ToJSPointArray(lite.bezierIn));
                      arr.call<void>("push", o);
                    }
                  }
                  return arr;
                }))
      .function("_getRotationKeyframes",
                optional_override([](Transform2D& t) {
                  auto arr = val::array();
                  if (t.rotation && t.rotation->animatable()) {
                    auto* p = static_cast<AnimatableProperty<float>*>(t.rotation);
                    auto res = ToLites(p->keyframes);
                    for (unsigned i = 0; i < res.size(); ++i) {
                      const auto& lite = res[i];
                      auto o = val::object();
                      o.set("startValue", lite.startValue);
                      o.set("endValue", lite.endValue);
                      o.set("startTime", lite.startTime);
                      o.set("endTime", lite.endTime);
                      o.set("interpolationType", lite.interpolationType);
                      o.set("bezierOut", ToJSPointArray(lite.bezierOut));
                      o.set("bezierIn", ToJSPointArray(lite.bezierIn));
                      arr.call<void>("push", o);
                    }
                  }
                  return arr;
                }))
      .function("_getOpacityKeyframes",
                optional_override([](Transform2D& t) {
                  auto arr = val::array();
                  if (t.opacity && t.opacity->animatable()) {
                    auto* p = static_cast<AnimatableProperty<Opacity>*>(t.opacity);
                    for (auto* k : p->keyframes) {
                      auto o = val::object();
                      o.set("startValue", static_cast<float>(k->startValue));
                      o.set("endValue", static_cast<float>(k->endValue));
                      o.set("startTime", static_cast<int>(k->startTime));
                      o.set("endTime", static_cast<int>(k->endTime));
                      o.set("interpolationType", static_cast<int>(k->interpolationType));
                      o.set("bezierOut", ToJSPointArray(k->bezierOut));
                      o.set("bezierIn", ToJSPointArray(k->bezierIn));
                      arr.call<void>("push", o);
                    }
                  }
                  return arr;
                }))
      // --- Keyframes setters ---
      .function("_setAnchorPointKeyframes",
                optional_override([](Transform2D& t, const val& jsList) {
                  auto list = ParseKeyframePointLites(jsList);
                  std::vector<Keyframe<Point>*> keyframes;
                  keyframes.reserve(list.size());
                  for (auto& lite : list) keyframes.push_back(FromLite(lite));
                  ReplaceWithAnimatable<Point>(&t.anchorPoint, keyframes, Point::Zero());
                }))
      .function("_setPositionKeyframes",
                optional_override([](Transform2D& t, const val& jsList) {
                  auto list = ParseKeyframePointLites(jsList);
                  std::vector<Keyframe<Point>*> keyframes;
                  keyframes.reserve(list.size());
                  for (auto& lite : list) keyframes.push_back(FromLite(lite));
                  // Use unified position; clear x/y if present
                  if (t.xPosition) {
                    delete t.xPosition;
                    t.xPosition = nullptr;
                  }
                  if (t.yPosition) {
                    delete t.yPosition;
                    t.yPosition = nullptr;
                  }
                  ReplaceWithAnimatable<Point>(&t.position, keyframes, Point::Zero());
                }))
      .function("_setScaleKeyframes",
                optional_override([](Transform2D& t, const val& jsList) {
                  auto list = ParseKeyframePointLites(jsList);
                  std::vector<Keyframe<Point>*> keyframes;
                  keyframes.reserve(list.size());
                  for (auto& lite : list) keyframes.push_back(FromLite(lite));
                  ReplaceWithAnimatable<Point>(&t.scale, keyframes, Point::Make(1, 1));
                }))
      .function("_setRotationKeyframes",
                optional_override([](Transform2D& t, const val& jsList) {
                  auto list = ParseKeyframeFloatLites(jsList);
                  std::vector<Keyframe<float>*> keyframes;
                  keyframes.reserve(list.size());
                  for (auto& lite : list) keyframes.push_back(FromLite(lite));
                  ReplaceWithAnimatable<float>(&t.rotation, keyframes, 0.0f);
                }))
      .function("_setOpacityKeyframes",
                optional_override([](Transform2D& t, const val& jsList) {
                  auto list = ParseKeyframeFloatLites(jsList);
                  if (list.empty()) {
                    // clear animation
                    Opacity cur = t.opacity ? t.opacity->getValueAt(ZeroFrame) : Opaque;
                    delete t.opacity;
                    t.opacity = new Property<Opacity>(cur);
                    return;
                  }
                  std::vector<Keyframe<Opacity>*> keyframes;
                  keyframes.reserve(list.size());
                  for (auto& lite : list) {
                    auto* k = new SingleEaseKeyframe<Opacity>();
                    auto clamp255 = [](float v) {
                      if (v < 0) v = 0; if (v > 255) v = 255; return static_cast<Opacity>(v);
                    };
                    k->startValue = clamp255(lite.startValue);
                    k->endValue = clamp255(lite.endValue);
                    k->startTime = static_cast<Frame>(lite.startTime);
                    k->endTime = static_cast<Frame>(lite.endTime);
                    k->interpolationType = static_cast<KeyframeInterpolationType>(lite.interpolationType);
                    k->bezierOut = lite.bezierOut;
                    k->bezierIn = lite.bezierIn;
                    keyframes.push_back(k);
                  }
                  delete t.opacity;
                  t.opacity = new AnimatableProperty<Opacity>(keyframes);
                }));

  return true;
}
}  // namespace pag
