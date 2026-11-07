import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'public/tesseract/worker.min.js'],
  [
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'public/tesseract/tesseract-core-simd-lstm.wasm.js',
  ],
  [
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm',
    'public/tesseract/tesseract-core-simd-lstm.wasm',
  ],
  [
    'node_modules/@tesseract.js-data/jpn_vert/4.0.0_best_int/jpn_vert.traineddata.gz',
    'public/tessdata/jpn_vert.traineddata.gz',
  ],
  [
    'node_modules/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz',
    'public/tessdata/jpn.traineddata.gz',
  ],
];

for (const [source, destination] of files) {
  const from = join(projectRoot, source);
  const to = join(projectRoot, destination);

  await mkdir(dirname(to), { recursive: true });

  try {
    await copyFile(from, to);
    const { size } = await stat(to);
    console.log(`${destination} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`Failed to copy ${source}`);
    throw error;
  }
}

console.log('OCR assets are ready.');
