import { cropSelection } from '../lib/extract/crop';
import { isStartSelection, type SelectionPayload } from '../lib/messaging/protocol';
import { showToast, startSelectionOverlay } from '../lib/selection/overlay';

let selecting = false;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((message) => {
      if (isStartSelection(message)) {
        void runSelection();
      }
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

    try {
      await browser.storage.session.set({ lastSelection: payload });
    } catch {
      // session storage may be unavailable
    }

    await browser.runtime.sendMessage({ type: 'SELECTION_CROPPED', payload }).catch(() => {});
    showToast(`已截取 ${crop.width}×${crop.height} 区域，下一步接入 OCR。`);
  } finally {
    selecting = false;
  }
}
