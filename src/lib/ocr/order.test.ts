import { describe, expect, it } from 'vitest';
import { extractLines, orderLines, type OcrLine } from './order';

function line(text: string, x0: number, y0: number, x1: number, y1: number): OcrLine {
  return { text, confidence: 90, bbox: { x0, y0, x1, y1 } };
}

function texts(lines: OcrLine[]): string[] {
  return lines.map((item) => item.text);
}

describe('extractLines', () => {
  it('flattens blocks, paragraphs and lines', () => {
    const blocks = [
      {
        paragraphs: [{ lines: [line('あ', 0, 0, 10, 10)] }, { lines: [line('い', 10, 0, 20, 10)] }],
      },
    ];

    expect(texts(extractLines(blocks))).toEqual(['あ', 'い']);
  });

  it('skips empty lines and missing bboxes', () => {
    const blocks = [
      {
        paragraphs: [
          {
            lines: [
              { text: '  ', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
              { text: 'う' },
              line('え', 0, 0, 1, 1),
            ],
          },
        ],
      },
    ];

    expect(texts(extractLines(blocks))).toEqual(['え']);
  });
});

describe('orderLines', () => {
  const columns = [line('右', 100, 0, 140, 200), line('左', 50, 0, 90, 200)];

  it('orders vertical columns right to left', () => {
    expect(texts(orderLines(columns, 'vertical', 'rtl'))).toEqual(['右', '左']);
  });

  it('orders vertical columns left to right', () => {
    expect(texts(orderLines(columns, 'vertical', 'ltr'))).toEqual(['左', '右']);
  });

  it('orders split lines inside the same column top to bottom', () => {
    const lines = [line('下', 100, 120, 140, 200), line('上', 100, 0, 140, 100)];
    expect(texts(orderLines(lines, 'vertical', 'rtl'))).toEqual(['上', '下']);
  });

  const rows = [line('下', 0, 100, 200, 140), line('上', 0, 40, 200, 80)];

  it('orders horizontal rows top to bottom', () => {
    expect(texts(orderLines(rows, 'horizontal', 'ltr'))).toEqual(['上', '下']);
  });

  it('orders horizontal cells right to left within a row', () => {
    const lines = [line('左', 0, 0, 90, 40), line('右', 100, 0, 190, 40)];
    expect(texts(orderLines(lines, 'horizontal', 'rtl'))).toEqual(['右', '左']);
  });
});
