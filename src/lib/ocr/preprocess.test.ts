import { describe, expect, it } from 'vitest';
import { computeUpscale } from './preprocess';

describe('computeUpscale', () => {
  it('upscales small crops', () => {
    expect(computeUpscale(300, 400)).toBe(2.5);
  });

  it('upscales medium crops', () => {
    expect(computeUpscale(1000, 500)).toBeCloseTo(1.2);
  });

  it('leaves large crops unchanged', () => {
    expect(computeUpscale(2000, 2000)).toBe(1);
  });

  it('handles empty sizes', () => {
    expect(computeUpscale(0, 0)).toBe(1);
  });
});
