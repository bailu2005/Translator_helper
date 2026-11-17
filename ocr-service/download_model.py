import os
import urllib.request
from pathlib import Path

BASE = os.environ.get('HF_ENDPOINT', 'https://hf-mirror.com')
REPO = 'kha-white/manga-ocr-base'
FILES = [
    'config.json',
    'preprocessor_config.json',
    'special_tokens_map.json',
    'tokenizer_config.json',
    'vocab.txt',
    'pytorch_model.bin',
]
DEST = Path(__file__).parent / 'models' / 'manga-ocr-base'


def download(name: str) -> None:
    target = DEST / name
    if target.exists() and target.stat().st_size > 0:
        print(f'skip {name}')
        return

    url = f'{BASE}/{REPO}/resolve/main/{name}'
    part = target.with_name(f'{target.name}.part')
    print(f'downloading {name}...')

    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        total = int(response.headers.get('Content-Length', 0))
        downloaded = 0
        with open(part, 'wb') as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                if total:
                    print(f'  {downloaded / total * 100:5.1f}%', end='\r', flush=True)

    part.replace(target)
    print(f'\n  saved {target.stat().st_size} bytes')


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        download(name)
    print(f'model ready: {DEST}')


if __name__ == '__main__':
    main()
