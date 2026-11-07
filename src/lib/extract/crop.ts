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
  const element = target.element;
  const box = domRectToRect(element.getBoundingClientRect());
  const imageUrl = getTargetImageUrl(target);

  const computeRect = (naturalWidth: number, naturalHeight: number): NaturalRect | null => {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return null;
    }
    if (element instanceof HTMLImageElement) {
      return mapObjectFitRect(
        selection,
        box,
        naturalWidth,
        naturalHeight,
        normalizeObjectFit(getComputedStyle(element).objectFit, 'fill'),
      );
    }
    if (element instanceof HTMLCanvasElement) {
      return mapObjectFitRect(selection, box, naturalWidth, naturalHeight, 'fill');
    }
    if (element instanceof HTMLVideoElement) {
      return mapObjectFitRect(
        selection,
        box,
        naturalWidth,
        naturalHeight,
        normalizeObjectFit(getComputedStyle(element).objectFit, 'contain'),
      );
    }
    if (target.kind === 'background') {
      const style = getComputedStyle(element);
      return mapBackgroundRect(
        selection,
        box,
        naturalWidth,
        naturalHeight,
        style.backgroundSize,
        style.backgroundPosition,
      );
    }
    return null;
  };

  if (element instanceof HTMLImageElement) {
    const result = await renderCrop(
      element,
      computeRect(element.naturalWidth, element.naturalHeight),
      target.kind,
    );
    if (result) {
      return result;
    }
  } else if (element instanceof HTMLCanvasElement) {
    const result = await renderCrop(
      element,
      computeRect(element.width, element.height),
      target.kind,
    );
    if (result) {
      return result;
    }
  } else if (element instanceof HTMLVideoElement) {
    const result = await renderCrop(
      element,
      computeRect(element.videoWidth, element.videoHeight),
      target.kind,
    );
    if (result) {
      return result;
    }
  } else if (target.kind === 'background' && imageUrl) {
    const loaded = await loadCorsImage(imageUrl);
    if (loaded) {
      const result = await renderCrop(
        loaded,
        computeRect(loaded.naturalWidth, loaded.naturalHeight),
        target.kind,
      );
      if (result) {
        return result;
      }
    }
  }

  // Cross-origin images taint the canvas, so fetch the original bytes via the
  // background service worker (which has host permissions) and crop from that.
  if (imageUrl) {
    const fetched = await fetchImageViaBackground(imageUrl);
    if (fetched) {
      const image = await loadDataUrlImage(fetched);
      if (image) {
        const result = await renderCrop(
          image,
          computeRect(image.naturalWidth, image.naturalHeight),
          target.kind,
        );
        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}

async function renderCrop(
  source: CanvasImageSource,
  naturalRect: NaturalRect | null,
  sourceKind: ImageKind,
): Promise<CropResult | null> {
  if (!naturalRect) {
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
  try {
    context.drawImage(
      source,
      naturalRect.sx,
      naturalRect.sy,
      naturalRect.sw,
      naturalRect.sh,
      0,
      0,
      naturalRect.sw,
      naturalRect.sh,
    );
  } catch {
    return null;
  }

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const scaled = await maybeDownscale(dataUrl, naturalRect.sw, naturalRect.sh);
    return {
      dataUrl: scaled.dataUrl,
      width: scaled.width,
      height: scaled.height,
      source: sourceKind,
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

  const scaled = await maybeDownscale(canvas.toDataURL('image/png'), sw, sh);
  return {
    dataUrl: scaled.dataUrl,
    width: scaled.width,
    height: scaled.height,
    source: 'viewport',
    naturalRect: { sx, sy, sw, sh },
  };
}

function getTargetImageUrl(target: ImageTarget): string | null {
  if (target.element instanceof HTMLImageElement) {
    return target.element.currentSrc || target.element.src || null;
  }
  if (target.kind === 'background') {
    return target.backgroundImageUrl ?? null;
  }
  return null;
}

async function fetchImageViaBackground(url: string): Promise<string | null> {
  const response = await browser.runtime
    .sendMessage({ type: 'FETCH_IMAGE', url })
    .catch(() => null);

  return (response as { dataUrl?: string | null } | null)?.dataUrl ?? null;
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
