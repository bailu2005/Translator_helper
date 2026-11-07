import { useEffect, useState } from 'react';
import { loadSettings, type Settings } from '../../lib/settings';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState('框选网页中的漫画/图片文字，识别结果会显示在这里。');

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const startSelection = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'START_SELECTION' });
      setStatus('已进入框选模式，请在页面中拖拽选择文字区域。');
    } catch {
      setStatus('当前页面无法框选，请刷新页面后重试。');
    }
  };

  return (
    <main className="panel">
      <header>
        <h1>Translator Helper</h1>
        <p className="subtitle">漫画 / 图片文字 · 本地识别 · 翻译到中文</p>
      </header>

      <button className="primary" onClick={startSelection}>
        开始框选
      </button>

      <p className="status">{status}</p>

      <section className="result">
        <h2>译文</h2>
        <p className="placeholder">暂无内容</p>
      </section>

      <footer>
        源语言：{settings ? settings.sourceLang : '...'} · 目标语言：
        {settings ? settings.targetLang : '...'}
      </footer>
    </main>
  );
}
