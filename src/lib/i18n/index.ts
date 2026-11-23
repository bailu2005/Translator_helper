import { isUiLang, MESSAGES, type MessageKey, type UiLang } from './messages';

export { isUiLang, MESSAGES, UI_LANGS, type MessageKey, type UiLang } from './messages';

export type TranslateParams = Record<string, string | number>;

export type Translator = (key: MessageKey, params?: TranslateParams) => string;

export function createTranslator(lang: UiLang = 'zh-CN'): Translator {
  const dictionary = MESSAGES[isUiLang(lang) ? lang : 'zh-CN'] ?? MESSAGES['zh-CN'];

  return (key, params) => {
    const template = dictionary[key] ?? MESSAGES['zh-CN'][key] ?? key;
    return interpolate(template, params);
  };
}

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function uiLanguageLabel(lang: UiLang): string {
  switch (lang) {
    case 'zh-TW':
      return '繁體中文';
    case 'en':
      return 'English';
    case 'zh-CN':
    default:
      return '简体中文';
  }
}

export type { MessageKey as I18nMessageKey };
