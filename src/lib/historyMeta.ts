import type { LearningCard } from './learn/types';
import type { TokenInfo } from './learn/tokenize';

const META_KEY = 'historyMeta';
export const MAX_META = 50;

export interface LearningSnapshot {
  mode: 'llm' | 'basic';
  card?: LearningCard;
  tokens?: TokenInfo[];
  engine?: string;
  durationMs?: number;
  updatedAt: number;
}

export interface HistoryMeta {
  createdAt: number;
  ocrText?: string;
  ocrEngine?: string;
  ocrConfidence?: number | null;
  ocrDurationMs?: number;
  translation?: string;
  translationEngine?: string;
  translationDurationMs?: number;
  learning?: LearningSnapshot;
  updatedAt: number;
}

export type HistoryMetaMap = Record<string, HistoryMeta>;
export type HistoryMetaPatch = Partial<Omit<HistoryMeta, 'createdAt' | 'updatedAt'>>;

export async function loadHistoryMeta(): Promise<HistoryMetaMap> {
  try {
    const stored = await browser.storage.local.get(META_KEY);
    return normalizeHistoryMeta(stored[META_KEY]);
  } catch {
    return {};
  }
}

export async function saveHistoryMeta(map: HistoryMetaMap): Promise<void> {
  try {
    await browser.storage.local.set({ [META_KEY]: map });
  } catch {
    // history metadata is best-effort
  }
}

export async function upsertHistoryMeta(
  createdAt: number,
  patch: HistoryMetaPatch,
): Promise<HistoryMetaMap> {
  const current = await loadHistoryMeta();
  const next = applyHistoryMetaPatch(current, createdAt, patch);
  await saveHistoryMeta(next);
  return next;
}

export async function removeHistoryMeta(createdAt: number): Promise<HistoryMetaMap> {
  const current = await loadHistoryMeta();
  const next = applyRemoveHistoryMeta(current, createdAt);
  await saveHistoryMeta(next);
  return next;
}

export async function clearHistoryMeta(): Promise<void> {
  try {
    await browser.storage.local.remove(META_KEY);
  } catch {
    // history metadata is best-effort
  }
}

export function applyHistoryMetaPatch(
  map: HistoryMetaMap,
  createdAt: number,
  patch: HistoryMetaPatch,
  now: number = Date.now(),
): HistoryMetaMap {
  const key = String(createdAt);
  const previous = map[key] ?? { createdAt, updatedAt: now };
  let next: HistoryMeta = { ...previous, ...patch, createdAt, updatedAt: now };

  if (
    previous.ocrText !== undefined &&
    patch.ocrText !== undefined &&
    patch.ocrText !== previous.ocrText
  ) {
    next = {
      ...next,
      translation: undefined,
      translationEngine: undefined,
      translationDurationMs: undefined,
      learning: undefined,
    };
  }

  return pruneHistoryMeta({ ...map, [key]: next });
}

export function applyRemoveHistoryMeta(map: HistoryMetaMap, createdAt: number): HistoryMetaMap {
  const next = { ...map };
  delete next[String(createdAt)];
  return next;
}

export function pruneHistoryMeta(map: HistoryMetaMap, max: number = MAX_META): HistoryMetaMap {
  const entries = Object.values(map)
    .filter((item) => item && typeof item.createdAt === 'number')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, max);

  const next: HistoryMetaMap = {};
  for (const item of entries) {
    next[String(item.createdAt)] = item;
  }
  return next;
}

export function normalizeHistoryMeta(value: unknown): HistoryMetaMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const map: HistoryMetaMap = {};
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.createdAt !== 'number') {
      continue;
    }
    const entry: HistoryMeta = {
      createdAt: record.createdAt,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : record.createdAt,
      ocrText: textOrUndefined(record.ocrText),
      ocrEngine: textOrUndefined(record.ocrEngine),
      ocrConfidence:
        typeof record.ocrConfidence === 'number' || record.ocrConfidence === null
          ? record.ocrConfidence
          : undefined,
      ocrDurationMs: numberOrUndefined(record.ocrDurationMs),
      translation: textOrUndefined(record.translation),
      translationEngine: textOrUndefined(record.translationEngine),
      translationDurationMs: numberOrUndefined(record.translationDurationMs),
      learning: normalizeLearning(record.learning),
    };
    map[String(entry.createdAt)] = entry;
  }

  return pruneHistoryMeta(map);
}

function normalizeLearning(value: unknown): LearningSnapshot | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.mode !== 'llm' && record.mode !== 'basic') {
    return undefined;
  }

  return {
    mode: record.mode,
    card: isRecord(record.card)
      ? {
          words: Array.isArray(record.card.words)
            ? (record.card.words as LearningCard['words'])
            : [],
          grammar: Array.isArray(record.card.grammar)
            ? (record.card.grammar as LearningCard['grammar'])
            : [],
        }
      : undefined,
    tokens: Array.isArray(record.tokens) ? (record.tokens as TokenInfo[]) : undefined,
    engine: textOrUndefined(record.engine),
    durationMs: numberOrUndefined(record.durationMs),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
