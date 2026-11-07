import * as Tesseract from 'tesseract.js';
import { extractLines, orderLines, type OcrOrientation, type ReadingOrder } from './order';
import { preprocessImage } from './preprocess';
import { normalizeJapaneseText } from './text';
import type { OcrOptions, OcrProgressListener, OcrProvider, OcrResult } from './types';

const WORKER_ASSETS = 'tesseract';
const LANG_DATA = 'tessdata';
const MIN_CONFIDENCE = 55;

let workerPromise: Promise<Tesseract.Worker> | null = null;
let workerLanguage: string | null = null;
let activeProgress: OcrProgressListener | null = null;
let queue: Promise<unknown> = Promise.resolve();

function assetUrl(path: string): string {
  return browser.runtime.getURL(path);
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function getWorker(language: string): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
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
      .then((worker) => {
        workerLanguage = language;
        return worker;
      })
      .catch((error: unknown) => {
        workerPromise = null;
        workerLanguage = null;
        throw error;
      });
  }

  const worker = await workerPromise;
  if (workerLanguage !== language) {
    await worker.reinitialize(language, Tesseract.OEM.LSTM_ONLY);
    workerLanguage = language;
  }
  return worker;
}

interface AttemptResult {
  text: string;
  confidence: number;
  psm: Tesseract.PSM;
}

async function recognizeAttempt(
  worker: Tesseract.Worker,
  image: HTMLCanvasElement,
  psm: Tesseract.PSM,
  orientation: OcrOrientation,
  readingOrder: ReadingOrder,
): Promise<AttemptResult> {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const lines = extractLines(data.blocks);
  const ordered = orderLines(lines, orientation, readingOrder);
  const text = ordered.length ? ordered.map((line) => line.text).join('\n') : (data.text ?? '');

  return {
    text: normalizeJapaneseText(text),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    psm,
  };
}

async function recognizeInternal(image: string, options?: OcrOptions): Promise<OcrResult> {
  const startedAt = performance.now();
  const orientation = options?.orientation ?? 'vertical';
  const readingOrder = options?.readingOrder ?? (orientation === 'vertical' ? 'rtl' : 'ltr');
  const language = orientation === 'vertical' ? 'jpn_vert' : 'jpn';
  const primaryPsm =
    orientation === 'vertical' ? Tesseract.PSM.SINGLE_BLOCK_VERT_TEXT : Tesseract.PSM.SINGLE_BLOCK;

  activeProgress = options?.onProgress ?? null;

  try {
    const worker = await getWorker(language);
    const preprocessed = await preprocessImage(image);
    if (!preprocessed) {
      throw new Error('图像预处理失败');
    }

    let best = await recognizeAttempt(worker, preprocessed, primaryPsm, orientation, readingOrder);

    if (best.confidence < MIN_CONFIDENCE) {
      const retry = await recognizeAttempt(
        worker,
        preprocessed,
        Tesseract.PSM.AUTO,
        orientation,
        readingOrder,
      );
      if (retry.confidence > best.confidence) {
        best = retry;
      }
    }

    return {
      text: best.text,
      confidence: best.confidence,
      engine: `tesseract.js (${language}, psm ${best.psm})`,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    activeProgress = null;
  }
}

export const tesseractOcrProvider: OcrProvider = {
  id: 'tesseract-jpn',
  name: 'Tesseract.js 日文 OCR',
  recognize(image, options) {
    return enqueue(() => recognizeInternal(image, options));
  },
};
