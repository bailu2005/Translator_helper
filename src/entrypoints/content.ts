import { isStartSelection } from '../lib/messaging/protocol';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((message) => {
      if (isStartSelection(message)) {
        console.info('[Translator Helper] selection mode requested');
      }
    });
  },
});
