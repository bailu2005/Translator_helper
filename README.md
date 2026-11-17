# Translator Helper

日语漫画 / 图片文字实时翻译浏览器扩展（Chrome / Edge）。

手动框选网页中的漫画文字区域，OCR 识别后显示在侧边栏。图片不出本机，隐私优先。

**范围：只专注日文漫画 → 简体中文。** 其它语言/场景不纳入官方核心维护范围，欢迎通过 Provider 接口自行扩展。

## 状态

- P0 项目骨架 ✅
- P1 框选 / 裁剪 / 预览 / 历史 ✅
- P2 日文 OCR（Tesseract 回退）✅
- P2.1 方向 / 顺序 / 预处理 / 低置信度重试 ✅
- P2.5 本地 manga-ocr 服务（主引擎，失败回退 Tesseract）✅
- P3.0 翻译主流程（LLM → Chrome 内置 → MyMemory）✅
- P3.1 术语表（导入/导出、占位替换、LLM prompt）✅
- P3.2 LLM 学习卡：待实现

## OCR 架构

- **主引擎**：本地 manga-ocr HTTP 服务（`ocr-service/`，默认 `http://127.0.0.1:8765`）
  - 专为日文漫画训练，支持竖排/横排、假名、多字体、图上文字
  - 模型约 400MB，首次运行下载并缓存
- **兜底**：内置 Tesseract.js（`jpn_vert` / `jpn`），服务不可用时自动回退
- 方向/顺序设置仅对 Tesseract 生效；manga-ocr 自动处理

## 快速开始

```powershell
# 1. 安装扩展依赖并构建
npm.cmd install
npm.cmd run setup:ocr
npm.cmd run build

# 2. 启动本地 manga-ocr 服务（首次会下载模型）
cd ocr-service
uv run download_model.py
uv run app.py
```

Chrome/Edge → `chrome://extensions` → 加载已解压的扩展程序 → 选择 `.output/chrome-mv3`。

## 文档

- [项目搭建白皮书](docs/PROJECT_WHITEPAPER.md) —— 设计、架构、决策
- [工程日志](docs/ENGINEERING_LOG.md) —— 进度、问题、下一步
- [本地 manga-ocr 服务](ocr-service/README.md)

## 技术栈

- Manifest V3 + WXT + TypeScript + React
- OCR：manga-ocr（Python 本地服务）+ Tesseract.js 回退
- 翻译：免费源兜底，可选术语表 / 离线词典 / OpenAI 兼容大模型
