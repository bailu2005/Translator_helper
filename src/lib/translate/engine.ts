import type { Settings } from '../settings';
import { chromeTranslationProvider } from './chrome';
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

export function buildTranslationChain(settings: Settings): TranslationProvider[] {
  const llm = llmProvider(settings);
  const llmConfigured = isLlmConfigured({
    baseUrl: settings.llmBaseUrl,
    model: settings.llmModel,
    apiKey: settings.llmApiKey,
  });

  switch (settings.translationProvider) {
    case 'chrome':
      return [chromeTranslationProvider];
    case 'mymemory':
      return [myMemoryTranslationProvider];
    case 'llm':
      return [llm];
    case 'auto':
    default:
      return [
        ...(llmConfigured ? [llm] : []),
        chromeTranslationProvider,
        myMemoryTranslationProvider,
      ];
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
