import type { SelectionPayload } from './messaging/protocol';

const HISTORY_KEY = 'selectionHistory';
const LEGACY_KEY = 'lastSelection';
export const MAX_HISTORY = 12;

export async function loadHistory(): Promise<SelectionPayload[]> {
  try {
    const stored = await browser.storage.session.get(HISTORY_KEY);
    const history = stored[HISTORY_KEY] as SelectionPayload[] | undefined;
    if (history?.length) {
      return history;
    }

    const legacy = await browser.storage.session.get(LEGACY_KEY);
    const last = legacy[LEGACY_KEY] as SelectionPayload | undefined;
    return last ? [last] : [];
  } catch {
    return [];
  }
}

export async function appendHistory(payload: SelectionPayload): Promise<SelectionPayload[]> {
  const current = await loadHistory();
  const next = [payload, ...current.filter((item) => item.createdAt !== payload.createdAt)].slice(
    0,
    MAX_HISTORY,
  );

  try {
    await browser.storage.session.set({ [HISTORY_KEY]: next });
  } catch {
    // session storage may be unavailable or full
  }

  return next;
}

export async function removeHistoryEntry(createdAt: number): Promise<SelectionPayload[]> {
  const current = await loadHistory();
  const next = current.filter((item) => item.createdAt !== createdAt);

  try {
    await browser.storage.session.set({ [HISTORY_KEY]: next });
  } catch {
    // session storage may be unavailable
  }

  return next;
}

export async function clearHistory(): Promise<void> {
  try {
    await browser.storage.session.remove(HISTORY_KEY);
  } catch {
    // session storage may be unavailable
  }
}
