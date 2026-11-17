import type { Settings } from '../settings';
import { chromeTranslationProvider } from './chrome';
import { applyGlossaryToSource, restoreGlossary } from './glossary';
import { isLlmConfigured, translateWithLlm } from './llm';
import { myMemoryTranslationProvider } from './mymemory';
import type { TranslationInput, TranslationProvider, TranslationResult } from './types';

function llmProvider(settings: Settings): TranslationProvider {
  return {
    id: 'llm',
    name: 'LLM',
    translate: (input) =>
      translateWithLlm(input, {
        baseUrl: settings.llmBaseUrl,
        model: settings.llmModel,
        apiKey: settings.llmApiKey,
      }),
  };
}

function withGlossaryReplacement(provider: TranslationProvider): TranslationProvider {
  return {
    id: provider.id,
    name: provider.name,
    async translate(input) {
      if (!input.glossary?.length) {
        return provider.translate(input);
      }

      const prepared = applyGlossaryToSource(input.text, input.glossary);
      if (prepared.replacements.length === 0) {
        return provider.translate({ ...input, glossary: undefined });
      }

      const result = await provider.translate({
        ...input,
        text: prepared.text,
        glossary: undefined,
      });
      return { ...result, text: restoreGlossary(result.text, prepared.replacements) };
    },
  };
}

export function buildTranslationChain(settings: Settings): TranslationProvider[] {
  const llm = llmProvider(settings);
  const chrome = withGlossaryReplacement(chromeTranslationProvider);
  const myMemory = withGlossaryReplacement(myMemoryTranslationProvider);
  const llmConfigured = isLlmConfigured({
    baseUrl: settings.llmBaseUrl,
    model: settings.llmModel,
    apiKey: settings.llmApiKey,
  });

  switch (settings.translationProvider) {
    case 'chrome':
      return [chrome];
    case 'mymemory':
      return [myMemory];
    case 'llm':
      return [llm];
    case 'auto':
    default:
      return [...(llmConfigured ? [llm] : []), chrome, myMemory];
  }
}

export async function translateText(
  input: TranslationInput,
  settings: Settings,
): Promise<TranslationResult> {
  const chain = buildTranslationChain(settings);
  const errors: string[] = [];

  for (const provider of chain) {
    try {
      return await provider.translate(input);
    } catch (error) {
      errors.push(`${provider.name}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`翻译失败：${errors.join('；')}`);
}
