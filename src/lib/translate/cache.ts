import type { Settings } from '../settings';
import type { TranslationResult } from './types';

const CACHE_KEY = 'translationCache';
const MAX_ENTRIES = 300;
const CACHE_VERSION = 1;

interface CacheEntry {
  key: string;
  result: TranslationResult;
  createdAt: number;
}

export function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function providerSignature(settings: Settings): string {
  if (settings.translationProvider === 'auto') {
    return `auto:${settings.llmBaseUrl}:${settings.llmModel}`;
  }
  return settings.translationProvider;
}

export function buildTranslationCacheKey(
  text: string,
  targetLang: string,
  settings: Settings,
): string {
  return `${CACHE_VERSION}:${hashText(`${text}|${targetLang}|${providerSignature(settings)}`)}`;
}

export async function getCachedTranslation(key: string): Promise<TranslationResult | null> {
  try {
    const stored = await browser.storage.local.get(CACHE_KEY);
    const entries = stored[CACHE_KEY] as CacheEntry[] | undefined;
    return entries?.find((entry) => entry.key === key)?.result ?? null;
  } catch {
    return null;
  }
}

export async function setCachedTranslation(key: string, result: TranslationResult): Promise<void> {
  try {
    const stored = await browser.storage.local.get(CACHE_KEY);
    const entries = (stored[CACHE_KEY] as CacheEntry[] | undefined) ?? [];
    const next = [
      { key, result, createdAt: Date.now() },
      ...entries.filter((entry) => entry.key !== key),
    ].slice(0, MAX_ENTRIES);
    await browser.storage.local.set({ [CACHE_KEY]: next });
  } catch {
    // cache is best-effort
  }
}

export async function deleteCachedTranslation(key: string): Promise<void> {
  try {
    const stored = await browser.storage.local.get(CACHE_KEY);
    const entries = (stored[CACHE_KEY] as CacheEntry[] | undefined) ?? [];
    await browser.storage.local.set({
      [CACHE_KEY]: entries.filter((entry) => entry.key !== key),
    });
  } catch {
    // cache is best-effort
  }
}
