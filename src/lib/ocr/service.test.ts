import { describe, expect, it } from 'vitest';
import { normalizeServiceUrl } from './service';

describe('normalizeServiceUrl', () => {
  it('trims and strips trailing slashes', () => {
    expect(normalizeServiceUrl(' http://127.0.0.1:8765/ ')).toBe('http://127.0.0.1:8765');
  });

  it('falls back to the default URL when empty', () => {
    expect(normalizeServiceUrl('   ')).toBe('http://127.0.0.1:8765');
  });
});
