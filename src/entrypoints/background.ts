import { isCaptureVisible } from '../lib/messaging/protocol';

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

  browser.runtime.onMessage.addListener((message, sender) => {
    if (isCaptureVisible(message)) {
      return captureVisible(sender.tab?.windowId);
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
