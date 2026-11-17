import { normalizeJapaneseText } from './text';
import type { OcrProgressListener, OcrResult } from './types';

export interface ServiceStatus {
  available: boolean;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8765';
const HEALTH_TIMEOUT = 1500;
const OCR_TIMEOUT = 120000;

export function normalizeServiceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_SERVICE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

export async function checkOcrService(baseUrl: string): Promise<ServiceStatus> {
  const url = normalizeServiceUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

  try {
    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { available: false, ready: false, loading: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      ready?: boolean;
      loading?: boolean;
      error?: string | null;
    };

    return {
      available: true,
      ready: Boolean(data.ready),
      loading: Boolean(data.loading),
      error: data.error ?? undefined,
    };
  } catch (error) {
    return {
      available: false,
      ready: false,
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function recognizeWithService(
  baseUrl: string,
  image: string,
  options?: { onProgress?: OcrProgressListener },
): Promise<OcrResult> {
  const url = normalizeServiceUrl(baseUrl);
  options?.onProgress?.({ status: '本地 manga-ocr 识别中', progress: -1 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT);

  try {
    const response = await fetch(`${url}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `OCR 服务返回 ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }

    const data = (await response.json()) as { text?: string; durationMs?: number };

    return {
      text: normalizeJapaneseText(data.text ?? ''),
      confidence: null,
      engine: 'manga-ocr (local)',
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('本地 manga-ocr 服务超时');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
