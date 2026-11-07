const TARGET_LONGEST_SIDE = 1200;
const MAX_UPSCALE = 2.5;
const PADDING = 16;
const CONTRAST = 1.6;
const INVERT_THRESHOLD = 110;

export function computeUpscale(width: number, height: number): number {
  const longest = Math.max(width, height);
  if (longest <= 0) {
    return 1;
  }
  return Math.min(MAX_UPSCALE, Math.max(1, TARGET_LONGEST_SIDE / longest));
}

export async function preprocessImage(source: string): Promise<HTMLCanvasElement | null> {
  const image = await loadImage(source);
  if (!image) {
    return null;
  }

  const scale = computeUpscale(image.naturalWidth, image.naturalHeight);
  const padding = Math.round(PADDING * scale);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width + padding * 2;
  canvas.height = height + padding * 2;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, padding, padding, width, height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  enhance(imageData);
  context.putImageData(imageData, 0, 0);

  return canvas;
}

function enhance(imageData: ImageData): void {
  const data = imageData.data;
  const pixelCount = data.length / 4;

  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    sum += luminance(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
  }

  const invert = sum / pixelCount < INVERT_THRESHOLD;
  const factor = (259 * (CONTRAST + 255)) / (255 * (259 - CONTRAST));

  for (let index = 0; index < data.length; index += 4) {
    let value = luminance(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
    if (invert) {
      value = 255 - value;
    }
    value = clamp(factor * (value - 128) + 128, 0, 255);

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
}

function luminance(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
