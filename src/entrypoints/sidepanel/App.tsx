import { useEffect, useState } from 'react';
import {
  isSelectionCropped,
  type SelectionPayload,
  type SelectionSource,
} from '../../lib/messaging/protocol';
import { loadSettings, type Settings } from '../../lib/settings';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selection, setSelection] = useState<SelectionPayload | null>(null);
  const [status, setStatus] = useState('框选网页中的漫画/图片文字，识别结果会显示在这里。');

  useEffect(() => {
    void loadSettings().then(setSettings);

    void browser.storage.session
      .get('lastSelection')
      .then((stored) => {
        const payload = stored.lastSelection as SelectionPayload | undefined;
        if (payload) {
          setSelection(payload);
        }
      })
      .catch(() => {});

    const listener = (message: unknown) => {
      if (isSelectionCropped(message)) {
        setSelection(message.payload);
        setStatus('已截取区域，接下来接入 OCR 与翻译。');
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
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
        <h2>截取预览</h2>
        {selection ? (
          <div className="preview">
            <img src={selection.dataUrl} alt="框选区域预览" />
            <dl>
              <div>
                <dt>尺寸</dt>
                <dd>
                  {selection.width} × {selection.height}
                </dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{sourceLabel(selection.source)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="placeholder">暂无内容</p>
        )}
      </section>

      <footer>
        源语言：{settings ? settings.sourceLang : '...'} · 目标语言：
        {settings ? settings.targetLang : '...'}
      </footer>
    </main>
  );
}

function sourceLabel(source: SelectionSource): string {
  switch (source) {
    case 'img':
      return '图片';
    case 'canvas':
      return 'Canvas';
    case 'video':
      return '视频帧';
    case 'background':
      return '背景图';
    case 'viewport':
      return '视口截图';
    default:
      return source;
  }
}
