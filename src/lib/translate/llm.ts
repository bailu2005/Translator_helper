import { selectGlossaryEntries } from './glossary';
import {
  targetLanguageLabel,
  type GlossaryEntry,
  type TranslationContext,
  type TranslationInput,
  type TranslationResult,
} from './types';

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const TIMEOUT = 60000;

export function isLlmConfigured(config: LlmConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.model.trim());
}

function formatContext(context?: TranslationContext[]): string {
  if (!context?.length) {
    return '';
  }

  return `上下文（按时间顺序，供参考）：\n${context
    .map(
      (item, index) =>
        `${index + 1}. ${item.source}${item.translation ? ` → ${item.translation}` : ''}`,
    )
    .join('\n')}`;
}

function formatGlossary(text: string, glossary?: GlossaryEntry[]): string {
  const entries = selectGlossaryEntries(text, glossary ?? []);
  if (entries.length === 0) {
    return '';
  }

  return `术语表（必须遵守）：\n${entries
    .map((entry) => `${entry.source} → ${entry.target}`)
    .join('\n')}`;
}

export async function translateWithLlm(
  input: TranslationInput,
  config: LlmConfig,
): Promise<TranslationResult> {
  if (!isLlmConfigured(config)) {
    throw new Error('LLM 未配置（需要 Base URL 与模型名）');
  }

  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const started = performance.now();
  const stream = Boolean(input.onToken);
  input.onProgress?.('LLM 翻译中');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0.2,
        max_tokens: 600,
        stream,
        messages: [
          {
            role: 'system',
            content: `你是日文漫画翻译助手。把日文翻译成${targetLanguageLabel(input.targetLang)}，口语化、保留语气和人物称呼，不要解释，只输出译文。`,
          },
          {
            role: 'user',
            content: [
              formatContext(input.context),
              formatGlossary(input.text, input.glossary),
              `日文：\n${input.text}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`LLM 返回 ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const engine = `LLM (${config.model.trim()})`;
    const contentType = response.headers.get('content-type') ?? '';

    if (input.onToken && stream && response.body && !contentType.includes('application/json')) {
      const streamed = await readSseStream(response.body, input.onToken);
      if (!streamed.trim()) {
        throw new Error('LLM 返回空结果');
      }
      return {
        text: streamed.trim(),
        engine,
        durationMs: Math.round(performance.now() - started),
      };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new Error('LLM 返回空结果');
    }

    return {
      text,
      engine,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('LLM 请求超时');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onToken: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              full += delta;
              onToken(full);
            }
          } catch {
            // ignore malformed SSE payloads
          }
        }
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }

  return full;
}
