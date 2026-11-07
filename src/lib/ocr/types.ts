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

export interface OcrProvider {
  id: string;
  name: string;
  recognize(image: string, options?: { onProgress?: OcrProgressListener }): Promise<OcrResult>;
}
