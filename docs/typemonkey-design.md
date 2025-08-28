# TypeMonkey 风格动效（Web）设计与 API

本设计在 libpag Web SDK（wasm）之上提供一层极薄的 Builder 封装，帮助以纯代码方式生成接近 TypeMonkey 的文本/图片动效。目标：

- 在 Web 中初始化 wasm、创建 `PAGSurface`、`PAGPlayer`、`PAGComposition`。
- 以编码方式向 Composition 构建 Display List：文本、图片、容器（子合成）。
- 查询尺寸：Layer 的局部/全局尺寸，文本 Box 宽高。
- 设置属性：图片数据、文本字体/颜色/字号/样式等，基础变换与透明度。
- 提供滤镜接口占位符（受 libpag 运行时能力所限，详见“滤镜支持”）。

下文所示 API 在 `web/src/typemonkey.ts` 中实现，使用时仅依赖已暴露的 libpag Web 类与 wasm 绑定。

## 初始化与核心对象

```ts
import initPAG from 'libpag'; // 或你的 wasm 初始化函数
import { setPAGModule } from './web/src/pag-module';
import { TMProject } from './web/src/typemonkey';

// 1) 初始化 wasm 模块，并绑定到 libpag 的 JS 封装
const PAG = await initPAG();
setPAGModule(PAG);

// 2) 创建 Canvas 与工程
const canvas = document.getElementById('pag-canvas') as HTMLCanvasElement;
const project = await TMProject.create({
  canvas,
  width: 1080,
  height: 1920,
});

// 拿到基础对象（可选）
const { surface, player, root } = project.context();
```

## 本地运行 Demo（HTML + JS）

- 构建（需要本机已配置 Emscripten 以编译 wasm）：
  - cd web
  - npm install
  - npm run build:debug
- 本地起服务：
  - npm run server  # 或任意静态服务器
- 打开页面：
  - http://localhost:8080/demo/typemonkey.html


说明：
- `TMProject.create()` 封装了 `PAGSurface.fromCanvas()`、`PAGPlayer.create()`、`PAGComposition.make()` 并完成关联。
- 你也可绕过 `TMProject` 直接使用 libpag 官方 API，本封装仅作为 TypeMonkey 风格代码生成的便捷入口。

## 向 Composition 添加元素

### 文本层（支持 Box 文本自动换行）

```ts
// 以 Box 文本创建（autoWrap + 指定 width 即启用段落文本并自动换行）
const text1 = project.addText({
  text: 'Hello TypeMonkey',
  startMs: 0,
  durationMs: 1500,
  fontFamily: 'Helvetica',
  fontStyle: 'Regular',
  fontSize: 160,
  fillColor: '#ffffff',
  justification: 'Center', // Left | Center | Right | Justify
  leading: 0,               // 0 表示 auto（= fontSize * 1.2）
  tracking: 0,
  autoWrap: true,
  x: 0, y: 0,
  width: 900,               // 指定宽度后自动换行
  height: 400,
});

// 普通点文本（不自动换行）
const text2 = project.addText({ text: 'Short', startMs: 600, durationMs: 1200, fontSize: 120 });

// 更新样式/内容
text1.setText('New Content');
text1.setFillColor('#00C2FF');
text1.setFont({ family: 'Arial', style: 'Bold' });
text1.setFontSize(180);
```

实现细节：
- 通过 wasm 绑定直接创建 `TextDocument`，设置 `boxText/boxTextPos/boxTextSize` 实现 Box 文本。
- 通过 `PAGTextLayer.make(duration, textDocument)` 或 `PAGTextLayer.make(duration, text, fontSize, ...)` 创建图层。
- Builder 内会缓存 `TextDocument` 引用，便于后续读取/更新 Box 尺寸。

### 图片层

```ts
const img = await PAGImage.fromFile(fileInput.files[0]);

const imageLayer = project.addImage({
  startMs: 0,
  durationMs: 2000,
  width: img.width(),
  height: img.height(),
  image: img, // 或者传 TexImageSource，由内部转换
});

// 替换图片、设置矩阵或透明度
imageLayer.setImage(img);
imageLayer.setAlpha(0.8);
imageLayer.translate(200, 100).scale(0.8).rotate(-5);
```

实现细节：
- 使用 `PAGImageLayer.make(width, height, duration)` + `setImage()`。
- 若传入 `TexImageSource`，通过 `PAGImage.fromSource()` 转为 `PAGImage`。

### 容器/子合成

```ts
const group = project.addGroup({ width: 1080, height: 400, startMs: 0, durationMs: 1800 });
group.add(text2.layer); // 将已有图层移入容器
group.setStartMs(300);
```

实现细节：
- 子合成本质是一个新的 `PAGComposition.make(w, h)`，加入根合成后作为容器使用。
- 可通过 `addLayer()` 将其它 layer 移入（libpag 会自动从原父层移除并挂到新父层）。

## 尺寸测量

```ts
// 局部边框（未乘以矩阵）
const localRect = project.getLocalBounds(text1.layer); // { left, top, right, bottom }

// 全局边框（映射到 Surface 像素坐标）
const globalRect = project.getGlobalBounds(text1.layer);

// 文本 Box 尺寸（仅对以 autoWrap 创建的文本层可用）
const box = text1.getBoxSize(); // { width, height }
```

说明：
- `getLocalBounds()` 调用 `PAGLayer.getBounds()`；`getGlobalBounds()` 调用 `PAGPlayer.getBounds(layer)`。
- Box 宽高来自创建时的 `TextDocument.boxTextSize`，由 Builder 内部缓存并返回。

## 属性控制（变换、透明度、文本/图片属性）

```ts
// 变换与透明度（所有 Layer 适用）
text1.translate(100, 0).rotate(8).scale(1.1);
text1.setAlpha(1.0);

// 文本样式（文本层）
text1.setText('New content');
text1.setFont({ family: 'Arial', style: 'Italic' });
text1.setFontSize(140);
text1.setFillColor('#FF3366');
text1.setStroke({ color: '#000000', width: 2 });
text1.setSpacing({ leading: 0, tracking: 50 });
text1.setJustification('Center');

// 图片（图片层）
imageLayer.setImage(img); // 重新设图
```

## 播放控制与渲染

```ts
await project.prepare(); // 预热首帧

function loop(ts: number) {
  project.seekMs(ts % project.durationMs());
  project.flush();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

## 滤镜支持（高斯模糊、运动模糊）

- 运动模糊：需在 AE 模板中为目标层开启 Motion Blur 并导出，运行时根据变换自动生效。暂不支持代码即时为任意层开启/关闭。
- 高斯模糊：当前 libpag 运行时未提供公共 API 向任意层动态添加/调节 Fast Blur。如果必须在 Web 端动态模糊：
  - 全局后处理：将渲染结果拷贝到 2D Canvas，使用 `canvasContext.filter='blur(px)'` 再绘制（作用于整帧）。
  - 图片层：在业务侧对图片做模糊后再 `setImage()` 替换（可渐进切换模糊强度）。
  - 文本层：用“带模糊的副本 + 透明度切换”的方式模拟。

`TMProject` 暂提供 `setGlobalBlur(px)` 的占位接口（不分层、依赖 2D 路径），默认 no-op 并给出警告。

## 需要修改/扩展的代码（若要完整支持“运行时滤镜与文本盒尺寸修改”）

以下为建议改动列表，便于未来增强：

- 运行时添加/调整 Fast Blur（高斯模糊）：
  - C++：在 `include/pag/pag.h` 的 `PAGLayer` 增加公开接口（示例）：
    - `void addFastBlur(float blurriness, BlurDimensionsDirection dir);`
    - `void removeAllEffects();`
  - C++：在 `src/rendering/*` 内对 `layer->effects` 进行增删，触发 `notifyModified(true)`，并在平台绑定层（`src/platform/web/PAGWasmBindings.cpp`）暴露到 wasm。
  - Web：在 `web/src/pag-layer.ts` 新增对应 TS 封装方法。

- 运行时切换 Motion Blur：
  - C++：为 `PAGLayer` 暴露 `setMotionBlur(bool)`，内部修改 `layer->motionBlur` 并触发重建缓存。
  - 绑定与 TS 封装同上。

- 文本 Box 设置（用于“模板已有文本层”的宽度调整）：
  - C++：扩展 `PAGTextLayer::replaceTextInternal()`，加入对 `boxText/boxTextPos/boxTextSize/firstBaseLine/direction` 的复制；
  - 或为 `PAGTextLayer` 增加 `setBoxText(bool)`、`setBoxTextRect(x, y, w, h)` 等公开方法；
  - Web wasm 绑定与 TS 封装同上。

在以上改动未合入之前，本 Builder 仍可通过“新建文本层 + Box 文本方式”实现自动换行与宽度控制。
