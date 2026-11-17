# 新会话接续指南（Handoff）

> 聊天上下文有限，项目状态以仓库为准。新开窗口时先读本文件。

## 30 秒接续

1. `cd D:\Translator_helper`
2. `git pull`
3. 依次阅读：
   - `docs/HANDOFF.md`（本文件）
   - `docs/ENGINEERING_LOG.md`（进度、下一步、UI 规范）
   - `docs/PROJECT_WHITEPAPER.md`（架构、ADR）
   - `README.md`
4. 检查：`git log --oneline -10`、`git status`
5. 启动本地服务：`cd ocr-service; uv run app.py`（或 `run.cmd`）
6. 继续下一个阶段（当前：P3.5）

## 新会话提示词（可直接粘贴）

```text
项目：D:\Translator_helper（GitHub: bailu2005/Translator_helper）
请先读 docs/HANDOFF.md、docs/ENGINEERING_LOG.md、docs/PROJECT_WHITEPAPER.md、README.md，
并检查 git log / git status。
当前阶段：P3.4 完成，P3.5 待开始。
继续 P3.5：历史记录关联译文/学习卡、错误体验、i18n。
约束：只做日文漫画；所有按钮遵循 UI 反馈规范；大改动先说明方案；完成后 commit/push。
```

## 项目定位（必须遵守）

- 只做 **日文漫画 → 简体中文**
- 其它语言/场景不纳入官方核心；通过 Provider 自行扩展
- 图片不出本机，本地 OCR 优先
- OCR：本地 manga-ocr 服务为主，Tesseract 自动回退
- 翻译自动源链：LLM（已配置）→ Chrome 内置 → MyMemory
- 学习卡按需生成；无 LLM 时用本地 `/tokenize` 基础信息
- 生词本独立标签页；侧边栏右上角有「生词本」「设置」

## 当前状态

- 已完成 P0–P3.4（截至 2026-11-17）
- 最新提交以 `git log` 为准
- 待做 **P3.5**：历史记录关联译文/学习卡、错误体验、i18n
- 远期 **P4**：自动气泡检测、GPU、浏览器内 ONNX、Firefox、发布

## 强制 UI 规范

见 `docs/ENGINEERING_LOG.md` 第 8 节。摘要：

- 所有按钮：按压反馈、禁用态、异步加载态
- 成功/失败：Toast 或行内提示，不能静默
- 删除/清空：二次确认
- 禁用按钮要说明原因

## 环境与命令（Windows）

- Node 24 / npm；PowerShell 禁止 `npm.ps1`，统一用 `npm.cmd`
- Python：`uv` + Python 3.12（`ocr-service/.python-version`）
- 扩展构建：`npm.cmd run build` → `.output/chrome-mv3`
- 本地 OCR：`cd ocr-service; uv run app.py`，停止用 `stop.cmd`
- 模型：`ocr-service/models/manga-ocr-base`（约 423MB，已 gitignore）
- 首次安装依赖：`uv sync`（阿里云 PyPI 镜像，见 `ocr-service/pyproject.toml`）
- 模型下载：`uv run download_model.py`（默认 `hf-mirror.com`）
- DeepSeek：Base URL `https://api.deepseek.com/v1`，模型 `deepseek-chat`
- Git：SteamTools 代理导致 HTTPS 证书问题，已用组合 CA 包；SSH 22 不可用
- `gh` 未安装；推送使用 HTTPS + Git Credential Manager

## Git 规则

- Conventional Commits
- 每完成一个阶段 commit + push
- 不提交：`.venv`、`models`、日志、密钥
- API Key 只存浏览器 `storage.local`

## 不要在未确认时做的事

- 不更换核心 OCR/翻译方向（除非用户明确要求）
- 不扩大到其它语言/通用 OCR
- 不擅自删除本地模型、术语表、生词本数据
- 大改动先说明方案，确认后实施
