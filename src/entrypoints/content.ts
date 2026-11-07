import { cropSelection } from '../lib/extract/crop';
import { isStartSelection, type SelectionPayload } from '../lib/messaging/protocol';
import { showToast, startSelectionOverlay } from '../lib/selection/overlay';

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
    const rect = await startSelectionOverlay();
    if (!rect) {
      return;
    }

    const crop = await cropSelection(rect);
    if (!crop) {
      showToast('未能读取该区域，请尝试直接框选图片内部。');
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
    showToast(`已截取 ${crop.width}×${crop.height} 区域，正在识别日文…`);
  } finally {
    selecting = false;
  }
}
