export type TranslationProviderSetting = 'auto' | 'chrome' | 'mymemory' | 'llm';

export interface TranslationContext {
  source: string;
  translation?: string;
}

export interface GlossaryEntry {
  source: string;
  target: string;
}

export type TranslationProgressListener = (status: string) => void;

export interface TranslationInput {
  text: string;
  sourceLang: 'ja';
  targetLang: string;
  context?: TranslationContext[];
  glossary?: GlossaryEntry[];
  onProgress?: TranslationProgressListener;
  onToken?: (text: string) => void;
}

export interface TranslationResult {
  text: string;
  engine: string;
  durationMs: number;
}

export interface TranslationProvider {
  id: string;
  name: string;
  translate(input: TranslationInput): Promise<TranslationResult>;
}

export function targetLanguageLabel(targetLang: string): string {
  return targetLang === 'zh-TW' ? '繁體中文' : '简体中文';
}
