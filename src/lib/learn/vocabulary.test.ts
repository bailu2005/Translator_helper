import { describe, expect, it } from 'vitest';
import {
  mergeVocabulary,
  normalizeVocabulary,
  serializeVocabularyCsv,
  type VocabularyInput,
} from './vocabulary';

function input(overrides: Partial<VocabularyInput> = {}): VocabularyInput {
  return {
    surface: '食べる',
    reading: 'たべる',
    pos: '動詞',
    meaning: '吃',
    usage: '',
    example: '',
    source: '',
    translation: '',
    ...overrides,
  };
}

describe('mergeVocabulary', () => {
  it('adds a new entry at the front', () => {
    const entries = mergeVocabulary([], input());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.surface).toBe('食べる');
  });

  it('deduplicates by surface and reading and merges fields', () => {
    const first = mergeVocabulary([], input());
    const second = mergeVocabulary(
      first,
      input({ meaning: '', usage: 'ご飯を食べる', source: '食べる' }),
    );

    expect(second).toHaveLength(1);
    expect(second[0]?.meaning).toBe('吃');
    expect(second[0]?.usage).toBe('ご飯を食べる');
    expect(second[0]?.source).toBe('食べる');
  });

  it('keeps different readings as separate entries', () => {
    const first = mergeVocabulary([], input());
    const second = mergeVocabulary(first, input({ reading: 'くう' }));
    expect(second).toHaveLength(2);
  });
});

describe('normalizeVocabulary', () => {
  it('drops invalid entries and deduplicates', () => {
    const entries = normalizeVocabulary([
      { surface: '', reading: 'x' },
      { surface: '食べる', reading: 'たべる', meaning: '吃' },
      { surface: '食べる', reading: 'たべる', usage: 'ご飯を食べる' },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.usage).toBe('ご飯を食べる');
  });
});

describe('serializeVocabularyCsv', () => {
  it('quotes fields containing commas', () => {
    const entries = mergeVocabulary([], input({ meaning: '吃,喝' }));
    const csv = serializeVocabularyCsv(entries);
    expect(csv.split('\n')[1]).toContain('"吃,喝"');
  });
});
