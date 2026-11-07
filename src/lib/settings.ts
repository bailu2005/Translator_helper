import type { OcrOrientation, ReadingOrder } from './ocr/order';

export interface Settings {
  sourceLang: string;
  targetLang: string;
  ocrOrientation: OcrOrientation;
  readingOrder: ReadingOrder;
}

export const DEFAULT_SETTINGS: Settings = {
  sourceLang: 'ja',
  targetLang: 'zh-CN',
  ocrOrientation: 'vertical',
  readingOrder: 'rtl',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  const partial = stored.settings as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...partial };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
