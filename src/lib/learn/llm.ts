import { selectGlossaryEntries } from '../translate/glossary';
import { isLlmConfigured, type LlmConfig } from '../translate/llm';
import {
  targetLanguageLabel,
  type GlossaryEntry,
  type TranslationContext,
} from '../translate/types';
import type { LearningCard, LearningGrammar, LearningResult, LearningWord } from './types';

const TIMEOUT = 60000;
const MAX_WORDS = 8;
const MAX_GRAMMAR = 5;

export interface LearningInput {
  text: string;
  translation: string;
  targetLang: string;
  context?: TranslationContext[];
  glossary?: GlossaryEntry[];
}

export async function generateLearningCard(
  input: LearningInput,
  config: LlmConfig,
): Promise<LearningResult> {
  if (!isLlmConfigured(config)) {
    throw new Error('LLM 未配置（需要 Base URL 与模型名）');
  }

  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const started = performance.now();
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
        temperature: 0.3,
        max_tokens: 1600,
        messages: [
          {
            role: 'system',
            content:
              '你是日语学习助手，面向中文母语的日漫学习者。只输出 JSON，不要 Markdown、不要解释。',
          },
          { role: 'user', content: buildPrompt(input) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`LLM 返回 ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const card = parseLearningCard(data.choices?.[0]?.message?.content ?? '');
    if (!card) {
      throw new Error('学习卡解析失败');
    }

    return {
      card,
      engine: `LLM (${config.model.trim()})`,
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

export function parseLearningCard(content: string): LearningCard | null {
  const cleaned = content
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  return normalizeLearningCard(data);
}

function normalizeLearningCard(data: unknown): LearningCard | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as { words?: unknown; grammar?: unknown };
  const words = Array.isArray(record.words)
    ? record.words
        .map(normalizeWord)
        .filter((word): word is LearningWord => word !== null)
        .slice(0, MAX_WORDS)
    : [];
  const grammar = Array.isArray(record.grammar)
    ? record.grammar
        .map(normalizeGrammar)
        .filter((item): item is LearningGrammar => item !== null)
        .slice(0, MAX_GRAMMAR)
    : [];

  if (words.length === 0 && grammar.length === 0) {
    return null;
  }

  return { words, grammar };
}

function normalizeWord(value: unknown): LearningWord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const surface = text(record.surface);
  const meaning = text(record.meaning);
  if (!surface || !meaning) {
    return null;
  }

  return {
    surface,
    reading: text(record.reading),
    pos: text(record.pos),
    meaning,
    usage: text(record.usage),
    example: text(record.example),
  };
}

function normalizeGrammar(value: unknown): LearningGrammar | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const pattern = text(record.pattern);
  const meaning = text(record.meaning);
  if (!pattern || !meaning) {
    return null;
  }

  return {
    pattern,
    meaning,
    nuance: text(record.nuance),
    example: text(record.example),
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildPrompt(input: LearningInput): string {
  const context = input.context?.length
    ? `上下文（按时间顺序，供参考）：\n${input.context
        .map(
          (item, index) =>
            `${index + 1}. ${item.source}${item.translation ? ` → ${item.translation}` : ''}`,
        )
        .join('\n')}`
    : '';
  const glossaryEntries = selectGlossaryEntries(input.text, input.glossary ?? []);
  const glossary = glossaryEntries.length
    ? `术语表：\n${glossaryEntries.map((entry) => `${entry.source} → ${entry.target}`).join('\n')}`
    : '';

  return [
    `日文：${input.text}`,
    `参考译文（${targetLanguageLabel(input.targetLang)}）：${input.translation}`,
    context,
    glossary,
    '请输出 JSON：{"words":[{"surface":"","reading":"平假名","pos":"词性","meaning":"中文释义","usage":"用法/搭配","example":"日文例句 / 中文翻译"}],"grammar":[{"pattern":"句式","meaning":"含义","nuance":"语感","example":"例句"}]}',
    '只讲解句中实际出现的 3-5 个重点词和 1-3 个语法点；不确定就省略；不要编造读音。',
  ]
    .filter(Boolean)
    .join('\n\n');
}
