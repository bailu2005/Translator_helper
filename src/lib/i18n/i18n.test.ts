import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../errors';
import { createTranslator, interpolate, isUiLang, MESSAGES, UI_LANGS } from './index';

describe('i18n messages', () => {
  it('provides the same keys for every language', () => {
    const baseKeys = Object.keys(MESSAGES['zh-CN']).sort();
    for (const lang of UI_LANGS) {
      expect(Object.keys(MESSAGES[lang]).sort()).toEqual(baseKeys);
    }
  });

  it('provides title and hint text for every error code', () => {
    for (const lang of UI_LANGS) {
      for (const code of ERROR_CODES) {
        expect(
          MESSAGES[lang][`error.title.${code}` as keyof (typeof MESSAGES)['zh-CN']],
        ).toBeTruthy();
        expect(
          MESSAGES[lang][`error.hint.${code}` as keyof (typeof MESSAGES)['zh-CN']],
        ).toBeTruthy();
      }
    }
  });

  it('interpolates named parameters', () => {
    expect(interpolate('已截取 {width}×{height}', { width: 10, height: 20 })).toBe('已截取 10×20');
    expect(interpolate('keep {missing}')).toBe('keep {missing}');
  });

  it('creates a translator per language', () => {
    expect(createTranslator('en')('startSelection')).toBe('Start selection');
    expect(createTranslator('zh-CN')('startSelection')).toBe('开始框选');
    expect(createTranslator('zh-TW')('startSelection')).toBe('開始框選');
  });

  it('validates language codes', () => {
    expect(isUiLang('en')).toBe(true);
    expect(isUiLang('ja')).toBe(false);
  });
});
