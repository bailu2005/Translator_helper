import { hashText } from './hash';
import type { GlossaryEntry } from './types';

const GLOSSARY_KEY = 'glossary';
const MAX_LLM_ENTRIES = 20;

export interface GlossaryReplacement {
  token: string;
  target: string;
}

export async function loadGlossary(): Promise<GlossaryEntry[]> {
  try {
    const stored = await browser.storage.local.get(GLOSSARY_KEY);
    return normalizeGlossary(stored[GLOSSARY_KEY]);
  } catch {
    return [];
  }
}

export async function saveGlossary(entries: GlossaryEntry[]): Promise<void> {
  await browser.storage.local.set({ [GLOSSARY_KEY]: normalizeGlossary(entries) });
}

export async function clearGlossary(): Promise<void> {
  await browser.storage.local.remove(GLOSSARY_KEY);
}

export function normalizeGlossary(value: unknown): GlossaryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries = new Map<string, string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const source = String((item as { source?: unknown }).source ?? '').trim();
    const target = String((item as { target?: unknown }).target ?? '').trim();
    if (source && target) {
      entries.set(source, target);
    }
  }

  return [...entries.entries()].map(([source, target]) => ({ source, target }));
}

export function parseGlossary(input: string): GlossaryEntry[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return normalizeGlossaryFromJson(JSON.parse(trimmed));
    } catch {
      // fall through to delimited parsing
    }
  }

  return parseDelimited(trimmed);
}

export function serializeGlossaryCsv(entries: GlossaryEntry[]): string {
  return entries.map((entry) => `${quote(entry.source)},${quote(entry.target)}`).join('\n');
}

export function glossaryFingerprint(entries: GlossaryEntry[]): string {
  if (entries.length === 0) {
    return 'none';
  }
  const normalized = entries
    .map((entry) => `${entry.source}\u0000${entry.target}`)
    .sort()
    .join('\u0001');
  return hashText(normalized);
}

export function selectGlossaryEntries(
  text: string,
  glossary: GlossaryEntry[],
  limit = MAX_LLM_ENTRIES,
): GlossaryEntry[] {
  const seen = new Set<string>();
  return glossary
    .filter((entry) => entry.source && text.includes(entry.source))
    .sort((a, b) => b.source.length - a.source.length)
    .filter((entry) => {
      if (seen.has(entry.source)) {
        return false;
      }
      seen.add(entry.source);
      return true;
    })
    .slice(0, limit);
}

export function applyGlossaryToSource(
  text: string,
  glossary: GlossaryEntry[],
): { text: string; replacements: GlossaryReplacement[] } {
  const relevant = selectGlossaryEntries(text, glossary);
  const replacements: GlossaryReplacement[] = [];
  let result = text;

  relevant.forEach((entry, index) => {
    if (!result.includes(entry.source)) {
      return;
    }
    const token = `[[${index + 1}]]`;
    result = result.split(entry.source).join(token);
    replacements.push({ token, target: entry.target });
  });

  return { text: result, replacements };
}

export function restoreGlossary(text: string, replacements: GlossaryReplacement[]): string {
  let result = text;
  for (const { token, target } of replacements) {
    result = replaceToken(result, token, target);
  }
  return result;
}

function replaceToken(text: string, token: string, target: string): string {
  if (text.includes(token)) {
    return text.split(token).join(target);
  }

  const pattern = token
    .split('')
    .map((char) => escapeRegExp(char))
    .join('\\s*');
  return text.replace(new RegExp(pattern, 'g'), target);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeGlossaryFromJson(data: unknown): GlossaryEntry[] {
  if (Array.isArray(data)) {
    return normalizeGlossary(data);
  }

  if (data && typeof data === 'object') {
    return normalizeGlossary(
      Object.entries(data as Record<string, unknown>).map(([source, target]) => ({
        source,
        target: String(target ?? ''),
      })),
    );
  }

  return [];
}

function parseDelimited(input: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const fields = line.includes('\t') ? line.split('\t') : parseCsvLine(line);
    const source = (fields[0] ?? '').trim();
    const target = (fields[1] ?? '').trim();
    if (source && target && !isHeader(source, target)) {
      entries.push({ source, target });
    }
  }

  return normalizeGlossary(entries);
}

function isHeader(source: string, target: string): boolean {
  return /^(source|原文|日文)$/i.test(source) && /^(target|译文|中文)$/i.test(target);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function quote(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
