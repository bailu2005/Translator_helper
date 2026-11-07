import { domRectToRect, findImageTarget, type ImageKind, type ImageTarget } from './find-target';
import {
  mapBackgroundRect,
  mapObjectFitRect,
  type NaturalRect,
  type ObjectFit,
  type Rect,
} from './geometry';

export interface CropResult {
  dataUrl: string;
  width: number;
  height: number;
  source: ImageKind | 'viewport';
  naturalRect: NaturalRect;
}

const MAX_DIMENSION = 4096;

export async function cropSelection(selection: Rect): Promise<CropResult | null> {
  const target = findImageTarget(selection);
  if (target) {
    const direct = await cropTarget(target, selection);
    if (direct) {
      return direct;
    }
  }

  return cropViewport(selection);
}

async function cropTarget(target: ImageTarget, selection: Rect): Promise<CropResult | null> {
  const box = domRectToRect(target.element.getBoundingClientRect());
  const element = target.element;

  let naturalWidth = 0;
  let naturalHeight = 0;
  let drawable: CanvasImageSource | null = null;
  let naturalRect: NaturalRect | null = null;

  if (element instanceof HTMLImageElement) {
    naturalWidth = element.naturalWidth;
    naturalHeight = element.naturalHeight;
    drawable = element;
    naturalRect = mapObjectFitRect(
      selection,
      box,
      naturalWidth,
      naturalHeight,
      normalizeObjectFit(getComputedStyle(element).objectFit, 'fill'),
    );
  } else if (element instanceof HTMLCanvasElement) {
    naturalWidth = element.width;
    naturalHeight = element.height;
    drawable = element;
    naturalRect = mapObjectFitRect(selection, box, naturalWidth, naturalHeight, 'fill');
  } else if (element instanceof HTMLVideoElement) {
    naturalWidth = element.videoWidth;
    naturalHeight = element.videoHeight;
    drawable = element;
    naturalRect = mapObjectFitRect(
      selection,
      box,
      naturalWidth,
      naturalHeight,
      normalizeObjectFit(getComputedStyle(element).objectFit, 'contain'),
    );
  } else if (target.kind === 'background' && target.backgroundImageUrl) {
    const loaded = await loadCorsImage(target.backgroundImageUrl);
    if (!loaded) {
      return null;
    }

    const style = getComputedStyle(element);
    naturalWidth = loaded.naturalWidth;
    naturalHeight = loaded.naturalHeight;
    drawable = loaded;
    naturalRect = mapBackgroundRect(
      selection,
      box,
      naturalWidth,
      naturalHeight,
      style.backgroundSize,
      style.backgroundPosition,
    );
  }

  if (!drawable || !naturalRect || naturalWidth <= 0 || naturalHeight <= 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = naturalRect.sw;
  canvas.height = naturalRect.sh;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.drawImage(
    drawable,
    naturalRect.sx,
    naturalRect.sy,
    naturalRect.sw,
    naturalRect.sh,
    0,
    0,
    naturalRect.sw,
    naturalRect.sh,
  );

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const scaled = await maybeDownscale(dataUrl, naturalRect.sw, naturalRect.sh);
    return {
      dataUrl: scaled.dataUrl,
      width: scaled.width,
      height: scaled.height,
      source: target.kind,
      naturalRect,
    };
  } catch {
    return null;
  }
}

async function cropViewport(selection: Rect): Promise<CropResult | null> {
  const response = await browser.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' }).catch(() => null);
  const dataUrl = (response as { dataUrl?: string | null } | null)?.dataUrl;
  if (!dataUrl) {
    return null;
  }

  const screenshot = await loadDataUrlImage(dataUrl);
  if (!screenshot) {
    return null;
  }

  const scaleX = screenshot.naturalWidth / Math.max(1, window.innerWidth);
  const scaleY = screenshot.naturalHeight / Math.max(1, window.innerHeight);
  const sx = Math.round(selection.left * scaleX);
  const sy = Math.round(selection.top * scaleY);
  const sw = Math.round(selection.width * scaleX);
  const sh = Math.round(selection.height * scaleY);

  if (sw < 1 || sh < 1) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(screenshot, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: sw,
    height: sh,
    source: 'viewport',
    naturalRect: { sx, sy, sw, sh },
  };
}

function normalizeObjectFit(value: string, fallback: ObjectFit): ObjectFit {
  switch (value) {
    case 'fill':
    case 'contain':
    case 'cover':
    case 'none':
    case 'scale-down':
      return value;
    default:
      return fallback;
  }
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function loadDataUrlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function maybeDownscale(
  dataUrl: string,
  width: number,
  height: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const largest = Math.max(width, height);
  if (largest <= MAX_DIMENSION) {
    return { dataUrl, width, height };
  }

  const image = await loadDataUrlImage(dataUrl);
  if (!image) {
    return { dataUrl, width, height };
  }

  const scale = MAX_DIMENSION / largest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    return { dataUrl, width, height };
  }

  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
