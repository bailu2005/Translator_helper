import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearHistory,
  loadHistory,
  MAX_HISTORY,
  removeHistoryItem,
  saveHistory,
} from '../../lib/history';
import {
  isSelectionCropped,
  type SelectionPayload,
  type SelectionSource,
} from '../../lib/messaging/protocol';
import type { OcrOrientation, ReadingOrder } from '../../lib/ocr/order';
import { tesseractOcrProvider } from '../../lib/ocr/tesseract';
import type { OcrResult } from '../../lib/ocr/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../lib/settings';

interface OcrState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  progress: number;
  statusText?: string;
  result?: OcrResult;
  error?: string;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<SelectionPayload[]>([]);
  const [activeCreatedAt, setActiveCreatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState('框选网页中的漫画/图片文字，识别结果会显示在这里。');
  const [ocrState, setOcrState] = useState<OcrState | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [settingsReady, setSettingsReady] = useState(false);
  const ocrCache = useRef(new Map<string, OcrResult>());

  const activeSelection = useMemo(
    () => history.find((item) => item.createdAt === activeCreatedAt) ?? null,
    [history, activeCreatedAt],
  );
  const activeId = activeSelection?.createdAt ?? null;
  const activeDataUrl = activeSelection?.dataUrl ?? null;
  const orientation = settings?.ocrOrientation ?? 'vertical';
  const readingOrder = settings?.readingOrder ?? 'rtl';
  const activeCacheKey = activeId === null ? null : `${activeId}:${orientation}:${readingOrder}`;

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setSettingsReady(true);
    });

    void loadHistory().then((items) => {
      setHistory((previous) => mergeHistory(previous, items));
      setActiveCreatedAt((current) => current ?? items[0]?.createdAt ?? null);
    });

    const listener = (message: unknown) => {
      if (isSelectionCropped(message)) {
        setHistory((previous) => mergeHistory(previous, [message.payload]));
        setActiveCreatedAt(message.payload.createdAt);
        setStatus('已截取区域，正在识别日文。');
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!settingsReady) {
      return;
    }
    if (!activeId || !activeDataUrl || !activeCacheKey) {
      setOcrState(null);
      return;
    }

    const cached = ocrCache.current.get(activeCacheKey);
    if (cached) {
      setOcrState({ createdAt: activeId, status: 'done', progress: 1, result: cached });
      return;
    }

    let cancelled = false;
    setOcrState({ createdAt: activeId, status: 'running', progress: 0, statusText: '准备 OCR' });

    void tesseractOcrProvider
      .recognize(activeDataUrl, {
        orientation,
        readingOrder,
        onProgress: ({ status: progressStatus, progress }) => {
          if (cancelled) return;
          setOcrState((previous) =>
            previous && previous.createdAt === activeId
              ? { ...previous, progress, statusText: progressStatus }
              : previous,
          );
        },
      })
      .then((result) => {
        if (cancelled) return;
        ocrCache.current.set(activeCacheKey, result);
        setOcrState({ createdAt: activeId, status: 'done', progress: 1, result });
        setStatus('识别完成。');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOcrState({
          createdAt: activeId,
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus('识别失败，可点击「重新识别」。');
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeId,
    activeDataUrl,
    activeCacheKey,
    retryToken,
    settingsReady,
    orientation,
    readingOrder,
  ]);

  const startSelection = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (await tryStartSelection(tab.id)) {
      setStatus('已进入框选模式，请在页面中拖拽选择文字区域。');
      return;
    }

    const injected = await injectContentScript(tab.id).catch(() => false);
    if (injected && (await tryStartSelection(tab.id))) {
      setStatus('已进入框选模式，请在页面中拖拽选择文字区域。');
      return;
    }

    setStatus('无法在此页面框选：请刷新页面后重试；chrome://、扩展商店、PDF 等页面不支持。');
  };

  const removeItem = async (createdAt: number) => {
    const next = removeHistoryItem(history, createdAt);
    setHistory(next);
    setActiveCreatedAt((current) =>
      current === createdAt ? (next[0]?.createdAt ?? null) : current,
    );
    for (const key of [...ocrCache.current.keys()]) {
      if (key.startsWith(`${createdAt}:`)) {
        ocrCache.current.delete(key);
      }
    }
    await saveHistory(next);
    setStatus('已删除该条截取记录。');
  };

  const clearAll = async () => {
    await clearHistory();
    setHistory([]);
    setActiveCreatedAt(null);
    ocrCache.current.clear();
    setStatus('历史记录已清空。');
  };

  const retryOcr = () => {
    if (activeId === null) return;
    for (const key of [...ocrCache.current.keys()]) {
      if (key.startsWith(`${activeId}:`)) {
        ocrCache.current.delete(key);
      }
    }
    setRetryToken((value) => value + 1);
  };

  const updateOcrSettings = (patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...(previous ?? DEFAULT_SETTINGS), ...patch };
      void saveSettings(next);
      return next;
    });
  };

  const changeOrientation = (value: OcrOrientation) => {
    updateOcrSettings({
      ocrOrientation: value,
      readingOrder: value === 'vertical' ? 'rtl' : 'ltr',
    });
  };

  const changeReadingOrder = (value: ReadingOrder) => {
    updateOcrSettings({ readingOrder: value });
  };

  const copyOcrText = async () => {
    const text = ocrState?.result?.text;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setStatus('已复制识别文本。');
    } catch {
      setStatus('复制失败，请手动选择文本。');
    }
  };

  const renderOcr = () => {
    if (!activeSelection) {
      return <p className="placeholder">先框选一个区域。</p>;
    }
    if (!ocrState || ocrState.createdAt !== activeSelection.createdAt) {
      return <p className="placeholder">准备识别…</p>;
    }
    if (ocrState.status === 'running') {
      const percent = Math.round(Math.min(1, Math.max(0, ocrState.progress)) * 100);
      return (
        <div className="ocr-progress">
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <span className="progress-label">
            {ocrProgressLabel(ocrState.statusText)} {percent}%
          </span>
        </div>
      );
    }
    if (ocrState.status === 'error') {
      return <p className="ocr-error">识别失败：{ocrState.error ?? '未知错误'}</p>;
    }

    const result = ocrState.result;
    if (!result) {
      return <p className="placeholder">暂无结果。</p>;
    }

    return (
      <div className="ocr-result">
        <pre className="ocr-text">{result.text || '（未识别到文字）'}</pre>
        <p className="ocr-meta">
          置信度 {Math.round(result.confidence)}% · {result.engine} · {result.durationMs}ms
        </p>
      </div>
    );
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

      <section className="ocr">
        <div className="result-head">
          <h2>识别结果（日文）</h2>
          <div className="head-actions">
            {ocrState?.status === 'done' && ocrState.result?.text && (
              <button className="ghost" onClick={() => void copyOcrText()} type="button">
                复制
              </button>
            )}
            {activeSelection && (
              <button className="ghost" onClick={retryOcr} type="button">
                重新识别
              </button>
            )}
          </div>
        </div>

        <div className="ocr-options">
          <label>
            方向
            <select
              value={orientation}
              onChange={(event) => changeOrientation(event.target.value as OcrOrientation)}
            >
              <option value="vertical">竖排</option>
              <option value="horizontal">横排</option>
            </select>
          </label>
          <label>
            顺序
            <select
              value={readingOrder}
              onChange={(event) => changeReadingOrder(event.target.value as ReadingOrder)}
            >
              <option value="rtl">右 → 左</option>
              <option value="ltr">左 → 右</option>
            </select>
          </label>
        </div>

        {renderOcr()}
      </section>

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

async function tryStartSelection(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'START_SELECTION' });
    return true;
  } catch {
    return false;
  }
}

async function injectContentScript(tabId: number): Promise<boolean> {
  const manifest = browser.runtime.getManifest();
  const files = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []);
  if (files.length === 0) {
    return false;
  }

  await chrome.scripting.executeScript({ target: { tabId }, files });
  return true;
}

function ocrProgressLabel(status?: string): string {
  const labels: Record<string, string> = {
    'loading tesseract core': '加载 OCR 引擎',
    'loading language traineddata': '加载日语模型',
    'initializing tesseract': '初始化 OCR',
    'recognizing text': '识别文字',
  };

  if (!status) {
    return '识别中';
  }
  return labels[status] ?? status;
}

function mergeHistory(
  current: SelectionPayload[],
  incoming: SelectionPayload[],
): SelectionPayload[] {
  const seen = new Set(current.map((item) => item.createdAt));
  const merged = [...current];

  for (const item of incoming) {
    if (!seen.has(item.createdAt)) {
      merged.push(item);
      seen.add(item.createdAt);
    }
  }

  merged.sort((a, b) => b.createdAt - a.createdAt);
  return merged.slice(0, MAX_HISTORY);
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
