import type { TranslationInput, TranslationProvider, TranslationResult } from './types';

const MAX_BYTES = 480;
const TIMEOUT = 20000;

export function splitTextForMyMemory(text: string, maxBytes = MAX_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const char of text) {
    const candidate = current + char;
    if (new TextEncoder().encode(candidate).length > maxBytes && current) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [''];
}

function decodeEntities(value: string): string {
  if (typeof document === 'undefined') {
    return value;
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

async function translateChunk(chunk: string, targetLang: string): Promise<string> {
  const params = new URLSearchParams({
    q: chunk,
    langpair: `ja|${targetLang}`,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`MyMemory HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
      responseDetails?: string;
    };

    const status = Number(data.responseStatus ?? 0);
    if (status !== 200) {
      throw new Error(`MyMemory 错误：${data.responseDetails ?? status}`);
    }

    const translated = data.responseData?.translatedText ?? '';
    if (!translated) {
      throw new Error('MyMemory 返回空结果');
    }
    if (translated.includes('MYMEMORY WARNING')) {
      throw new Error('MyMemory 配额已用尽');
    }

    return decodeEntities(translated);
  } finally {
    clearTimeout(timer);
  }
}

export const myMemoryTranslationProvider: TranslationProvider = {
  id: 'mymemory',
  name: 'MyMemory',

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const started = performance.now();
    input.onProgress?.('MyMemory 翻译中');

    const chunks = splitTextForMyMemory(input.text);
    const translations: string[] = [];
    for (const chunk of chunks) {
      translations.push(await translateChunk(chunk, input.targetLang));
    }

    return {
      text: translations.join(''),
      engine: 'MyMemory',
      durationMs: Math.round(performance.now() - started),
    };
  },
};
