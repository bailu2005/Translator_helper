import { describe, expect, it } from 'vitest';
import { splitTextForMyMemory } from './mymemory';

describe('splitTextForMyMemory', () => {
  it('keeps chunks within the byte limit and preserves text', () => {
    const text = 'こんにちは世界。元気ですか？'.repeat(20);
    const chunks = splitTextForMyMemory(text, 60);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(60);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('returns a single chunk for short text', () => {
    expect(splitTextForMyMemory('こんにちは', 480)).toEqual(['こんにちは']);
  });
});
