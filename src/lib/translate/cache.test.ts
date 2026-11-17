import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { buildTranslationCacheKey, hashText } from './cache';

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('hashText', () => {
  it('is stable and distinguishes different text', () => {
    expect(hashText('こんにちは')).toBe(hashText('こんにちは'));
    expect(hashText('こんにちは')).not.toBe(hashText('こんばんは'));
  });
});

describe('buildTranslationCacheKey', () => {
  it('changes with the target language', () => {
    const simplified = buildTranslationCacheKey('こんにちは', 'zh-CN', settings());
    const traditional = buildTranslationCacheKey('こんにちは', 'zh-TW', settings());
    expect(simplified).not.toBe(traditional);
  });

  it('changes when the auto LLM model changes', () => {
    const first = buildTranslationCacheKey(
      'こんにちは',
      'zh-CN',
      settings({ llmModel: 'model-a' }),
    );
    const second = buildTranslationCacheKey(
      'こんにちは',
      'zh-CN',
      settings({ llmModel: 'model-b' }),
    );
    expect(first).not.toBe(second);
  });
});
