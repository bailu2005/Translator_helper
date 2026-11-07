import { useEffect, useMemo, useState } from 'react';
import { clearHistory, loadHistory, removeHistoryEntry } from '../../lib/history';
import {
  isSelectionCropped,
  type SelectionPayload,
  type SelectionSource,
} from '../../lib/messaging/protocol';
import { loadSettings, type Settings } from '../../lib/settings';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<SelectionPayload[]>([]);
  const [activeCreatedAt, setActiveCreatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState('框选网页中的漫画/图片文字，识别结果会显示在这里。');

  const activeSelection = useMemo(
    () => history.find((item) => item.createdAt === activeCreatedAt) ?? null,
    [history, activeCreatedAt],
  );

  useEffect(() => {
    void loadSettings().then(setSettings);

    void loadHistory().then((items) => {
      setHistory(items);
      setActiveCreatedAt(items[0]?.createdAt ?? null);
    });

    const listener = (message: unknown) => {
      if (isSelectionCropped(message)) {
        void loadHistory().then((items) => {
          setHistory(items);
          setActiveCreatedAt(message.payload.createdAt);
        });
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

  const removeItem = async (createdAt: number) => {
    const items = await removeHistoryEntry(createdAt);
    setHistory(items);
    if (activeCreatedAt === createdAt) {
      setActiveCreatedAt(items[0]?.createdAt ?? null);
    }
    setStatus('已删除该条截取记录。');
  };

  const clearAll = async () => {
    await clearHistory();
    setHistory([]);
    setActiveCreatedAt(null);
    setStatus('历史记录已清空。');
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
        <div className="result-head">
          <h2>截取预览</h2>
          {activeSelection && (
            <button
              className="ghost"
              onClick={() => void removeItem(activeSelection.createdAt)}
              type="button"
            >
              删除
            </button>
          )}
        </div>

        {activeSelection ? (
          <div className="preview">
            <img src={activeSelection.dataUrl} alt="框选区域预览" />
            <dl>
              <div>
                <dt>尺寸</dt>
                <dd>
                  {activeSelection.width} × {activeSelection.height}
                </dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{sourceLabel(activeSelection.source)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="placeholder">暂无内容</p>
        )}
      </section>

      <section className="history">
        <div className="result-head">
          <h2>历史记录{history.length > 0 ? `（${history.length}）` : ''}</h2>
          {history.length > 0 && (
            <button className="ghost" onClick={() => void clearAll()} type="button">
              清空
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <ul className="history-list">
            {history.map((item) => (
              <li
                key={item.createdAt}
                className={item.createdAt === activeCreatedAt ? 'active' : undefined}
              >
                <button
                  className="thumb"
                  onClick={() => setActiveCreatedAt(item.createdAt)}
                  title={`${item.width} × ${item.height} · ${sourceLabel(item.source)}`}
                  type="button"
                >
                  <img src={item.dataUrl} alt="" />
                  <span>
                    {item.width}×{item.height}
                  </span>
                </button>
                <button
                  className="remove"
                  onClick={() => void removeItem(item.createdAt)}
                  aria-label="删除这条记录"
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="placeholder">暂无历史</p>
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
