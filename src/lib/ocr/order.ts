export type OcrOrientation = 'vertical' | 'horizontal';
export type ReadingOrder = 'rtl' | 'ltr';

export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: OcrBbox;
}

interface LineLike {
  text?: string;
  confidence?: number;
  bbox?: OcrBbox;
}

interface ParagraphLike {
  lines?: LineLike[];
}

interface BlockLike {
  paragraphs?: ParagraphLike[];
}

const GROUP_TOLERANCE = 12;

export function extractLines(blocks: BlockLike[] | null | undefined): OcrLine[] {
  const lines: OcrLine[] = [];

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        if (!line.bbox || typeof line.text !== 'string') {
          continue;
        }

        const text = line.text.trim();
        if (!text) {
          continue;
        }

        lines.push({
          text,
          confidence: typeof line.confidence === 'number' ? line.confidence : 0,
          bbox: line.bbox,
        });
      }
    }
  }

  return lines;
}

export function orderLines(
  lines: OcrLine[],
  orientation: OcrOrientation,
  order: ReadingOrder,
): OcrLine[] {
  const sorted = [...lines];

  if (orientation === 'vertical') {
    sorted.sort((a, b) => {
      const delta = centerX(a) - centerX(b);
      if (Math.abs(delta) > GROUP_TOLERANCE) {
        return order === 'rtl' ? -delta : delta;
      }
      return a.bbox.y0 - b.bbox.y0;
    });
    return sorted;
  }

  sorted.sort((a, b) => {
    const delta = centerY(a) - centerY(b);
    if (Math.abs(delta) > GROUP_TOLERANCE) {
      return delta;
    }
    return order === 'rtl' ? b.bbox.x0 - a.bbox.x0 : a.bbox.x0 - b.bbox.x0;
  });

  return sorted;
}

function centerX(line: OcrLine): number {
  return (line.bbox.x0 + line.bbox.x1) / 2;
}

function centerY(line: OcrLine): number {
  return (line.bbox.y0 + line.bbox.y1) / 2;
}
