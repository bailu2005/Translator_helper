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
});

async function startSelection(tabId: number): Promise<void> {
  await browser.tabs.sendMessage(tabId, { type: 'START_SELECTION' }).catch(() => {});
  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    // ignore when side panel is unavailable
  }
}
