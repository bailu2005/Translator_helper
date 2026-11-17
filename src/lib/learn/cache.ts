import type { Settings } from '../settings';
import { glossaryFingerprint } from '../translate/glossary';
import { hashText } from '../translate/hash';
import type { GlossaryEntry } from '../translate/types';
import type { LearningResult } from './types';

const CACHE_KEY = 'learningCache';
const MAX_ENTRIES = 200;
const CACHE_VERSION = 1;

interface CacheEntry {
  key: string;
  result: LearningResult;
  createdAt: number;
}

export function buildLearningCacheKey(
  text: string,
  translation: string,
  targetLang: string,
  settings: Settings,
  glossary: GlossaryEntry[] = [],
): string {
  const signature = `${settings.llmBaseUrl}|${settings.llmModel}|${glossaryFingerprint(glossary)}`;
  return `${CACHE_VERSION}:${hashText(`${text}|${translation}|${targetLang}|${signature}`)}`;
}

export async function getCachedLearningCard(key: string): Promise<LearningResult | null> {
  try {
    const stored = await browser.storage.local.get(CACHE_KEY);
    const entries = stored[CACHE_KEY] as CacheEntry[] | undefined;
    return entries?.find((entry) => entry.key === key)?.result ?? null;
  } catch {
    return null;
  }
}

export async function setCachedLearningCard(key: string, result: LearningResult): Promise<void> {
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

export async function deleteCachedLearningCard(key: string): Promise<void> {
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
