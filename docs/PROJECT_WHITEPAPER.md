# 日语漫画实时翻译浏览器扩展 · 项目搭建白皮书

- 版本：v0.1
- 日期：2026-11-07
- 状态：规划中（待确认项见第 13 章）
- 项目路径：`D:\Translator_helper`
- 本文档是项目的唯一事实来源（Single Source of Truth），后续按本文档分阶段搭建。

---

## 1. 项目概述

### 1.1 一句话描述

Chrome/Edge 浏览器扩展：用户手动框选网页中的**日语图片 / 漫画文字**，在浏览器**本地 OCR** 识别，再翻译成中文，结果显示在**侧边栏**。

### 1.2 项目目标

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

### 1.4 设计原则

1. **隐私优先**：图片与识别结果默认只留在本地。
2. **权限最小化**：能用 `activeTab` / 可选权限就不申请全站权限。
3. **Provider 可插拔**：OCR、翻译、词典均为接口实现，可替换可扩展。
4. **渐进增强**：先跑通「框选 → OCR → 翻译 → 侧边栏」，再叠加高质量引擎与高级功能。
5. **可回退**：任一外部服务不可用时都有本地/免费兜底。

---

## 2. 关键决策记录（ADR）

| ID | 主题 | 决策 | 状态 |
|---|---|---|---|
| D-01 | 目标平台 | Chrome/Edge，Manifest V3；架构预留 Firefox | 已定 |
| D-02 | 构建框架 | WXT + TypeScript（一套代码生成多浏览器 manifest） | 待确认 |
| D-03 | UI 框架 | React | 待确认 |
| D-04 | 包管理器 | npm（本机 PowerShell 限制，使用 `npm.cmd`） | 已定 |
| D-05 | 展示位置 | Chrome 原生 `chrome.sidePanel` 侧边栏 | 已定 |
| D-06 | 一期 OCR | Tesseract.js + `jpn_vert`（竖排日语） | 已定 |
| D-07 | 二期 OCR | manga-ocr 导出 ONNX + WebGPU/ONNX Runtime Web | 已定（后续） |
| D-08 | 选区方式 | 手动框选，不做自动气泡检测 | 已定 |
| D-09 | 翻译源 | 默认免费源；可选术语表/离线词典/LLM | 已定（具体源待确认） |
| D-10 | 图片处理 | 本地裁剪 + 本地 OCR，不上传 | 已定 |
| D-11 | 仓库位置 | `D:\Translator_helper` 独立 git 仓库 | 已定 |
| D-12 | 跨浏览器 API | `webextension-polyfill` 的 `browser.*` + 适配层 | 已定 |
| D-13 | 许可证 | 待定 | 待确认 |

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

| 优先级 | 场景 | 做法 |
|---|---|---|
| 1 | 同源图片 / 允许 CORS | `canvas.drawImage` 从原图裁剪，分辨率最高 |
| 2 | 跨域图片被污染（tainted） | 后台 `fetch` 原图字节（可选主机权限）+ `createImageBitmap` 裁剪 |
| 3 | `background-image` | 读 `getComputedStyle().backgroundImage` 解析 URL，按上面策略处理 |
| 4 | 无源（WebGL canvas、部分视频帧） | `chrome.tabs.captureVisibleTab` 截当前视口，**本地**裁剪（只本地处理，不上传） |

> 注意：跨域图片直接 `drawImage` 会污染 canvas，`toDataURL/getImageData` 会抛错；必须走后台 fetch 或截图兜底。

### 5.3 图像预处理

- 放大 2–3 倍（对低分辨率漫画提升明显）。
- 灰度化 + 对比度拉伸。
- 自适应二值化（Otsu）；检测深色背景并自动反色。
- 轻度去噪、纠偏（后续可选）。
- 保留原图缩略图供侧边栏对照。

### 5.4 一期 OCR：Tesseract.js + 竖排日语

- 语言包：`jpn_vert`（竖排），必要时叠加 `jpn`。
- 参数：`tessedit_pageseg_mode = 5`（单一竖排文本块），`user_defined_dpi = 300`。
- 语言包策略（待确认）：打包进扩展（离线可用但体积增大）或首次运行下载并缓存到 IndexedDB/Cache。
- 输出：文本 + 行/词级 `bbox` + `confidence`。
- Worker 常驻策略：按需创建、闲置回收。

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

## 6. 翻译层设计

### 6.1 统一接口

```ts
interface TranslationProvider {
  id: string;
  name: string;
  translate(input: TranslateInput): Promise<TranslateResult>;
}

interface TranslateInput {
  text: string;
  sourceLang?: string;   // 默认 auto / ja
  targetLang: string;    // 默认 zh-CN
  context?: string;      // 相邻气泡上下文
  glossary?: GlossaryEntry[];
}
```

### 6.2 免费翻译源（待最终选定）

| 方案 | 优点 | 缺点 |
|---|---|---|
| Chrome 内置 Translator API | 本地、免费、隐私好 | 版本/扩展环境可用性需实测，语言对有限 |
| LibreTranslate | 开源，可自建，免费 | 公共实例限流、质量一般 |
| MyMemory | 免费配额，接入简单 | 配额小、质量一般 |
| 有道/百度/腾讯翻译开放平台 | 质量较好 | 需注册 Key，有额度限制 |
| Google 翻译非官方接口 | 质量好 | 违反 ToS、不稳定，**不采用** |

> 一期建议：以「Chrome 内置 API（可用时）+ 免费公共接口兜底」实现 `free` Provider，并在 UI 中说明质量限制。漫画对话对上下文敏感，正式质量建议用户配置 LLM。

### 6.3 用户词典 / 术语表

- 支持导入 CSV / JSON / TMX。
- 用途：专有名词、人名、拟声词的强制译法，翻译前替换、翻译后校正。
- 可选离线词典（如 ECDICT）做词级查询（后续）。
- 存储在 `chrome.storage.local`，可导出。

### 6.4 外接大模型

- 协议：OpenAI 兼容（自定义 `baseURL` / `model` / `apiKey`）。
- 能力：传入前后气泡作为上下文、携带术语表、支持流式输出。
- Key 仅存本地 `chrome.storage`，绝不入库。

### 6.5 缓存与限流

- 文本哈希作为 key 的 LRU + 持久缓存（`chrome.storage.local` / IndexedDB）。
- 相同文本不重复请求。
- 请求去抖、并发上限、失败重试与退避。

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

| 消息 | 方向 | 说明 |
|---|---|---|
| `START_SELECTION` | background → content | 进入框选模式 |
| `REGION_SELECTED` | content → background | 携带裁剪图 `Blob`/`ImageBitmap` 元数据 |
| `OCR_RESULT` | content → background | 日文文本、bbox、置信度 |
| `TRANSLATE_REQUEST` | background → provider | 文本 + 上下文 + 语言 |
| `TRANSLATE_RESULT` | background → sidepanel | 原文/译文/引擎/耗时 |
| `SETTINGS_CHANGED` | options → background/content | 设置变更广播 |
| `HISTORY_UPDATED` | background → sidepanel | 会话历史更新 |

> 大对象（图片 Blob）优先用 `structuredClone` 支持的消息传递或 `OffscreenCanvas` 在内容脚本内处理完再传文本，避免大块数据反复跨进程。

---

## 8. Manifest / 权限 / CSP / 跨浏览器

### 8.1 权限（最小化）

| 权限 | 用途 |
|---|---|
| `sidePanel` | 侧边栏 |
| `storage` | 设置、缓存、术语表 |
| `activeTab` | 用户触发时访问当前页 |
| `scripting` | 动态注入内容脚本 |
| `contextMenus` | 右键入口 |
| `offscreen`（可能需要） | 特定后台处理 |
| `optional_host_permissions` | 按站点申请跨域图片 fetch 与翻译 API |

- 尽量不申请 `<all_urls>`；跨域图片/翻译 API 用**可选权限**按需申请。

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
- 侧边栏封装：Chrome `sidePanel` / Firefox `sidebar_action`。
- manifest 差异由 WXT 按目标浏览器生成。
- 业务代码不直接依赖 `chrome.*`，差异集中在 `lib/platform/`。

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

- Tesseract.js `jpn_vert` 在 Worker 运行。
- 竖排排序 + 假名过滤，输出日文文本与置信度。

**验收**：对固定漫画 fixture，识别结果达到约定准确率阈值。

### P3 翻译与侧边栏

- `free` Provider 接入 + 缓存。
- 侧边栏展示原图/日文/中文/置信度，支持复制、重译、历史。

**验收**：框选一个气泡，端到端 3s 内出译文。

### P4 增强

- 术语表导入、LLM Provider（流式）、快捷键、右键菜单、i18n。
- manga-ocr ONNX/WebGPU 作为高质量 OCR 选项。
- Firefox 构建验证。

---

## 12. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 跨域图片污染 canvas | 无法裁剪 | 后台 fetch + 可选权限；截图本地兜底 |
| Tesseract 对漫画竖排/手写体识别差 | 译文质量低 | 预处理增强；二期换 manga-ocr；提示用户缩小框选 |
| 假名注音混入 | 译文噪声 | 注音检测过滤 + 置信度阈值 |
| 免费翻译源不稳定/质量差 | 体验差 | 多源兜底；引导配置 LLM |
| MV3 Service Worker 生命周期 | 状态丢失 | 状态持久化 + 消息重建 |
| WASM/模型体积大 | 商店审核/加载慢 | 懒加载、缓存、按需下载 |
| 权限过大被商店拒绝 | 上架失败 | 可选权限、最小化申请、隐私说明 |
| 外部 API 政策/ToS | 合规风险 | 不用非官方 Google 接口；明确来源 |

---

## 13. 待确认问题（Open Questions）

1. **GitHub 仓库**：账号已确认 `bailu2005`；待确认仓库可见性（公开/私有）与首次推送认证方式（GCM 浏览器登录 / PAT）。
2. **构建框架**：确认用 WXT？（备选：Vite + `@crxjs/vite-plugin`、Plasmo）
3. **UI 框架**：确认用 React？（备选：Svelte、Vue）
4. **项目/扩展名称**：暂定 `Translator Helper` / 中文名？
5. **许可证**：MIT / Apache-2.0 / 其它？
6. **免费翻译源**：一期先用哪个（Chrome 内置 API 实测 / LibreTranslate / MyMemory / 平台 Key）？
7. **OCR 语言包分发**：打包进扩展还是首次下载缓存？
8. **是否一期就支持**：PDF 内图片、跨域 iframe、自动气泡检测、朗读 TTS？
9. **目标浏览器优先级**：仅 Chrome/Edge，还是同时产出 Firefox 构建做验证？
10. **Node 版本策略**：本地 Node 24，CI 是否固定 LTS（如 22）？

---

## 14. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-11-07 | 初始白皮书：确立图片优先、本地 OCR、日语漫画、侧边栏、Git 规划 |
