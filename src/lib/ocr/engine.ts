import type { Settings } from '../settings';
import { recognizeWithService } from './service';
import { tesseractOcrProvider } from './tesseract';
import type { OcrOptions, OcrResult } from './types';

export interface SelectionRecognition {
  result: OcrResult;
  fallback: boolean;
  serviceError?: string;
}

export async function recognizeSelection(
  image: string,
  settings: Settings,
  options?: OcrOptions,
): Promise<SelectionRecognition> {
  if (settings.ocrEngine === 'auto') {
    try {
      const result = await recognizeWithService(settings.ocrServiceUrl, image, {
        onProgress: options?.onProgress,
      });
      return { result, fallback: false };
    } catch (error) {
      const serviceError = error instanceof Error ? error.message : String(error);
      const result = await tesseractOcrProvider.recognize(image, options);
      return { result, fallback: true, serviceError };
    }
  }

  const result = await tesseractOcrProvider.recognize(image, options);
  return { result, fallback: false };
}
