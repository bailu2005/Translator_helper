import { describe, expect, it } from 'vitest';
import { removeHistoryItem } from './history';
import type { SelectionPayload } from './messaging/protocol';

function payload(createdAt: number): SelectionPayload {
  return {
    dataUrl: `data:image/png;base64,${createdAt}`,
    width: 10,
    height: 10,
    source: 'img',
    naturalRect: { sx: 0, sy: 0, sw: 10, sh: 10 },
    createdAt,
  };
}

describe('removeHistoryItem', () => {
  it('removes only the matching item', () => {
    const items = [payload(3), payload(2), payload(1)];
    expect(removeHistoryItem(items, 2).map((item) => item.createdAt)).toEqual([3, 1]);
  });

  it('keeps every item when nothing matches', () => {
    const items = [payload(2), payload(1)];
    expect(removeHistoryItem(items, 99)).toHaveLength(2);
  });

  it('does not mutate the original array', () => {
    const items = [payload(2), payload(1)];
    removeHistoryItem(items, 2);
    expect(items).toHaveLength(2);
  });
});
