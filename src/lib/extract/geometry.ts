export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NaturalRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

type Length = { kind: 'auto' } | { kind: 'px'; value: number } | { kind: 'percent'; value: number };

interface RenderSize {
  width: number;
  height: number;
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return { left, top, width: right - left, height: bottom - top };
}

export function mapObjectFitRect(
  selection: Rect,
  box: Rect,
  naturalWidth: number,
  naturalHeight: number,
  objectFit: ObjectFit = 'fill',
): NaturalRect | null {
  if (naturalWidth <= 0 || naturalHeight <= 0 || box.width <= 0 || box.height <= 0) {
    return null;
  }

  const hit = intersectRect(selection, box);
  if (!hit) {
    return null;
  }

  const render = resolveObjectFitSize(box, naturalWidth, naturalHeight, objectFit);
  if (!render) {
    return null;
  }

  const originX = box.left + (box.width - render.width) / 2;
  const originY = box.top + (box.height - render.height) / 2;
  const contentRect: Rect = {
    left: originX,
    top: originY,
    width: render.width,
    height: render.height,
  };

  const visible = intersectRect(hit, contentRect);
  if (!visible) {
    return null;
  }

  const scaleX = render.width / naturalWidth;
  const scaleY = render.height / naturalHeight;

  return toNaturalRect(
    (visible.left - originX) / scaleX,
    (visible.top - originY) / scaleY,
    visible.width / scaleX,
    visible.height / scaleY,
    naturalWidth,
    naturalHeight,
  );
}

export function mapBackgroundRect(
  selection: Rect,
  box: Rect,
  naturalWidth: number,
  naturalHeight: number,
  backgroundSize: string,
  backgroundPosition: string,
): NaturalRect | null {
  if (naturalWidth <= 0 || naturalHeight <= 0 || box.width <= 0 || box.height <= 0) {
    return null;
  }

  const hit = intersectRect(selection, box);
  if (!hit) {
    return null;
  }

  const render = resolveBackgroundSize(box, naturalWidth, naturalHeight, backgroundSize);
  if (!render) {
    return null;
  }

  const offsetX = resolvePosition(backgroundPosition, 'x', box.width, render.width);
  const offsetY = resolvePosition(backgroundPosition, 'y', box.height, render.height);
  const contentRect: Rect = {
    left: box.left + offsetX,
    top: box.top + offsetY,
    width: render.width,
    height: render.height,
  };

  const visible = intersectRect(hit, contentRect);
  if (!visible) {
    return null;
  }

  const scaleX = render.width / naturalWidth;
  const scaleY = render.height / naturalHeight;

  return toNaturalRect(
    (visible.left - contentRect.left) / scaleX,
    (visible.top - contentRect.top) / scaleY,
    visible.width / scaleX,
    visible.height / scaleY,
    naturalWidth,
    naturalHeight,
  );
}

function resolveObjectFitSize(
  box: Rect,
  naturalWidth: number,
  naturalHeight: number,
  objectFit: ObjectFit,
): RenderSize | null {
  switch (objectFit) {
    case 'none':
      return { width: naturalWidth, height: naturalHeight };
    case 'scale-down': {
      const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight, 1);
      return { width: naturalWidth * scale, height: naturalHeight * scale };
    }
    case 'cover': {
      const scale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
      return { width: naturalWidth * scale, height: naturalHeight * scale };
    }
    case 'contain': {
      const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
      return { width: naturalWidth * scale, height: naturalHeight * scale };
    }
    case 'fill':
    default:
      return { width: box.width, height: box.height };
  }
}

function resolveBackgroundSize(
  box: Rect,
  naturalWidth: number,
  naturalHeight: number,
  backgroundSize: string,
): RenderSize | null {
  const value = (backgroundSize || 'auto').trim().toLowerCase();

  if (value === 'cover' || value === 'contain') {
    const scale =
      value === 'cover'
        ? Math.max(box.width / naturalWidth, box.height / naturalHeight)
        : Math.min(box.width / naturalWidth, box.height / naturalHeight);
    return { width: naturalWidth * scale, height: naturalHeight * scale };
  }

  const parts = value.split(/\s+/).filter(Boolean);
  const widthLength = parseLength(parts[0]);
  const heightLength = parseLength(parts[1]);

  let width = resolveLength(widthLength, box.width);
  let height = resolveLength(heightLength, box.height);

  if (width === null && height === null) {
    width = naturalWidth;
    height = naturalHeight;
  } else if (width === null) {
    height = height ?? naturalHeight;
    width = height * (naturalWidth / naturalHeight);
  } else if (height === null) {
    height = width * (naturalHeight / naturalWidth);
  }

  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return { width, height };
}

function parseLength(token: string | undefined): Length {
  const value = (token ?? 'auto').trim().toLowerCase();
  if (!value || value === 'auto') {
    return { kind: 'auto' };
  }
  if (value.endsWith('%')) {
    return { kind: 'percent', value: Number.parseFloat(value) || 0 };
  }
  if (value.endsWith('px')) {
    return { kind: 'px', value: Number.parseFloat(value) || 0 };
  }

  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? { kind: 'px', value: numeric } : { kind: 'auto' };
}

function resolveLength(length: Length, available: number): number | null {
  if (length.kind === 'px') {
    return length.value;
  }
  if (length.kind === 'percent') {
    return (length.value / 100) * available;
  }
  return null;
}

function resolvePosition(
  position: string,
  axis: 'x' | 'y',
  boxSize: number,
  renderSize: number,
): number {
  const value = (position || '0% 0%').trim().toLowerCase();
  const parts = value.split(/\s+/).filter(Boolean);
  let token = axis === 'x' ? parts[0] : parts[1];

  if (parts.length === 1) {
    const single = parts[0];
    const isVertical = single === 'top' || single === 'bottom';
    const isHorizontal = single === 'left' || single === 'right';
    token =
      axis === 'x' && isVertical ? 'center' : axis === 'y' && isHorizontal ? 'center' : single;
  }

  token = token ?? 'center';
  const gap = boxSize - renderSize;

  switch (token) {
    case 'left':
    case 'top':
      return 0;
    case 'right':
    case 'bottom':
      return gap;
    case 'center':
      return gap / 2;
    default:
      break;
  }

  if (token.endsWith('%')) {
    return (gap * (Number.parseFloat(token) || 0)) / 100;
  }
  if (token.endsWith('px')) {
    return Number.parseFloat(token) || 0;
  }

  const numeric = Number.parseFloat(token);
  return Number.isFinite(numeric) ? numeric : gap / 2;
}

function toNaturalRect(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  naturalWidth: number,
  naturalHeight: number,
): NaturalRect | null {
  const x0 = clamp(Math.floor(sx), 0, naturalWidth);
  const y0 = clamp(Math.floor(sy), 0, naturalHeight);
  const x1 = clamp(Math.ceil(sx + sw), 0, naturalWidth);
  const y1 = clamp(Math.ceil(sy + sh), 0, naturalHeight);

  if (x1 - x0 < 1 || y1 - y0 < 1) {
    return null;
  }

  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
