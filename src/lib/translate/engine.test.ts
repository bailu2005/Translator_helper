import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { buildTranslationChain } from './engine';

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function ids(overrides: Partial<Settings>): string[] {
  return buildTranslationChain(settings(overrides)).map((provider) => provider.id);
}

describe('buildTranslationChain', () => {
  it('uses Chrome then MyMemory in auto mode without LLM', () => {
    expect(ids({ translationProvider: 'auto', llmModel: '' })).toEqual(['chrome', 'mymemory']);
  });

  it('prefers a configured LLM in auto mode', () => {
    expect(ids({ translationProvider: 'auto', llmModel: 'gpt-4o-mini' })).toEqual([
      'llm',
      'chrome',
      'mymemory',
    ]);
  });

  it('respects explicit providers', () => {
    expect(ids({ translationProvider: 'mymemory' })).toEqual(['mymemory']);
    expect(ids({ translationProvider: 'chrome' })).toEqual(['chrome']);
    expect(ids({ translationProvider: 'llm' })).toEqual(['llm']);
  });
});
