import type { Rect } from '../extract/geometry';

const MIN_SELECTION_SIZE = 6;

export function startSelectionOverlay(): Promise<Rect | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('data-translator-helper', 'overlay');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .surface { position: fixed; inset: 0; cursor: crosshair; background: transparent; touch-action: none; }
      .box {
        position: fixed;
        display: none;
        border: 2px solid #2f6feb;
        border-radius: 2px;
        background: rgba(47, 111, 235, 0.12);
        box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
        pointer-events: none;
      }
      .hint {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(17, 17, 17, 0.85);
        color: #fff;
        font: 12px/1.4 system-ui, sans-serif;
        pointer-events: none;
        white-space: nowrap;
      }
    `;

    const surface = document.createElement('div');
    surface.className = 'surface';
    const box = document.createElement('div');
    box.className = 'box';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '拖拽框选要翻译的区域 · Esc 取消';

    shadow.append(style, surface, box, hint);
    document.documentElement.append(host);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const finish = (rect: Rect | null) => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      host.remove();
      resolve(rect);
    };

    const updateBox = (x: number, y: number) => {
      const left = Math.min(startX, x);
      const top = Math.min(startY, y);
      const width = Math.abs(x - startX);
      const height = Math.abs(y - startY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.style.display = 'block';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      startX = event.clientX;
      startY = event.clientY;
      dragging = true;
      updateBox(startX, startY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      event.preventDefault();
      updateBox(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      event.preventDefault();

      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);

      if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
        finish(null);
        return;
      }

      finish({ left, top, width, height });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    surface.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('keydown', onKeyDown, true);
  });
}

export function showToast(message: string): void {
  const host = document.createElement('div');
  host.setAttribute('data-translator-helper', 'toast');
  host.style.cssText =
    'all: initial; position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  const content = document.createElement('div');
  content.textContent = message;
  content.style.cssText =
    'padding: 8px 14px; border-radius: 8px; background: rgba(17, 17, 17, 0.9); color: #fff; font: 13px/1.5 system-ui, sans-serif; max-width: 70vw; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);';

  shadow.append(content);
  document.documentElement.append(host);
  window.setTimeout(() => host.remove(), 2800);
}
