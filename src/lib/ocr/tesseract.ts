import * as Tesseract from 'tesseract.js';
import { normalizeJapaneseText } from './text';
import type { OcrProgressListener, OcrProvider, OcrResult } from './types';

const LANGUAGE = 'jpn_vert';
const WORKER_ASSETS = 'tesseract';
const LANG_DATA = 'tessdata';

let workerPromise: Promise<Tesseract.Worker> | null = null;
let activeProgress: OcrProgressListener | null = null;

function assetUrl(path: string): string {
  return browser.runtime.getURL(path);
}

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(LANGUAGE, Tesseract.OEM.LSTM_ONLY, {
      workerPath: assetUrl(`${WORKER_ASSETS}/worker.min.js`),
      corePath: assetUrl(`${WORKER_ASSETS}/tesseract-core-simd-lstm.wasm.js`),
      langPath: assetUrl(LANG_DATA),
      workerBlobURL: false,
      gzip: true,
      logger: (message) => {
        activeProgress?.({
          status: String(message.status ?? ''),
          progress: typeof message.progress === 'number' ? message.progress : 0,
        });
      },
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK_VERT_TEXT,
        });
        return worker;
      })
      .catch((error: unknown) => {
        workerPromise = null;
        throw error;
      });
  }

  return workerPromise;
}

export const tesseractOcrProvider: OcrProvider = {
  id: 'tesseract-jpn-vert',
  name: 'Tesseract.js 日文竖排',

  async recognize(image, options): Promise<OcrResult> {
    const startedAt = performance.now();
    activeProgress = options?.onProgress ?? null;

    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(image);

      return {
        text: normalizeJapaneseText(data.text ?? ''),
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        engine: 'tesseract.js',
        durationMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      activeProgress = null;
    }
  },
};
