import { useEffect, useState } from 'react';
import { createTranslator, type UiLang } from '../../lib/i18n';
import { DEFAULT_SETTINGS, loadSettings } from '../../lib/settings';

export default function App() {
  const [lang, setLang] = useState<UiLang>(DEFAULT_SETTINGS.uiLang);
  const tr = createTranslator(lang);

  useEffect(() => {
    void loadSettings().then((settings) => setLang(settings.uiLang));
  }, []);

  const openPanel = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch {
      // ignore when side panel is unavailable
    }
  };

  return (
    <main className="popup">
      <h1>{tr('appName')}</h1>
      <p>{tr('popupDescription')}</p>
      <button className="primary" onClick={openPanel} type="button">
        {tr('popupOpenPanel')}
      </button>
      <button onClick={() => browser.runtime.openOptionsPage()} type="button">
        {tr('popupSettings')}
      </button>
    </main>
  );
}
