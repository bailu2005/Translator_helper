import { normalizeServiceUrl } from '../ocr/service';

export interface TokenInfo {
  surface: string;
  reading: string;
  lemma: string;
  pos: string;
  form: string;
}

interface TokenizeResponse {
  tokens?: Partial<TokenInfo>[];
  durationMs?: number;
}

const TIMEOUT = 15000;

export async function tokenizeWithService(
  baseUrl: string,
  text: string,
): Promise<{ tokens: TokenInfo[]; durationMs: number }> {
  const url = normalizeServiceUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const started = performance.now();

  try {
    const response = await fetch(`${url}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `分词服务返回 ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }

    const data = (await response.json()) as TokenizeResponse;
    const tokens = Array.isArray(data.tokens)
      ? data.tokens.map(normalizeToken).filter((token): token is TokenInfo => token !== null)
      : [];

    return {
      tokens,
      durationMs:
        typeof data.durationMs === 'number'
          ? Math.round(data.durationMs)
          : Math.round(performance.now() - started),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('本地分词服务超时');
    }
    if (error instanceof TypeError) {
      throw new Error('本地分词服务不可用，请确认 ocr-service 已启动');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeToken(value: Partial<TokenInfo>): TokenInfo | null {
  const surface = text(value.surface);
  if (!surface) {
    return null;
  }

  return {
    surface,
    reading: text(value.reading),
    lemma: text(value.lemma),
    pos: text(value.pos),
    form: text(value.form),
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
