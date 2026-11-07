import { describe, expect, it } from 'vitest';
import { normalizeJapaneseText } from './text';

describe('normalizeJapaneseText', () => {
  it('normalizes newlines and removes empty lines', () => {
    expect(normalizeJapaneseText('こんにちは\r\n\r\n元気ですか')).toBe('こんにちは\n元気ですか');
  });

  it('collapses spaces and full-width spaces', () => {
    expect(normalizeJapaneseText('  こんにちは\u3000\u3000世界  ')).toBe('こんにちは 世界');
  });

  it('keeps vertical text columns on separate lines', () => {
    expect(normalizeJapaneseText('こんにちは\n元気ですか')).toBe('こんにちは\n元気ですか');
  });
});
