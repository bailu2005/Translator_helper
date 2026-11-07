import { intersectRect, type Rect } from './geometry';

export type ImageKind = 'img' | 'canvas' | 'video' | 'background';

export interface ImageTarget {
  element: Element;
  kind: ImageKind;
  backgroundImageUrl?: string;
}

export function domRectToRect(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function findImageTarget(selection: Rect): ImageTarget | null {
  const elements: Element[] = [];
  for (const [x, y] of samplePoints(selection)) {
    for (const element of document.elementsFromPoint(x, y)) {
      if (!elements.includes(element)) {
        elements.push(element);
      }
    }
  }

  for (const element of elements) {
    const target = toImageTarget(element, selection);
    if (target) {
      return target;
    }
  }

  let best: { target: ImageTarget; area: number } | null = null;
  for (const element of document.querySelectorAll<HTMLElement>('img, canvas, video')) {
    const target = toImageTarget(element, selection);
    if (!target) continue;

    const hit = intersectRect(selection, domRectToRect(element.getBoundingClientRect()));
    const area = hit ? hit.width * hit.height : 0;
    if (!best || area > best.area) {
      best = { target, area };
    }
  }

  return best?.target ?? null;
}

export function getBackgroundImageUrl(element: Element): string | null {
  const backgroundImage = window.getComputedStyle(element).backgroundImage;
  if (!backgroundImage || backgroundImage === 'none') {
    return null;
  }

  const match = /^url\((['"]?)(.*?)\1\)/i.exec(backgroundImage.trim());
  return match?.[2] || null;
}

function toImageTarget(element: Element, selection: Rect): ImageTarget | null {
  if (!isVisible(element)) {
    return null;
  }

  const box = domRectToRect(element.getBoundingClientRect());
  if (!intersectRect(selection, box)) {
    return null;
  }

  if (element instanceof HTMLImageElement) {
    return { element, kind: 'img' };
  }
  if (element instanceof HTMLCanvasElement) {
    return { element, kind: 'canvas' };
  }
  if (element instanceof HTMLVideoElement) {
    return { element, kind: 'video' };
  }

  const backgroundImageUrl = getBackgroundImageUrl(element);
  if (backgroundImageUrl) {
    return { element, kind: 'background', backgroundImageUrl };
  }

  return null;
}

function isVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function samplePoints(selection: Rect): [number, number][] {
  const xs = [
    selection.left + selection.width / 2,
    selection.left + 1,
    selection.left + selection.width - 1,
  ];
  const ys = [
    selection.top + selection.height / 2,
    selection.top + 1,
    selection.top + selection.height - 1,
  ];
  const points = new Map<string, [number, number]>();

  for (const x of xs) {
    for (const y of ys) {
      const clampedX = Math.max(0, Math.min(window.innerWidth - 1, x));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 1, y));
      points.set(`${Math.round(clampedX)},${Math.round(clampedY)}`, [clampedX, clampedY]);
    }
  }

  return [...points.values()];
}
