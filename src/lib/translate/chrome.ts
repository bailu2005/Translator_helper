import {
  targetLanguageLabel,
  type TranslationInput,
  type TranslationProvider,
  type TranslationResult,
} from './types';

interface TranslatorAvailabilityOptions {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorCreateOptions extends TranslatorAvailabilityOptions {
  monitor?: (monitor: EventTarget) => void;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}

interface TranslatorApi {
  availability?(options: TranslatorAvailabilityOptions): Promise<string>;
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
}

const instances = new Map<string, Promise<TranslatorInstance>>();

function getApi(): TranslatorApi | null {
  return (globalThis as unknown as { Translator?: TranslatorApi }).Translator ?? null;
}

function chromeLanguage(targetLang: string): string {
  return targetLang === 'zh-TW' ? 'zh-Hant' : 'zh';
}

async function getTranslator(
  api: TranslatorApi,
  targetLang: string,
  onProgress?: (status: string) => void,
): Promise<TranslatorInstance> {
  const key = chromeLanguage(targetLang);
  let instance = instances.get(key);

  if (!instance) {
    instance = api.create({
      sourceLanguage: 'ja',
      targetLanguage: key,
      monitor: (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          const progress = event as ProgressEvent;
          if (progress.total > 0) {
            onProgress?.(
              `下载 Chrome 语言包 ${Math.round((progress.loaded / progress.total) * 100)}%`,
            );
          }
        });
      },
    });
    instances.set(key, instance);
    instance.catch(() => instances.delete(key));
  }

  return instance;
}

export const chromeTranslationProvider: TranslationProvider = {
  id: 'chrome',
  name: 'Chrome 内置翻译',

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const api = getApi();
    if (!api) {
      throw new Error('当前浏览器不支持内置翻译 API');
    }

    const target = chromeLanguage(input.targetLang);
    if (api.availability) {
      try {
        const availability = await api.availability({
          sourceLanguage: 'ja',
          targetLanguage: target,
        });
        if (availability === 'unavailable') {
          throw new Error(`内置翻译不支持 ja → ${targetLanguageLabel(input.targetLang)}`);
        }
        if (availability === 'downloadable' || availability === 'downloading') {
          input.onProgress?.('准备 Chrome 内置翻译（首次需下载语言包）');
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('内置翻译不支持')) {
          throw error;
        }
      }
    }

    input.onProgress?.('Chrome 内置翻译中');
    const started = performance.now();
    const translator = await getTranslator(api, input.targetLang, input.onProgress);
    const text = await translator.translate(input.text);

    return {
      text: text.trim(),
      engine: 'Chrome 内置翻译',
      durationMs: Math.round(performance.now() - started),
    };
  },
};
