export interface Settings {
  sourceLang: string;
  targetLang: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sourceLang: 'ja',
  targetLang: 'zh-CN',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  const partial = stored.settings as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...partial };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
