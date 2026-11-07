# Translator Helper

日语漫画 / 图片文字实时翻译浏览器扩展（Chrome / Edge）。

手动框选网页中的图片文字区域，在浏览器本地完成 OCR 识别，翻译后显示在侧边栏。图片不上传，隐私优先。

## 状态

规划阶段，尚未开始编码。

## 文档

- [项目搭建白皮书](docs/PROJECT_WHITEPAPER.md) —— 设计、架构、决策与路线图

## 技术栈（规划）

- Manifest V3 + WXT + TypeScript + React
- 本地 OCR：Tesseract.js（`jpn_vert` 竖排日语），二期 manga-ocr（ONNX）
- 翻译：免费源兜底，可选术语表 / 离线词典 / OpenAI 兼容大模型

## 开发

待项目骨架完成后补充。
