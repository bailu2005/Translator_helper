import { describe, expect, it } from 'vitest';
import { intersectRect, mapBackgroundRect, mapObjectFitRect, type Rect } from './geometry';

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height };
}

describe('intersectRect', () => {
  it('returns the overlapping area', () => {
    expect(intersectRect(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toEqual(rect(5, 5, 5, 5));
  });

  it('returns null when the rectangles do not overlap', () => {
    expect(intersectRect(rect(0, 0, 10, 10), rect(20, 20, 5, 5))).toBeNull();
  });
});

describe('mapObjectFitRect', () => {
  it('maps a fill image', () => {
    expect(mapObjectFitRect(rect(25, 25, 50, 50), rect(0, 0, 100, 100), 200, 200, 'fill')).toEqual({
      sx: 50,
      sy: 50,
      sw: 100,
      sh: 100,
    });
  });

  it('maps a contain image with letterboxing', () => {
    expect(
      mapObjectFitRect(rect(50, 50, 10, 10), rect(0, 0, 100, 100), 200, 100, 'contain'),
    ).toEqual({ sx: 100, sy: 50, sw: 20, sh: 20 });
  });

  it('maps a cover image with cropping', () => {
    expect(mapObjectFitRect(rect(40, 40, 20, 20), rect(0, 0, 100, 100), 200, 100, 'cover')).toEqual(
      { sx: 90, sy: 40, sw: 20, sh: 20 },
    );
  });

  it('maps a natural-size image', () => {
    expect(mapObjectFitRect(rect(25, 25, 50, 50), rect(0, 0, 100, 100), 50, 50, 'none')).toEqual({
      sx: 0,
      sy: 0,
      sw: 50,
      sh: 50,
    });
  });

  it('returns null when the selection misses the rendered content', () => {
    expect(mapObjectFitRect(rect(0, 0, 10, 10), rect(0, 0, 100, 100), 50, 50, 'none')).toBeNull();
  });
});

describe('mapBackgroundRect', () => {
  it('maps a cover background centered in the box', () => {
    expect(
      mapBackgroundRect(rect(0, 0, 100, 100), rect(0, 0, 100, 100), 200, 100, 'cover', '50% 50%'),
    ).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 });
  });

  it('maps a contain background centered in the box', () => {
    expect(
      mapBackgroundRect(rect(50, 50, 10, 10), rect(0, 0, 100, 100), 200, 100, 'contain', '50% 50%'),
    ).toEqual({ sx: 100, sy: 50, sw: 20, sh: 20 });
  });
});
