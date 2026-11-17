import type { OcrOrientation, ReadingOrder } from './ocr/order';
import type { TranslationProviderSetting } from './translate/types';

export type OcrEngineSetting = 'auto' | 'tesseract';

export interface Settings {
  sourceLang: string;
  targetLang: string;
  ocrOrientation: OcrOrientation;
  readingOrder: ReadingOrder;
  ocrEngine: OcrEngineSetting;
  ocrServiceUrl: string;
  translationProvider: TranslationProviderSetting;
  autoTranslate: boolean;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sourceLang: 'ja',
  targetLang: 'zh-CN',
  ocrOrientation: 'vertical',
  readingOrder: 'rtl',
  ocrEngine: 'auto',
  ocrServiceUrl: 'http://127.0.0.1:8765',
  translationProvider: 'auto',
  autoTranslate: true,
  llmBaseUrl: 'https://api.openai.com/v1',
  llmModel: '',
  llmApiKey: '',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  const partial = stored.settings as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...partial };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
