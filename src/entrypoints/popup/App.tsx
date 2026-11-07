export default function App() {
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
      <h1>Translator Helper</h1>
      <p>框选网页中的漫画 / 图片文字，本地识别后翻译。</p>
      <button className="primary" onClick={openPanel}>
        打开侧边栏
      </button>
      <button onClick={() => browser.runtime.openOptionsPage()}>设置</button>
    </main>
  );
}
