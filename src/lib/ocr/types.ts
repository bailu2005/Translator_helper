import type { OcrOrientation, ReadingOrder } from './order';

export interface OcrProgress {
  status: string;
  progress: number;
}

export type OcrProgressListener = (progress: OcrProgress) => void;

export interface OcrResult {
  text: string;
  confidence: number;
  engine: string;
  durationMs: number;
}

export interface OcrOptions {
  orientation?: OcrOrientation;
  readingOrder?: ReadingOrder;
  onProgress?: OcrProgressListener;
}

export interface OcrProvider {
  id: string;
  name: string;
  recognize(image: string, options?: OcrOptions): Promise<OcrResult>;
}
