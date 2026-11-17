import base64
import io
import os
import threading
import time
from contextlib import asynccontextmanager

os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

model = None
model_error = None
model_loading = True
model_lock = threading.Lock()


class OcrRequest(BaseModel):
    image: str


def resolve_model_path() -> str:
    configured = os.environ.get('MANGA_OCR_MODEL')
    if configured:
        return configured

    local = os.path.join(os.path.dirname(__file__), 'models', 'manga-ocr-base')
    if os.path.isdir(local):
        return local

    return 'kha-white/manga-ocr-base'


def load_model():
    global model, model_error, model_loading
    try:
        from manga_ocr import MangaOcr

        model_path = resolve_model_path()
        print(f'Loading manga-ocr model from {model_path}...', flush=True)
        model = MangaOcr(model_path)
        print('manga-ocr model is ready.', flush=True)
    except Exception as exc:
        model_error = str(exc)
        print(f'Failed to load manga-ocr model: {exc}', flush=True)
    finally:
        model_loading = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title='Translator Helper OCR', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
    allow_private_network=True,
)


@app.get('/')
def root():
    return {'name': 'Translator Helper OCR', 'endpoints': ['/health', '/ocr']}


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'ready': model is not None,
        'loading': model_loading,
        'error': model_error,
        'model': 'manga-ocr',
    }


@app.post('/ocr')
def ocr(request: OcrRequest):
    if model is None:
        raise HTTPException(status_code=503, detail=model_error or 'model is loading')

    image = decode_image(request.image)
    started = time.perf_counter()

    with model_lock:
        text = model(image)

    return {
        'text': text,
        'engine': 'manga-ocr',
        'durationMs': round((time.perf_counter() - started) * 1000),
    }


def decode_image(value: str) -> Image.Image:
    if value.startswith('data:') and ',' in value:
        value = value.split(',', 1)[1]

    try:
        raw = base64.b64decode(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='invalid base64') from exc

    try:
        return Image.open(io.BytesIO(raw)).convert('RGB')
    except Exception as exc:
        raise HTTPException(status_code=400, detail='invalid image') from exc


if __name__ == '__main__':
    import uvicorn

    host = os.environ.get('OCR_HOST', '127.0.0.1')
    port = int(os.environ.get('OCR_PORT', '8765'))
    uvicorn.run(app, host=host, port=port, log_level='info')
