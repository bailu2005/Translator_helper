# 日语漫画实时翻译浏览器扩展 · 项目搭建白皮书

- 版本：v0.5
- 日期：2026-11-23
- 状态：0.2.0 可打包发布（P0–P3.5、P4.1、P4.5 已完成；P4.2–P4.4 暂缓）
- 项目路径：`D:\Translator_helper`
- 本文档是项目的唯一事实来源（Single Source of Truth），后续按本文档分阶段搭建。

---

## 1. 项目概述

### 1.1 一句话描述

Chrome/Edge 浏览器扩展：用户手动框选网页中的**日语漫画文字**，在本地 OCR 识别，再翻译成中文，结果显示在**侧边栏**。

项目范围收敛为**日文漫画 → 简体中文**。其它语言/通用文档 OCR 不纳入核心维护范围，留给需要的人通过 Provider 接口自行扩展。

### 1.2 项目目标

- **只聚焦日文漫画**：内容域锁定日文漫画气泡/文字，不追求通用 OCR。
- **图片优先**：主要处理网页中的漫画、图片文字，而非普通可选文本。
- **框选即译**：鼠标框选一个气泡/一段文字，立即识别并翻译。
- **本地处理**：OCR 全程在浏览器本地完成，**不上传图片**，隐私优先。
- **免费可用**：默认使用免费翻译源即可使用；用户可自行扩展词典库或外接大模型。
- **跨浏览器预留**：一期做好 Chrome/Edge（Manifest V3），架构上为 Firefox 等浏览器留出适配层。
- **可维护**：Provider 可插拔、消息协议清晰、Git/CI/发布规范完整。

### 1.3 非目标（一期不做）

- 不做自动气泡检测 / 文字区域检测（用手动框选替代）。
- 不做整页覆盖式实时翻译（DOM 重排/漫画嵌字）。
- 不做移动端。
- 不保证跨域 iframe、WebGL canvas、DRM 内容可读取（作为限制说明）。
- 不做账号体系、云同步。
- 不做其它语言/通用文档 OCR 的官方支持；保留 OCR/翻译 Provider 扩展点，由用户自行实现。

### 1.4 设计原则

1. **隐私优先**：图片与识别结果默认只留在本地。
2. **权限最小化**：能用 `activeTab` / 可选权限就不申请全站权限。
3. **Provider 可插拔**：OCR、翻译、词典均为接口实现，可替换可扩展。
4. **渐进增强**：先跑通「框选 → OCR → 翻译 → 侧边栏」，再叠加高质量引擎与高级功能。
5. **可回退**：任一外部服务不可用时都有本地/免费兜底。

---

## 2. 关键决策记录（ADR）

| ID   | 主题         | 决策                                                           | 状态         |
| ---- | ------------ | -------------------------------------------------------------- | ------------ |
| D-01 | 目标平台     | Chrome/Edge，Manifest V3；架构预留 Firefox                     | 已定         |
| D-02 | 构建框架     | WXT + TypeScript（一套代码生成多浏览器 manifest）              | 已定         |
| D-03 | UI 框架      | React                                                          | 已定         |
| D-04 | 包管理器     | npm（本机 PowerShell 限制，使用 `npm.cmd`）                    | 已定         |
| D-05 | 展示位置     | Chrome 原生 `chrome.sidePanel` 侧边栏                          | 已定         |
| D-06 | 一期 OCR     | Tesseract.js + `jpn_vert`（竖排日语，侧边栏内 Worker）         | 已定         |
| D-07 | 二期 OCR     | manga-ocr 导出 ONNX + WebGPU/ONNX Runtime Web                  | 已定（后续） |
| D-08 | 选区方式     | 手动框选，不做自动气泡检测                                     | 已定         |
| D-09 | 翻译源       | 自动源链：LLM(已配置) → Chrome 内置 → MyMemory；含术语表       | 已定         |
| D-10 | 图片处理     | 本地裁剪 + 本地 OCR，不上传                                    | 已定         |
| D-11 | 仓库位置     | `D:\Translator_helper` 独立 git 仓库                           | 已定         |
| D-12 | 跨浏览器 API | `webextension-polyfill` 的 `browser.*` + 适配层                | 已定         |
| D-13 | 许可证       | MIT                                                            | 已定         |
| D-14 | OCR 引擎     | 本地 manga-ocr 服务优先，Tesseract.js 回退                     | 已定         |
| D-15 | 项目范围     | 只做日文漫画；其它语言/场景通过 Provider 自行扩展              | 已定         |
| D-16 | 学习模式     | 按需生成；词汇+语法；LLM 合并调用；无 LLM 用本地分词；含生词本 | 已定         |
| D-17 | 翻译执行位置 | 侧边栏（文档上下文 + 流式），不走 background                   | 已定         |

---

## 3. 用户场景与交互流程

### 3.1 主流程

1. 用户打开漫画页面。
2. 点击扩展图标（或按快捷键）→ 当前页面进入**框选模式**，出现半透明遮罩。
3. 用户在某句台词的文字区域拖出一个矩形。
4. 扩展定位矩形覆盖的图片元素，裁剪出该区域像素。
5. 本地预处理 + OCR 识别日文（竖排按列排序）。
6. 文本送入翻译 Provider 得到中文。
7. 侧边栏显示：**原图缩略图 + 识别日文 + 中文译文 + 置信度**。
8. 用户可以：复制、重新翻译、切换目标语言、继续框选下一句（保留历史）。

### 3.2 辅助入口

- 快捷键触发框选模式（可配置）。
- 右键菜单「翻译这张图片/此区域」。
- popup：开关、目标语言、快速进入选取模式。
- options：API Key、Provider、术语表导入、OCR 语言。

### 3.3 交互要求

- 遮罩与框选 UI 用 **Shadow DOM** 隔离，避免被网站样式污染。
- 支持连续框选，侧边栏保留本次会话历史。
- 识别/翻译过程显示 loading 与错误提示，可重试。
- 全程不阻塞页面主线程（OCR 在 Worker）。
- **所有按钮必须有点击反馈**：按压动画、禁用态、异步加载态。
- 异步操作结果（成功/失败）必须通过 Toast 或行内提示反馈。
- 删除/清空等破坏性操作需要二次确认；禁用按钮需说明原因。

---

## 4. 总体架构

```text
┌────────────────────────────── 页面 (content script) ──────────────────────────────┐
│  选取遮罩 (Shadow DOM)                                                             │
│     │ 拖框                                                                        │
│     ▼                                                                             │
│  目标定位 / 坐标映射 ──> 像素裁剪(CORS/taint 处理) ──> 预处理                      │
│                                                      │                             │
│                                                      ▼                             │
│                                              OCR Web Worker (Tesseract.js WASM)   │
│                                                      │                             │
│                                            竖排排序 / 假名过滤 / 置信度            │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ chrome.runtime / browser.runtime 消息
                                    ▼
┌──────────────────────── service worker（后台编排）────────────────────────┐
│  消息路由 / 会话状态 / 去抖 / 并发队列 / 缓存                              │
│  TranslationProvider: free | glossary | llm                               │
│  网络请求统一在此发起（规避页面 CSP / CORS）                               │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │ 广播 / port
                                    ▼
┌──────────────────────── 侧边栏 side panel (React) ────────────────────────┐
│  原图缩略图 / 日文原文 / 中文译文 / 置信度 / 历史 / 复制 / 重译           │
└───────────────────────────────────────────────────────────────────────────┘

popup（开关、语言、快捷入口）      options（Provider、Key、术语表）
```

### 4.1 关键约束

- **网络请求放 service worker**：内容脚本直接请求第三方 API 会受页面 CSP 限制，后台统一请求最稳。
- **OCR 放 Worker**：WASM 计算量大，避免阻塞页面 UI；MV3 service worker 无 DOM，不适合跑 OCR。
- **WASM CSP**：`extension_pages` 需包含 `'wasm-unsafe-eval'`。

---

## 5. 图片读取与 OCR 设计（核心）

### 5.1 目标定位与坐标映射

1. 框选结束后，用 `document.elementFromPoint` / `elementsFromPoint` 判断命中元素类型：
   - `<img>`、`background-image`、`<canvas>`、`<video>`、`<picture>`。
2. 计算选区相对元素的 client 坐标，再映射到**自然像素**：
   - 处理 `object-fit`（cover/contain）造成的留白与裁切。
   - 处理 CSS `transform`（scale/rotate）与页面 `devicePixelRatio`。
   - 处理浏览器缩放。
3. 得到原图中的裁剪矩形 `(sx, sy, sw, sh)`。

### 5.2 像素获取策略（按优先级）

| 优先级 | 场景                             | 做法                                                                           |
| ------ | -------------------------------- | ------------------------------------------------------------------------------ |
| 1      | 同源图片 / 允许 CORS             | `canvas.drawImage` 从原图裁剪，分辨率最高                                      |
| 2      | 跨域图片被污染（tainted）        | 后台 `fetch` 原图字节（可选主机权限）+ `createImageBitmap` 裁剪                |
| 3      | `background-image`               | 读 `getComputedStyle().backgroundImage` 解析 URL，按上面策略处理               |
| 4      | 无源（WebGL canvas、部分视频帧） | `chrome.tabs.captureVisibleTab` 截当前视口，**本地**裁剪（只本地处理，不上传） |

> 注意：跨域图片直接 `drawImage` 会污染 canvas，`toDataURL/getImageData` 会抛错；必须走后台 fetch 或截图兜底。

### 5.3 图像预处理

- 放大 2–3 倍（对低分辨率漫画提升明显）。
- 灰度化 + 对比度拉伸。
- 自适应二值化（Otsu）；检测深色背景并自动反色。
- 轻度去噪、纠偏（后续可选）。
- 保留原图缩略图供侧边栏对照。

### 5.4 OCR：本地 manga-ocr 为主，Tesseract 回退

- 主引擎（P2.5）：本地 Python **manga-ocr** HTTP 服务（`ocr-service/`，默认 `http://127.0.0.1:8765`）。模型约 400MB，首次下载后缓存在本地；对竖排/横排、假名、多字体、图上文字、低质量图效果明显更好。
- 回退：服务未启动、模型加载中或请求失败时，自动使用内置 Tesseract.js。
- 运行位置：Tesseract 在**侧边栏（受信任扩展页面）**内创建 Worker，避免 content script 的页面 CSP/CORS 与 `storage.session` 权限限制。
- 语言包与方向：竖排 `jpn_vert` + PSM 5；横排 `jpn` + PSM 6。侧边栏可选择方向与阅读顺序（右→左 / 左→右）。
- 阅读顺序：请求 `blocks` 输出，按行 `bbox` 排序（竖排按列从右到左，横排按行从上到下）。
- 预处理（P2.1）：最长边目标 1200、最高放大 2.5 倍，灰度 + 对比度增强 + 白边；深色背景自动反色。
- 低置信度重试：置信度 < 55 时用 PSM AUTO 再识别一次，取置信度更高者。
- 资源打包：`npm run setup:ocr` 从 npm 依赖复制 worker / core / traineddata 到 `public/tesseract`、`public/tessdata`（不提交仓库），构建时随扩展打包，离线可用。
- CSP：`extension_pages` 已加入 `'wasm-unsafe-eval'`。
- Worker 常驻策略：单例复用；首次加载语言包较慢，之后复用。OCR 请求串行队列，避免方向切换时并发冲突。

### 5.5 竖排阅读顺序与后处理

1. 根据 `bbox` 将识别结果切分为**文字列**。
2. 按 **从右到左**、每列**从上到下**拼接。
3. 过滤低置信度噪声；识别并过滤假名注音（furigana）。
4. 合并成段落，套用术语表。
5. 保留每行原文与译文，侧边栏可逐行对照。

### 5.6 失败与回退

- 置信度过低 → 提示「识别不清，请缩小框选范围」。
- CORS 失败 → 自动切换后台 fetch → 再失败切换视口截图。
- OCR 引擎异常 → 可切换到备用引擎（二期）。

### 5.7 性能目标

- 单个气泡（约 400×600 区域）端到端（OCR+翻译）目标 ≤ 3s（本地缓存命中更快）。
- 并发 OCR 上限默认 1–2，避免卡顿。

---

## 6. 翻译层与学习模式设计（P3）

### 6.1 统一接口

```ts
interface TranslationProvider {
  id: string;
  name: string;
  translate(input: TranslateInput): Promise<TranslateResult>;
}

interface TranslateInput {
  text: string;
  sourceLang: 'ja';
  targetLang: string; // 默认 zh-CN
  context?: { source: string; translation?: string }[];
  glossary?: GlossaryEntry[];
  withLearning?: boolean;
}

interface TranslateResult {
  text: string;
  engine: string;
  durationMs: number;
  learning?: LearningCard;
}

interface LearningCard {
  words: LearningWord[];
  grammar: LearningGrammar[];
}

interface LearningWord {
  surface: string;
  reading: string;
  pos: string;
  meaning: string;
  usage: string;
  example: string;
}

interface LearningGrammar {
  pattern: string;
  meaning: string;
  nuance: string;
  example: string;
}
```

### 6.2 默认翻译源链

`auto` 模式按顺序尝试：

1. **LLM**（已配置时）：质量最好，可带上下文/术语表，并同时返回学习卡
2. **Chrome 内置 Translator API**：免费、本地、隐私好（需实测扩展环境与 ja→zh 语言包）
3. **MyMemory**：免费公共接口兜底

全部失败 → 错误提示 + 重试。也可在设置中固定某个源。

| 方案                        | 定位       | 备注                            |
| --------------------------- | ---------- | ------------------------------- |
| Chrome 内置 Translator API  | 免费默认   | 本地、隐私好；版本/语言包需实测 |
| MyMemory                    | 免费兜底   | 配额小、质量一般                |
| LibreTranslate              | 可选自定义 | 可自建；公共实例多有限流        |
| LLM（OpenAI 兼容 / Ollama） | 质量优先   | 需配置 Key；可带上下文与学习卡  |
| Google 翻译非官方接口       | 不采用     | 违反 ToS、不稳定                |

### 6.3 用户词典 / 术语表

- 导入 CSV / JSON：`source,target`。
- 免费机翻：源词替换成 `[[n]]` 占位 → 翻译 → 换回目标词，保证人名/专有名词不被乱译。
- LLM：术语表直接写入 prompt。
- 存储在 `storage.local`，可导出。
- 已实现（P3.1）：CSV/TSV/JSON 导入、去重、表头跳过、导出 CSV；免费源占位替换；LLM prompt 注入。

### 6.4 外接大模型

- OpenAI 兼容：自定义 `baseURL` / `model` / `apiKey`。
- 本地 Ollama 预设：`http://localhost:11434/v1`。
- 设置页提供「测试连接」。
- Key 仅存本地 `storage.local`（非加密）。
- 上下文：最近 2–3 个气泡的原文/译文。
- 支持流式输出（P3.2）。
- **一次调用同时返回译文 + 学习卡**（JSON）。
- 已实现（P3.2）：流式翻译、上下文、术语表、按需学习卡、结果缓存。

### 6.5 学习模式（P3.2 / P3.3）

目标：翻译的同时学习词汇和句式。

- **按需生成**：默认不自动生成，点击「生成学习卡」才调用。
- **两层能力**：
  1. LLM：词汇（表记/读音/词性/中文释义/用法/例句）+ 语法（句式/含义/语感/例句），与译文一次返回。
  2. 无 LLM：本地 `/tokenize`（fugashi + unidic-lite）返回表记/读音/词性/辞书形/活用形，作为基础学习信息。
- **词汇 + 语法都要**。
- **生词本**：本地收藏、去重、导出；后续可加复习。
- 读音以本地分词为准，LLM 负责释义/用法/例句，减少幻觉。
- 默认展示 3–5 个重点词 + 1–3 个语法点。
- 学习卡按原文 hash 缓存。
- 已实现（P3.2）：LLM 按需生成词汇/语法 JSON，侧边栏折叠展示，支持重新生成。
- 已实现（P3.3）：本地 `/tokenize`（fugashi + unidic-lite）返回表记/读音/词性/辞书形/活用形；无 LLM 时侧边栏显示本地分词基础信息。
- 已实现（P3.4）：生词本（表记/读音/词性/释义/用法/例句/来源句子与译文，按表记+读音去重，支持搜索、删除、导出 CSV/JSON）。
- 已实现（P3.5）：历史记录关联 OCR 原文/译文/学习卡（`storage.local` 的 `historyMeta`，按 `createdAt` 关联）；切换历史项可直接回填译文与学习卡，缩略图显示「译」标记。
- 已实现（P3.5）：统一错误分类（`src/lib/errors.ts`）+ 内联错误面板（原因/建议/重试）+ Toast；空识别、低置信度、服务未启动、LLM 鉴权/限流/超时等均给出可操作提示。
- 已实现（P3.5）：i18n（`src/lib/i18n/`），支持 简体中文 / 繁體中文 / English，设置页可切换，侧边栏、设置页、popup、框选提示与 Toast 均使用字典文案。

### 6.6 执行位置与数据流

- 翻译与学习在**侧边栏**执行：
  - Chrome 内置翻译 API 需要文档上下文
  - LLM 流式输出更直接
  - 扩展已有 `host_permissions: ['<all_urls>']`，可直接请求第三方 API
- 本地分词由 `ocr-service` 的 `/tokenize` 提供
- 不经过 background，避免消息序列化与流式复杂度
- 缓存/设置/术语表/生词本统一 `storage.local`

### 6.7 缓存与限流

- 翻译缓存：`hash(原文 + targetLang + provider + glossaryVersion)`，LRU。
- 学习卡缓存：同样以原文 hash 存储。
- 相同文本不重复请求；免费源限流时优先命中缓存。
- 请求超时、重试、退避。

### 6.8 UI

- OCR 区域下方：「译文（中文）」+ 引擎/耗时。
- 学习区域可折叠：
  - 词汇卡片、语法卡片
  - 「生成学习卡」「加入生词本」「复制」
- 自动翻译开关（默认开）。
- 目标语言默认 `zh-CN`，可选 `zh-TW`。
- 失败提示 + 重试。
- 设置页采用「设置 / 生词本」双标签，内容区独立滚动；侧边栏「生词本」直接打开 `options.html#vocabulary`。
- 生词本：搜索、删除、清空、导出 CSV/JSON。
- 所有按钮遵循「UI 反馈规范」：按压动画、加载态、Toast/行内结果反馈、破坏性操作确认。

---

## 7. 模块划分与消息协议

### 7.1 模块

```text
src/
  entrypoints/
    background/         service worker：消息路由、Provider、缓存
    content/            选取遮罩、目标定位、裁剪、预处理、OCR Worker 管理
    sidepanel/          React UI
    popup/              开关 / 语言 / 快捷入口
    options/            Provider / API Key / 术语表
  lib/
    ocr/                OcrProvider 接口、tesseract 实现、manga-ocr(二期)
    translate/          TranslationProvider：free / glossary / llm
    extract/            坐标映射、CORS/taint 处理、预处理
    messaging/          消息类型与收发封装
    storage/            设置、缓存、术语表
    i18n/               多语言
  components/           共享 UI 组件
public/                 图标、OCR 语言包等静态资源
docs/                  项目文档（含本白皮书）
```

### 7.2 消息协议（草案）

| 消息                | 方向                         | 说明                                   |
| ------------------- | ---------------------------- | -------------------------------------- |
| `START_SELECTION`   | background → content         | 进入框选模式                           |
| `REGION_SELECTED`   | content → background         | 携带裁剪图 `Blob`/`ImageBitmap` 元数据 |
| `OCR_RESULT`        | content → background         | 日文文本、bbox、置信度                 |
| `TRANSLATE_REQUEST` | background → provider        | 文本 + 上下文 + 语言                   |
| `TRANSLATE_RESULT`  | background → sidepanel       | 原文/译文/引擎/耗时                    |
| `SETTINGS_CHANGED`  | options → background/content | 设置变更广播                           |
| `HISTORY_UPDATED`   | background → sidepanel       | 会话历史更新                           |

> 大对象（图片 Blob）优先用 `structuredClone` 支持的消息传递或 `OffscreenCanvas` 在内容脚本内处理完再传文本，避免大块数据反复跨进程。

---

## 8. Manifest / 权限 / CSP / 跨浏览器

### 8.1 权限（最小化）

| 权限                        | 用途                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `sidePanel`                 | 侧边栏                                                               |
| `storage`                   | 设置、缓存、术语表                                                   |
| `activeTab`                 | 用户触发时访问当前页                                                 |
| `scripting`                 | 动态注入内容脚本                                                     |
| `contextMenus`              | 右键入口                                                             |
| `offscreen`（可能需要）     | 特定后台处理                                                         |
| `host_permissions`          | 拉取跨域图片原始字节、`captureVisibleTab` 截图兜底、按需注入内容脚本 |
| `optional_host_permissions` | 预留：后续可改为按站点申请                                           |

- 当前已申请 `host_permissions: ['<all_urls>']`：跨域漫画 CDN 图片会污染 canvas，需要后台 fetch 原图或截图兜底；内容脚本本身已覆盖全站。后续可评估改为可选权限。
- `<all_urls>` 同时覆盖 `http://127.0.0.1:8765` 本地 OCR 服务；服务端已配置 CORS 与 Private Network Access，侧边栏可直接请求。

### 8.2 CSP

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

### 8.3 跨浏览器预留

- 统一使用 `webextension-polyfill` 的 `browser.*`。
- 侧边栏封装：Chrome `sidePanel` / Firefox `sidebar_action`；已实现 `src/lib/platform/sidepanel.ts`。
- 脚本注入封装：Chrome `scripting.executeScript` / Firefox `tabs.executeScript`；已实现 `src/lib/platform/inject.ts`。
- manifest 差异由 WXT 按目标浏览器生成（P4.1）：Firefox 移除 `sidePanel`/`scripting` 权限，加入 `browser_specific_settings.gecko`（ID、`data_collection_permissions`）。
- 业务代码不直接依赖 `chrome.*`，差异集中在 `lib/platform/`。
- Firefox 使用 MV2 构建，`side_panel` 由 WXT 映射为 `sidebar_action`；翻译源不含 Chrome 内置 API。

---

## 9. Git / GitHub / CI / 发布

### 9.1 仓库

- 位置：`D:\Translator_helper`（独立仓库，不与其它项目嵌套）。
- 分支：`main` 为主干；功能分支 `feat/<name>`，短生命周期，完成后合并。
- 提交规范：Conventional Commits（`feat:`, `fix:`, `docs:`, `chore:` …）。
- 钩子：husky + lint-staged（提交前 lint/format）。
- 必须文件：`.gitignore`、`.gitattributes`（`* text=auto`，统一 LF）、`README.md`、`LICENSE`、`CONTRIBUTING.md`。
- 忽略：`node_modules/`、`dist/`、`.output/`、`.env`、模型缓存、测试产物。
- 密钥：API Key 只存浏览器存储；开发用 `.env`（已忽略）；CI 用 GitHub Secrets。
- 模型/大文件：不入库，放 Release 资产或首次运行下载；必要时 Git LFS。

### 9.2 CI（GitHub Actions）

- `ci.yml`：install → lint → typecheck → test → build（chrome + firefox）。
- `release.yml`：打 `v*` tag 时构建 zip 并创建 GitHub Release。
- 后续可接 Chrome Web Store / Edge Add-ons 自动发布。

### 9.3 远程仓库

- GitHub 账号：`bailu2005`
- 仓库名：`Translator_helper`
- 远程地址：`https://github.com/bailu2005/Translator_helper.git`
- 本地仓库已 `git init -b main`，首次提交完成，`origin` 已设置。
- 待办：在 GitHub 创建空仓库（不要勾选 README/gitignore/license）→ 完成 HTTPS 认证 → 首次推送。
- 认证：Git Credential Manager 浏览器登录，或使用 PAT。
- 环境注意：
  - 本机 SSH 22 端口被网络拒绝，仅可走 HTTPS。
  - 网络经 SteamTools TLS 代理，git 默认不信任其根证书；已生成组合 CA 包
    `C:/Users/Administrator/.git-certs/ca-bundle-steamtools.pem` 并写入本仓库
    `http.sslBackend=openssl`、`http.sslCAInfo` 配置（未关闭证书校验）。

---

## 10. 测试策略

- 单元测试（Vitest）：坐标映射、竖排排序、假名过滤、术语表替换、缓存逻辑。
- OCR 测试：固定图片 fixture，对识别结果做容差断言（不要求逐字完全一致）。
- E2E（Playwright）：加载扩展、打开测试页、模拟框选、校验侧边栏结果。
- 只对纯逻辑做严格断言；OCR/翻译外部依赖用 mock/fixture。

---

## 11. 路线图与验收标准

### P0 项目骨架

- WXT + TS + React 工程可构建，Chrome 可加载。
- 侧边栏按钮可打开空面板；popup/options 路由就位。
- Git、lint、format、CI 跑通。

**验收**：`npm.cmd run build` 成功；扩展可加载；CI 绿灯。

### P1 框选与图片裁剪

- 进入框选模式、拖框绘制遮罩。
- 命中 `<img>` / `background-image`，正确映射自然像素。
- 裁剪结果可在侧边栏预览（不含 OCR）。

**验收**：在测试页对指定图片区域裁剪，输出尺寸/位置正确。

### P2 OCR 接入

- Tesseract.js `jpn_vert` 在侧边栏内的 Worker 运行。
- 自动识别当前选区，显示进度、日文文本与置信度，支持重新识别 / 复制。
- P2.1：方向（竖排/横排）+ 阅读顺序（右→左/左→右）选择、图像预处理、低置信度重试。
- P2.5：本地 manga-ocr 服务（主引擎）+ Tesseract 自动回退；服务端位于 `ocr-service/`，模型本地缓存。

**验收**：对固定漫画 fixture，识别结果达到约定准确率阈值。

### P3 翻译与学习

- **P3.0**：`TranslationProvider` 接口 + 自动源链（LLM → Chrome 内置 → MyMemory）+ 侧边栏译文 + 缓存 + 自动翻译。
- **P3.1**：术语表导入与占位替换。
- **P3.2**：LLM（OpenAI 兼容 / Ollama）+ 上下文 + 流式 + 一次返回译文 + 学习卡。
- **P3.3**：本地 `/tokenize`（fugashi + unidic-lite）+ 无 LLM 时的基础学习信息。
- **P3.4**：✅ 学习卡 UI + 生词本（增删、去重、导出 CSV/JSON）。
- **P3.5**：✅ 历史关联译文/学习卡、错误分类与内联重试、i18n（简中/繁中/英文）。

**验收**：框选气泡 → 译文出现；点击「生成学习卡」得到词汇/语法；无 LLM 时仍显示读音/词性/辞书形；生词本可增删导出。

### P4 增强

- **P4.1**：✅ Firefox 适配（MV2 + `sidebar_action`、平台 API 抽象、扩展 ID/数据声明）。
- **P4.2**：暂缓——自动气泡检测 + 多气泡批量 OCR/翻译。
- **P4.3**：暂缓——GPU / DirectML 推理（设备自动检测与 `/health` 上报）。
- **P4.4**：暂缓——manga-ocr ONNX/WebGPU 作为浏览器内高质量 OCR 选项。
- **P4.5**：✅ 发布准备（0.2.0、隐私政策、GitHub Pages 文档、zip、`v*` tag Release；暂不上架商店）。

---

## 12. 风险与对策

| 风险                              | 影响            | 对策                                           |
| --------------------------------- | --------------- | ---------------------------------------------- |
| 跨域图片污染 canvas               | 无法裁剪        | 后台 fetch + 可选权限；截图本地兜底            |
| Tesseract 对漫画竖排/手写体识别差 | 译文质量低      | 预处理增强；二期换 manga-ocr；提示用户缩小框选 |
| 假名注音混入                      | 译文噪声        | 注音检测过滤 + 置信度阈值                      |
| 免费翻译源不稳定/质量差           | 体验差          | 多源兜底；引导配置 LLM                         |
| MV3 Service Worker 生命周期       | 状态丢失        | 状态持久化 + 消息重建                          |
| WASM/模型体积大                   | 商店审核/加载慢 | 懒加载、缓存、按需下载                         |
| 权限过大被商店拒绝                | 上架失败        | 可选权限、最小化申请、隐私说明                 |
| 外部 API 政策/ToS                 | 合规风险        | 不用非官方 Google 接口；明确来源               |

---

## 13. 待确认问题（Open Questions）

1. **GitHub 仓库**：已完成（`bailu2005/Translator_helper`，main 分支）。
2. **构建框架**：已确定为 WXT + TypeScript。
3. **UI 框架**：已确定为 React。
4. **项目/扩展名称**：暂定 `Translator Helper` / 中文名待定。
5. **许可证**：已确定为 MIT。
6. **免费翻译源**：P3 决定（Chrome 内置 API 实测 / LibreTranslate / MyMemory / 平台 Key）。
7. **OCR 资源分发**：已确定；Tesseract 资源随扩展打包，manga-ocr 模型由本地服务下载缓存。
8. **是否一期就支持**：PDF 内图片、跨域 iframe、自动气泡检测、朗读 TTS？（仍待定；自动气泡检测列为 P4）
9. **目标浏览器优先级**：一期 Chrome/Edge；Firefox 适配列为 P4。
10. **Node 版本策略**：本地 Node 24，CI 固定 Node 22。

---

## 14. 变更记录

| 版本 | 日期       | 变更                                                                                           |
| ---- | ---------- | ---------------------------------------------------------------------------------------------- |
| v0.1 | 2026-11-07 | 初始白皮书：确立图片优先、本地 OCR、日语漫画、侧边栏、Git 规划                                 |
| v0.2 | 2026-11-17 | 范围收敛为日文漫画；P0–P2.5 完成；OCR 改为本地 manga-ocr 主引擎 + Tesseract 回退；新增工程日志 |
| v0.3 | 2026-11-23 | P3.0–P3.5 完成：翻译/学习/生词本/历史关联/错误体验/i18n                                        |
| v0.4 | 2026-11-23 | P4.1 完成：Firefox 适配、平台 API 抽象、Firefox manifest                                       |
| v0.5 | 2026-11-23 | P4.5 完成：0.2.0、隐私政策、zip/Release CI；P4.2–P4.4 暂缓                                     |
