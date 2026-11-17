# 本地 manga-ocr 服务

给 Translator Helper 扩展提供本地日文漫画 OCR。服务只监听 `127.0.0.1`，图片不出本机。

## 要求

- Python 3.12（推荐用 `uv`，会自动准备）
- 首次运行会下载 manga-ocr 模型（约 400MB），并需要约 2GB 磁盘空间
- 模型源默认使用 `https://hf-mirror.com`，可用环境变量 `HF_ENDPOINT` 覆盖

## 安装与运行

```powershell
cd D:\Translator_helper\ocr-service
uv run download_model.py
uv run app.py
```

或者先 `uv run download_model.py`，再双击 `run.cmd`。

依赖通过阿里云 PyPI 镜像安装（见 `pyproject.toml`）。模型默认下载到 `models/manga-ocr-base`；该目录存在时服务会优先使用本地模型，避免 HuggingFace API 限流。首次启动会先返回 `/health`，模型在后台加载；加载完成前，扩展会自动回退到内置 Tesseract。

如果下载被限流，可设置 `HF_ENDPOINT=https://hf-mirror.com` 后重试；`download_model.py` 会跳过已下载的文件。

## 接口

- `GET /health` → `{ status, ready, loading, error, model }`
- `POST /ocr`，JSON `{ "image": "data:image/png;base64,..." }` → `{ text, engine, durationMs }`

默认地址：`http://127.0.0.1:8765`

可用环境变量修改：

- `OCR_HOST` / `OCR_PORT`
- `HF_ENDPOINT`（模型下载源）

## 停止

- 在运行窗口按 `Ctrl+C`
- 或双击 `stop.cmd`（按端口 8765 结束进程）
