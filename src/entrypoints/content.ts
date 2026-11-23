import { cropSelection } from '../lib/extract/crop';
import { createTranslator } from '../lib/i18n';
import { isStartSelection, type SelectionPayload } from '../lib/messaging/protocol';
import { showToast, startSelectionOverlay } from '../lib/selection/overlay';
import { loadSettings } from '../lib/settings';

const READY_KEY = '__translatorHelperContentReady';

let selecting = false;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const readyWindow = window as unknown as Record<string, unknown>;
    if (readyWindow[READY_KEY]) {
      return;
    }
    readyWindow[READY_KEY] = true;

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isStartSelection(message)) {
        void runSelection();
        sendResponse({ ok: true });
      }
      return undefined;
    });
  },
});

async function runSelection(): Promise<void> {
  if (selecting) {
    return;
  }

  selecting = true;
  try {
    const settings = await loadSettings().catch(() => null);
    const tr = createTranslator(settings?.uiLang ?? 'zh-CN');
    const rect = await startSelectionOverlay(tr);
    if (!rect) {
      return;
    }

    const crop = await cropSelection(rect);
    if (!crop) {
      showToast(tr('contentCropFailed'));
      return;
    }

    const payload: SelectionPayload = {
      dataUrl: crop.dataUrl,
      width: crop.width,
      height: crop.height,
      source: crop.source,
      naturalRect: crop.naturalRect,
      createdAt: Date.now(),
    };

    await browser.runtime.sendMessage({ type: 'SELECTION_CROPPED', payload }).catch(() => {});
    showToast(tr('contentCaptured', { width: crop.width, height: crop.height }));
  } finally {
    selecting = false;
  }
}
