import { describe, expect, it } from 'vitest';
import {
  applyGlossaryToSource,
  parseGlossary,
  restoreGlossary,
  selectGlossaryEntries,
  serializeGlossaryCsv,
} from './glossary';

describe('parseGlossary', () => {
  it('parses CSV', () => {
    expect(parseGlossary('ルフィ,路飞\nナミ,娜美')).toEqual([
      { source: 'ルフィ', target: '路飞' },
      { source: 'ナミ', target: '娜美' },
    ]);
  });

  it('parses quoted CSV', () => {
    expect(parseGlossary('"ル,フィ","路,飞"')).toEqual([{ source: 'ル,フィ', target: '路,飞' }]);
  });

  it('parses TSV', () => {
    expect(parseGlossary('ルフィ\t路飞')).toEqual([{ source: 'ルフィ', target: '路飞' }]);
  });

  it('parses a JSON array', () => {
    expect(parseGlossary('[{"source":"ルフィ","target":"路飞"}]')).toEqual([
      { source: 'ルフィ', target: '路飞' },
    ]);
  });

  it('parses a JSON object map', () => {
    expect(parseGlossary('{"ルフィ":"路飞"}')).toEqual([{ source: 'ルフィ', target: '路飞' }]);
  });

  it('ignores comments and empty lines', () => {
    expect(parseGlossary('# comment\n\nルフィ,路飞')).toEqual([
      { source: 'ルフィ', target: '路飞' },
    ]);
  });

  it('skips a header row', () => {
    expect(parseGlossary('source,target\nルフィ,路飞')).toEqual([
      { source: 'ルフィ', target: '路飞' },
    ]);
  });
});

describe('applyGlossaryToSource', () => {
  it('replaces the longest term first', () => {
    const prepared = applyGlossaryToSource('ルフィーとルフィ', [
      { source: 'ルフィ', target: '路飞' },
      { source: 'ルフィー', target: '路飞2' },
    ]);

    expect(prepared.text).toBe('[[1]]と[[2]]');
    expect(restoreGlossary(prepared.text, prepared.replacements)).toBe('路飞2と路飞');
  });

  it('restores placeholders even with inserted spaces', () => {
    const prepared = applyGlossaryToSource('ルフィ', [{ source: 'ルフィ', target: '路飞' }]);
    expect(restoreGlossary('[[ 1 ]]', prepared.replacements)).toBe('路飞');
  });
});

describe('selectGlossaryEntries', () => {
  it('filters by presence in the text', () => {
    const entries = [
      { source: 'ルフィ', target: '路飞' },
      { source: 'ナミ', target: '娜美' },
    ];

    expect(selectGlossaryEntries('ルフィ', entries).map((entry) => entry.source)).toEqual([
      'ルフィ',
    ]);
  });
});

describe('serializeGlossaryCsv', () => {
  it('quotes fields containing commas', () => {
    expect(serializeGlossaryCsv([{ source: 'ル,フィ', target: '路飞' }])).toBe('"ル,フィ",路飞');
  });
});
