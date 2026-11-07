import { appendHistory } from '../lib/history';
import { isCaptureVisible, isFetchImage, isSelectionCropped } from '../lib/messaging/protocol';

export default defineBackground(() => {
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  } catch {
    // sidePanel is Chrome/Edge only
  }

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'translator-helper-start',
      title: '用 Translator Helper 框选翻译',
      contexts: ['image', 'page'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'translator-helper-start' && tab?.id) {
      void startSelection(tab.id);
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isCaptureVisible(message)) {
      void captureVisible(sender.tab?.windowId).then(sendResponse);
      return true;
    }
    if (isSelectionCropped(message)) {
      void appendHistory(message.payload).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (isFetchImage(message)) {
      void fetchImage(message.url).then(sendResponse);
      return true;
    }
    return undefined;
  });
});

async function startSelection(tabId: number): Promise<void> {
  await browser.tabs.sendMessage(tabId, { type: 'START_SELECTION' }).catch(() => {});
  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    // ignore when side panel is unavailable
  }
}

async function fetchImage(url: string): Promise<{ dataUrl: string | null }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { dataUrl: null };
    }

    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return { dataUrl: null };
    }

    const blob = await response.blob();
    const base64 = arrayBufferToBase64(await blob.arrayBuffer());
    const mime = blob.type || 'image/png';
    return { dataUrl: `data:${mime};base64,${base64}` };
  } catch {
    return { dataUrl: null };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function captureVisible(windowId?: number): Promise<{ dataUrl: string | null }> {
  if (windowId === undefined) {
    return { dataUrl: null };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return { dataUrl };
  } catch {
    return { dataUrl: null };
  }
}
