import { describe, expect, it } from 'vitest';
import {
  applyHistoryMetaPatch,
  applyRemoveHistoryMeta,
  normalizeHistoryMeta,
  pruneHistoryMeta,
  type HistoryMetaMap,
} from './historyMeta';

describe('applyHistoryMetaPatch', () => {
  it('creates a new entry and merges later patches', () => {
    const first = applyHistoryMetaPatch({}, 1, { ocrText: 'こんにちは' }, 100);
    expect(first['1']!.ocrText).toBe('こんにちは');

    const second = applyHistoryMetaPatch(
      first,
      1,
      { translation: '你好', translationEngine: 'LLM' },
      200,
    );
    expect(second['1']).toMatchObject({
      ocrText: 'こんにちは',
      translation: '你好',
      translationEngine: 'LLM',
      updatedAt: 200,
    });
  });

  it('clears translation and learning when OCR text changes', () => {
    const withTranslation = applyHistoryMetaPatch(
      {},
      1,
      {
        ocrText: 'こんにちは',
        translation: '你好',
        learning: { mode: 'basic', tokens: [], engine: 'fugashi', updatedAt: 1 },
      },
      100,
    );

    const reOcred = applyHistoryMetaPatch(withTranslation, 1, { ocrText: 'こんばんは' }, 200);
    expect(reOcred['1']!.translation).toBeUndefined();
    expect(reOcred['1']!.learning).toBeUndefined();
    expect(reOcred['1']!.ocrText).toBe('こんばんは');
  });

  it('keeps translation when OCR text is unchanged', () => {
    const first = applyHistoryMetaPatch({}, 1, { ocrText: 'こんにちは', translation: '你好' }, 100);
    const second = applyHistoryMetaPatch(first, 1, { ocrText: 'こんにちは' }, 200);
    expect(second['1']!.translation).toBe('你好');
  });
});

describe('history metadata collection', () => {
  it('removes only the requested entry', () => {
    const map: HistoryMetaMap = {
      '2': { createdAt: 2, updatedAt: 1 },
      '1': { createdAt: 1, updatedAt: 1 },
    };
    expect(Object.keys(applyRemoveHistoryMeta(map, 2))).toEqual(['1']);
  });

  it('prunes to the newest entries', () => {
    const map: HistoryMetaMap = {};
    for (let i = 1; i <= 5; i += 1) {
      map[String(i)] = { createdAt: i, updatedAt: i };
    }
    expect(
      Object.values(pruneHistoryMeta(map, 3))
        .map((entry) => entry.createdAt)
        .sort((a, b) => b - a),
    ).toEqual([5, 4, 3]);
  });

  it('normalizes stored values and drops invalid entries', () => {
    const normalized = normalizeHistoryMeta({
      a: { createdAt: 2, ocrText: ' text ' },
      b: { nope: true },
      c: 'bad',
    });
    expect(Object.keys(normalized)).toEqual(['2']);
    expect(normalized['2']!.ocrText).toBe(' text ');
  });
});
