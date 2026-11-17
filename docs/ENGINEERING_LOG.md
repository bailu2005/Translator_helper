# 工程日志

> 记录项目定位、已完成事项、关键决策、已知问题与下一步。
> 详细设计与架构见 [项目搭建白皮书](PROJECT_WHITEPAPER.md)。

- 最后更新：2026-11-17
- 当前阶段：P3.2 完成，P3.3 待开始

---

## 1. 项目定位与范围

**只专注日文漫画 → 简体中文。**

- 内容域：日文漫画气泡 / 图片文字
- 交互：手动框选 → 本地 OCR → 侧边栏显示
- 隐私：图片不出本机；OCR 优先使用本地 manga-ocr 服务

**非目标：**

- 其它语言、通用文档 OCR、整页自动覆盖翻译
- 官方不维护其它语言支持；保留 Provider 扩展点，由需要的人自行实现

---

## 2. 当前里程碑

| 阶段 | 内容                                                        | 状态                     |
| ---- | ----------------------------------------------------------- | ------------------------ |
| P0   | WXT + TypeScript + React 骨架；侧边栏 / popup / options；CI | ✅                       |
| P1   | 框选遮罩、目标定位、坐标映射、跨域取像素、预览、历史与删除  | ✅                       |
| P2   | Tesseract.js `jpn_vert` OCR                                 | ✅                       |
| P2.1 | 方向 / 阅读顺序选择、图像预处理、低置信度重试               | ✅                       |
| P2.5 | 本地 manga-ocr 服务（主引擎）+ Tesseract 自动回退           | ✅                       |
| P3   | 日 → 中翻译 + 学习模式（词汇/语法/生词本）                  | 进行中（P3.0–P3.2 完成） |
| P4   | 自动气泡检测、GPU 加速、浏览器内 ONNX、Firefox、商店发布    | 远期                     |

---

## 3. 当前架构

```text
网页 content script
  框选遮罩 → 目标定位 → 裁剪（原图 / 后台拉原图 / 截图兜底）
        │
        ▼
侧边栏 side panel
  ├─ 调用本地 manga-ocr 服务（http://127.0.0.1:8765）
  └─ 失败 / 未就绪 → 自动回退内置 Tesseract
        │
        ▼
侧边栏展示：原文 + 引擎 + 耗时 + 历史
```

- 扩展构建产物：`.output/chrome-mv3`
- 本地 OCR 服务：`ocr-service/`（Python 3.12 + uv）
- manga-ocr 模型：`ocr-service/models/manga-ocr-base`（约 423MB，gitignored）
- Tesseract 资源：`public/tesseract`、`public/tessdata`（由 `npm run setup:ocr` 生成，gitignored）

---

## 4. 关键决策

| 决策 | 内容                                                     |
| ---- | -------------------------------------------------------- |
| D-14 | OCR 引擎：本地 manga-ocr 服务优先，Tesseract.js 自动回退 |
| D-15 | 项目范围：只做日文漫画；其它语言通过 Provider 自行扩展   |
| D-02 | 构建：WXT + TypeScript                                   |
| D-03 | UI：React                                                |
| D-13 | 许可证：MIT                                              |

完整 ADR 见白皮书第 2 章。

---

## 5. 运行方式

### 扩展

```powershell
npm.cmd install
npm.cmd run setup:ocr
npm.cmd run build
```

`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `.output/chrome-mv3`。

### 本地 manga-ocr 服务

```powershell
cd ocr-service
uv run download_model.py   # 首次下载模型（约 423MB）
uv run app.py               # 启动服务，默认 127.0.0.1:8765
```

停止：`ocr-service\stop.cmd` 或 `Ctrl+C`。

### 验证

- 扩展单测：`npm.cmd run test`（当前 28 个通过）
- 类型 / lint / 构建：`npm.cmd run compile`、`npm.cmd run lint`、`npm.cmd run build`
- 服务健康检查：`GET http://127.0.0.1:8765/health`

---

## 6. 已知问题与限制

- **服务需要手动启动**：未启动时自动回退 Tesseract，质量明显下降
- **manga-ocr 在 CPU 上约 0.5–2 秒/气泡**：尚未接 GPU / DirectML
- **可能幻觉**：空白/无文字图片也可能输出文字（模型已知行为）
- **无置信度**：manga-ocr 不返回 confidence，侧边栏不显示置信度
- **输入 224×224**：特别长/密的文字块可能丢细节，建议一次框一个气泡
- **手写体较弱**：manga-ocr 官方说明主要针对印刷/漫画字体
- **Tesseract 回退质量有限**：方向/顺序设置只对 Tesseract 生效
- **权限较宽**：当前 `host_permissions: ['<all_urls>']`，后续可评估改为可选权限
- **跨域图片**：优先后台拉原图，失败走视口截图；部分防盗链/DRM 场景仍可能失败
- **模型下载源**：当前环境直连 HuggingFace 超时，默认使用 `hf-mirror.com`
- **torchvision 未安装**：ViTImageProcessor 使用 PIL 回退（功能正常）

---

## 7. P3 计划（已确认）

### 7.1 翻译

- 执行位置：侧边栏（Chrome 内置 API 需要文档上下文，LLM 流式更直接）
- 自动源链：**LLM（已配置）→ Chrome 内置 → MyMemory**
- 术语表：CSV/JSON；免费源用 `[[n]]` 占位替换，LLM 写入 prompt
- 上下文：最近 2–3 个气泡的原文/译文
- 缓存：`hash + LRU`，存 `storage.local`
- UI：译文 + 引擎 + 耗时 + 复制 + 重试 + 自动翻译开关

### 7.2 学习模式（已确认）

- **按需生成**：点击「生成学习卡」才调用
- **词汇 + 语法都要**
- LLM 一次调用同时返回 **译文 + 学习卡**
- 无 LLM 时：本地 `/tokenize`（fugashi + unidic-lite）显示表记/读音/词性/辞书形/活用形
- 生词本：本地收藏、去重、导出
- 默认展示 3–5 个重点词 + 1–3 个语法点
- 读音以本地分词为准，LLM 负责释义/用法/例句

### 7.3 阶段

- **P3.0**：✅ 翻译主流程（Provider 接口 + 自动源链 + 缓存 + 自动翻译）
- **P3.1**：✅ 术语表导入与占位替换（CSV/TSV/JSON、导出、LLM prompt）
- **P3.2**：✅ LLM 流式翻译 + 上下文 + 按需学习卡（词汇/语法）+ 缓存
- **P3.3**：本地 `/tokenize` + 无 LLM 基础学习信息
- **P3.4**：学习卡 UI + 生词本
- **P3.5**：历史关联、错误体验、i18n

### 7.4 之后

1. 性能：GPU / DirectML 推理；考虑浏览器内 ONNX/WebGPU
2. 体验：自动气泡检测、快捷键、错误重试
3. 发布：打包 zip、商店审核、Firefox 适配

---

## 8. 扩展点（留给其它语言/场景）

项目核心只维护日文漫画，但代码结构允许自行扩展：

- **OCR**：实现 `src/lib/ocr/types.ts` 的 `OcrProvider`，或在 `ocr-service/` 中替换 `MANGA_OCR_MODEL`
- **引擎选择**：在 `src/lib/ocr/engine.ts` 注册新 Provider
- **翻译**：P3 会引入 `TranslationProvider` 接口，可自行接入其它语言对/服务
- **服务端**：`ocr-service/app.py` 可替换为其它模型，只要保持 `/health` 与 `/ocr` 协议

这些扩展不属于官方核心支持范围。

---

## 9. 变更记录

| 日期       | 内容                                                                       | 提交                  |
| ---------- | -------------------------------------------------------------------------- | --------------------- |
| 2026-11-07 | 白皮书、Git 仓库、MIT 许可证                                               | `360f11a` / `d990c6e` |
| 2026-11-17 | P0 WXT + React 骨架                                                        | `e59c99a`             |
| 2026-11-17 | P1 框选 / 裁剪 / 预览 / 历史                                               | `935b205`             |
| 2026-11-17 | 本地测试页                                                                 | `3bec214`             |
| 2026-11-17 | 历史记录与单条删除                                                         | `065595a` / `b01423c` |
| 2026-11-17 | Tesseract OCR + 跨域图片捕获                                               | `4b6749b`             |
| 2026-11-17 | P2.1 方向 / 顺序 / 预处理 / 重试                                           | `ce30ea5`             |
| 2026-11-17 | P2.5 本地 manga-ocr 服务 + Tesseract 回退                                  | `51df0d8`             |
| 2026-11-17 | 范围收敛为日文漫画，新增本工程日志                                         | 本次提交              |
| 2026-11-17 | 确认 P3 翻译 + 学习模式计划（按需学习卡、词汇+语法、生词本、LLM 合并调用） | 规划更新              |
| 2026-11-17 | P3.0 翻译主流程（Provider + 自动源链 + 缓存 + 自动翻译）                   | 本次提交              |
| 2026-11-17 | P3.1 术语表（导入/导出、占位替换、LLM prompt）                             | 本次提交              |
| 2026-11-17 | P3.2 LLM 流式翻译 + 上下文 + 按需学习卡                                    | 本次提交              |
