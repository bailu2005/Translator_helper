import { hashText } from '../translate/hash';

const VOCABULARY_KEY = 'vocabulary';

export interface VocabularyEntry {
  id: string;
  surface: string;
  reading: string;
  pos: string;
  meaning: string;
  usage: string;
  example: string;
  source: string;
  translation: string;
  createdAt: number;
}

export type VocabularyInput = Omit<VocabularyEntry, 'id' | 'createdAt'>;

export function vocabularyId(surface: string, reading: string): string {
  return hashText(`${surface}|${reading}`);
}

export async function loadVocabulary(): Promise<VocabularyEntry[]> {
  try {
    const stored = await browser.storage.local.get(VOCABULARY_KEY);
    return normalizeVocabulary(stored[VOCABULARY_KEY]);
  } catch {
    return [];
  }
}

export async function saveVocabulary(entries: VocabularyEntry[]): Promise<void> {
  await browser.storage.local.set({ [VOCABULARY_KEY]: normalizeVocabulary(entries) });
}

export async function addVocabularyEntry(input: VocabularyInput): Promise<VocabularyEntry[]> {
  const current = await loadVocabulary();
  const next = mergeVocabulary(current, input);
  await saveVocabulary(next);
  return next;
}

export async function removeVocabularyEntry(id: string): Promise<VocabularyEntry[]> {
  const current = await loadVocabulary();
  const next = current.filter((entry) => entry.id !== id);
  await saveVocabulary(next);
  return next;
}

export async function clearVocabulary(): Promise<void> {
  await browser.storage.local.remove(VOCABULARY_KEY);
}

export function normalizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const map = new Map<string, VocabularyEntry>();
  for (const item of value) {
    const entry = normalizeEntry(item);
    if (!entry) {
      continue;
    }
    const existing = map.get(entry.id);
    map.set(entry.id, existing ? mergeEntry(existing, entry) : entry);
  }

  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function mergeVocabulary(
  entries: VocabularyEntry[],
  input: VocabularyInput,
): VocabularyEntry[] {
  const id = vocabularyId(input.surface, input.reading);
  const existing = entries.find((entry) => entry.id === id);
  const now = Date.now();

  if (!existing) {
    return [{ id, ...normalizeInput(input), createdAt: now }, ...entries];
  }

  const updated: VocabularyEntry = {
    ...existing,
    pos: input.pos || existing.pos,
    meaning: input.meaning || existing.meaning,
    usage: input.usage || existing.usage,
    example: input.example || existing.example,
    source: input.source || existing.source,
    translation: input.translation || existing.translation,
    createdAt: now,
  };
  return [updated, ...entries.filter((entry) => entry.id !== id)];
}

export function serializeVocabularyCsv(entries: VocabularyEntry[]): string {
  const header = [
    'surface',
    'reading',
    'pos',
    'meaning',
    'usage',
    'example',
    'source',
    'translation',
    'createdAt',
  ];
  const rows = entries.map((entry) =>
    [
      entry.surface,
      entry.reading,
      entry.pos,
      entry.meaning,
      entry.usage,
      entry.example,
      entry.source,
      entry.translation,
      String(entry.createdAt),
    ]
      .map(quote)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

export function serializeVocabularyJson(entries: VocabularyEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

function normalizeEntry(value: unknown): VocabularyEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const surface = text(record.surface);
  if (!surface) {
    return null;
  }
  const reading = text(record.reading);

  return {
    id: text(record.id) || vocabularyId(surface, reading),
    surface,
    reading,
    pos: text(record.pos),
    meaning: text(record.meaning),
    usage: text(record.usage),
    example: text(record.example),
    source: text(record.source),
    translation: text(record.translation),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
  };
}

function normalizeInput(input: VocabularyInput): Omit<VocabularyEntry, 'id' | 'createdAt'> {
  return {
    surface: text(input.surface),
    reading: text(input.reading),
    pos: text(input.pos),
    meaning: text(input.meaning),
    usage: text(input.usage),
    example: text(input.example),
    source: text(input.source),
    translation: text(input.translation),
  };
}

function mergeEntry(existing: VocabularyEntry, incoming: VocabularyEntry): VocabularyEntry {
  return {
    ...existing,
    pos: incoming.pos || existing.pos,
    meaning: incoming.meaning || existing.meaning,
    usage: incoming.usage || existing.usage,
    example: incoming.example || existing.example,
    source: incoming.source || existing.source,
    translation: incoming.translation || existing.translation,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function quote(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
