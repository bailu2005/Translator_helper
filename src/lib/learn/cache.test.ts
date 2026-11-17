import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { buildLearningCacheKey } from './cache';

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('buildLearningCacheKey', () => {
  it('changes with the translation', () => {
    const first = buildLearningCacheKey('日文', '译文A', 'zh-CN', settings());
    const second = buildLearningCacheKey('日文', '译文B', 'zh-CN', settings());
    expect(first).not.toBe(second);
  });

  it('changes with the LLM model', () => {
    const first = buildLearningCacheKey('日文', '译文', 'zh-CN', settings({ llmModel: 'a' }));
    const second = buildLearningCacheKey('日文', '译文', 'zh-CN', settings({ llmModel: 'b' }));
    expect(first).not.toBe(second);
  });

  it('changes with the glossary', () => {
    const first = buildLearningCacheKey('ルフィ', '路飞', 'zh-CN', settings(), [
      { source: 'ルフィ', target: '路飞' },
    ]);
    const second = buildLearningCacheKey('ルフィ', '路飞', 'zh-CN', settings(), [
      { source: 'ルフィ', target: '蒙奇·D·路飞' },
    ]);
    expect(first).not.toBe(second);
  });
});
