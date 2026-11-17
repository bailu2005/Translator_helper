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
import {
  buildLearningCacheKey,
  deleteCachedLearningCard,
  getCachedLearningCard,
  setCachedLearningCard,
} from '../../lib/learn/cache';
import { generateLearningCard } from '../../lib/learn/llm';
import { tokenizeWithService, type TokenInfo } from '../../lib/learn/tokenize';
import type { LearningCard } from '../../lib/learn/types';
import { recognizeSelection } from '../../lib/ocr/engine';
import type { OcrOrientation, ReadingOrder } from '../../lib/ocr/order';
import { checkOcrService, type ServiceStatus } from '../../lib/ocr/service';
import type { OcrResult } from '../../lib/ocr/types';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type OcrEngineSetting,
  type Settings,
} from '../../lib/settings';
import {
  buildTranslationCacheKey,
  deleteCachedTranslation,
  getCachedTranslation,
  setCachedTranslation,
} from '../../lib/translate/cache';
import { translateText } from '../../lib/translate/engine';
import { loadGlossary, normalizeGlossary } from '../../lib/translate/glossary';
import { targetLanguageLabel, type GlossaryEntry } from '../../lib/translate/types';

interface OcrState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  progress: number;
  statusText?: string;
  result?: OcrResult;
  error?: string;
  fallback?: boolean;
}

interface TranslationState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  statusText?: string;
  text?: string;
  engine?: string;
  durationMs?: number;
  error?: string;
}

interface LearningState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  mode: 'llm' | 'basic';
  statusText?: string;
  card?: LearningCard;
  tokens?: TokenInfo[];
  engine?: string;
  durationMs?: number;
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
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [serviceChecking, setServiceChecking] = useState(false);
  const [translationState, setTranslationState] = useState<TranslationState | null>(null);
  const [manualTranslation, setManualTranslation] = useState<{
    createdAt: number;
    token: number;
  } | null>(null);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [learningState, setLearningState] = useState<LearningState | null>(null);
  const [learningCollapsed, setLearningCollapsed] = useState(false);
  const learningRequestId = useRef(0);
  const ocrCache = useRef(new Map<string, OcrResult>());
  const recentPairs = useRef<{ createdAt: number; source: string; translation?: string }[]>([]);

  const activeSelection = useMemo(
    () => history.find((item) => item.createdAt === activeCreatedAt) ?? null,
    [history, activeCreatedAt],
  );
  const activeId = activeSelection?.createdAt ?? null;
  const activeDataUrl = activeSelection?.dataUrl ?? null;
  const orientation = settings?.ocrOrientation ?? 'vertical';
  const readingOrder = settings?.readingOrder ?? 'rtl';
  const engineSetting = settings?.ocrEngine ?? DEFAULT_SETTINGS.ocrEngine;
  const serviceUrl = settings?.ocrServiceUrl ?? DEFAULT_SETTINGS.ocrServiceUrl;
  const activeCacheKey =
    activeId === null
      ? null
      : `${activeId}:${orientation}:${readingOrder}:${engineSetting}:${serviceUrl}`;
  const targetLang = settings?.targetLang ?? DEFAULT_SETTINGS.targetLang;
  const recognizedText = ocrState?.status === 'done' ? (ocrState.result?.text ?? '') : '';
  const translationCacheKey = useMemo(() => {
    if (!settings || !recognizedText) {
      return null;
    }
    return buildTranslationCacheKey(recognizedText, targetLang, settings, glossary);
  }, [settings, recognizedText, targetLang, glossary]);
  const translationText = translationState?.status === 'done' ? (translationState.text ?? '') : '';
  const llmConfigured = Boolean(settings?.llmBaseUrl && settings?.llmModel);
  const canGenerateLearning = Boolean(
    activeId !== null && recognizedText && (llmConfigured ? translationText : true),
  );
  const learningCacheKey = useMemo(() => {
    if (!settings || !recognizedText || !translationText) {
      return null;
    }
    return buildLearningCacheKey(recognizedText, translationText, targetLang, settings, glossary);
  }, [settings, recognizedText, translationText, targetLang, glossary]);

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setSettingsReady(true);
    });

    void loadHistory().then((items) => {
      setHistory((previous) => mergeHistory(previous, items));
      setActiveCreatedAt((current) => current ?? items[0]?.createdAt ?? null);
    });

    void loadGlossary().then(setGlossary);

    const listener = (message: unknown) => {
      if (isSelectionCropped(message)) {
        setHistory((previous) => mergeHistory(previous, [message.payload]));
        setActiveCreatedAt(message.payload.createdAt);
        setStatus('已截取区域，正在识别日文。');
      }
    };

    const handleStorageChange = (
      changes: { [key: string]: { newValue?: unknown } },
      areaName: string,
    ) => {
      if (areaName !== 'local') {
        return;
      }
      if (changes.settings?.newValue) {
        setSettings(changes.settings.newValue as Settings);
      }
      if (changes.glossary?.newValue) {
        setGlossary(normalizeGlossary(changes.glossary.newValue));
      }
    };

    browser.runtime.onMessage.addListener(listener);
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    let cancelled = false;
    setServiceChecking(true);
    void checkOcrService(serviceUrl).then((status) => {
      if (cancelled) {
        return;
      }
      setServiceStatus(status);
      setServiceChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [settingsReady, serviceUrl]);

  useEffect(() => {
    if (!settingsReady || !settings) {
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

    void recognizeSelection(activeDataUrl, settings, {
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
      .then((outcome) => {
        if (cancelled) return;
        ocrCache.current.set(activeCacheKey, outcome.result);
        setOcrState({
          createdAt: activeId,
          status: 'done',
          progress: 1,
          result: outcome.result,
          fallback: outcome.fallback,
        });
        setStatus(outcome.fallback ? '本地 manga-ocr 不可用，已回退 Tesseract。' : '识别完成。');
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

  useEffect(() => {
    if (!settingsReady || !settings) {
      return;
    }
    if (!activeId || !recognizedText || !translationCacheKey) {
      setTranslationState(null);
      return;
    }

    const shouldTranslate = settings.autoTranslate || manualTranslation?.createdAt === activeId;
    if (!shouldTranslate) {
      setTranslationState((previous) => (previous?.createdAt === activeId ? previous : null));
      return;
    }

    let cancelled = false;
    setTranslationState({
      createdAt: activeId,
      status: 'running',
      statusText: '准备翻译',
    });

    const run = async () => {
      const cached = await getCachedTranslation(translationCacheKey);
      if (cancelled) {
        return;
      }
      if (cached) {
        setTranslationState({
          createdAt: activeId,
          status: 'done',
          text: cached.text,
          engine: cached.engine,
          durationMs: cached.durationMs,
        });
        recentPairs.current = [
          ...recentPairs.current.filter((pair) => pair.createdAt !== activeId),
          { createdAt: activeId, source: recognizedText, translation: cached.text },
        ].slice(-5);
        return;
      }

      const context = recentPairs.current
        .filter((pair) => pair.createdAt !== activeId)
        .slice(-3)
        .map((pair) => ({ source: pair.source, translation: pair.translation }));

      try {
        const result = await translateText(
          {
            text: recognizedText,
            sourceLang: 'ja',
            targetLang,
            context,
            glossary,
            onToken: (partial) => {
              if (cancelled) {
                return;
              }
              setTranslationState((previous) =>
                previous && previous.createdAt === activeId
                  ? { ...previous, text: partial }
                  : previous,
              );
            },
            onProgress: (statusText) => {
              if (cancelled) {
                return;
              }
              setTranslationState((previous) =>
                previous && previous.createdAt === activeId
                  ? { ...previous, statusText }
                  : previous,
              );
            },
          },
          settings,
        );

        if (cancelled) {
          return;
        }

        await setCachedTranslation(translationCacheKey, result);
        setTranslationState({
          createdAt: activeId,
          status: 'done',
          text: result.text,
          engine: result.engine,
          durationMs: result.durationMs,
        });
        recentPairs.current = [
          ...recentPairs.current.filter((pair) => pair.createdAt !== activeId),
          { createdAt: activeId, source: recognizedText, translation: result.text },
        ].slice(-5);
        setStatus('翻译完成。');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setTranslationState({
          createdAt: activeId,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus('翻译失败，可点击「重新翻译」。');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeId,
    recognizedText,
    translationCacheKey,
    targetLang,
    glossary,
    settings,
    settingsReady,
    manualTranslation,
  ]);

  useEffect(() => {
    learningRequestId.current += 1;
    setLearningState(null);
    setLearningCollapsed(false);
  }, [activeId, recognizedText, targetLang]);

  useEffect(() => {
    setLearningState((previous) => {
      if (previous?.mode === 'llm') {
        learningRequestId.current += 1;
        return null;
      }
      return previous;
    });
  }, [translationText]);

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

  const refreshService = async () => {
    setServiceChecking(true);
    const status = await checkOcrService(serviceUrl);
    setServiceStatus(status);
    setServiceChecking(false);
  };

  const requestTranslation = async () => {
    if (activeId === null || !translationCacheKey) {
      return;
    }
    await deleteCachedTranslation(translationCacheKey);
    setManualTranslation({ createdAt: activeId, token: Date.now() });
  };

  const copyTranslation = async () => {
    const text = translationState?.text;
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('已复制译文。');
    } catch {
      setStatus('复制失败，请手动选择文本。');
    }
  };

  const generateLearning = async (force = false) => {
    if (!settings || activeId === null || !recognizedText) {
      return;
    }

    const mode: 'llm' | 'basic' = llmConfigured ? 'llm' : 'basic';
    const capturedId = activeId;
    const requestId = ++learningRequestId.current;

    if (mode === 'basic') {
      setLearningState({
        createdAt: capturedId,
        status: 'running',
        mode,
        statusText: '本地分词',
      });

      const started = performance.now();
      try {
        const result = await tokenizeWithService(settings.ocrServiceUrl, recognizedText);
        if (requestId !== learningRequestId.current) {
          return;
        }
        setLearningState({
          createdAt: capturedId,
          status: 'done',
          mode,
          tokens: result.tokens,
          engine: '本地分词 (fugashi)',
          durationMs: Math.round(performance.now() - started),
        });
        setLearningCollapsed(false);
        setStatus('本地分词完成。');
      } catch (error) {
        if (requestId !== learningRequestId.current) {
          return;
        }
        setLearningState({
          createdAt: capturedId,
          status: 'error',
          mode,
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus('本地分词失败。');
      }
      return;
    }

    if (!translationText || !learningCacheKey) {
      return;
    }
    const cacheKey = learningCacheKey;

    if (!force) {
      const cached = await getCachedLearningCard(cacheKey);
      if (requestId !== learningRequestId.current) {
        return;
      }
      if (cached) {
        setLearningState({
          createdAt: capturedId,
          status: 'done',
          mode,
          card: cached.card,
          engine: cached.engine,
          durationMs: cached.durationMs,
        });
        return;
      }
    } else {
      await deleteCachedLearningCard(cacheKey);
    }

    setLearningState({
      createdAt: capturedId,
      status: 'running',
      mode,
      statusText: '生成学习卡',
    });

    const context = recentPairs.current
      .filter((pair) => pair.createdAt !== capturedId)
      .slice(-3)
      .map((pair) => ({ source: pair.source, translation: pair.translation }));

    try {
      const result = await generateLearningCard(
        {
          text: recognizedText,
          translation: translationText,
          targetLang,
          context,
          glossary,
        },
        {
          baseUrl: settings.llmBaseUrl,
          model: settings.llmModel,
          apiKey: settings.llmApiKey,
        },
      );

      if (requestId !== learningRequestId.current) {
        return;
      }

      await setCachedLearningCard(cacheKey, result);
      setLearningState({
        createdAt: capturedId,
        status: 'done',
        mode,
        card: result.card,
        engine: result.engine,
        durationMs: result.durationMs,
      });
      setLearningCollapsed(false);
      setStatus('学习卡已生成。');
    } catch (error) {
      if (requestId !== learningRequestId.current) {
        return;
      }
      setLearningState({
        createdAt: capturedId,
        status: 'error',
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
      setStatus('学习卡生成失败。');
    }
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
      const indeterminate = ocrState.progress < 0;
      const percent = indeterminate
        ? 0
        : Math.round(Math.min(1, Math.max(0, ocrState.progress)) * 100);
      return (
        <div className="ocr-progress">
          <div className="progress-track">
            <div
              className={indeterminate ? 'progress-bar indeterminate' : 'progress-bar'}
              style={indeterminate ? undefined : { width: `${percent}%` }}
            />
          </div>
          <span className="progress-label">
            {ocrProgressLabel(ocrState.statusText)}
            {indeterminate ? '…' : ` ${percent}%`}
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
          {typeof result.confidence === 'number'
            ? `置信度 ${Math.round(result.confidence)}% · `
            : ''}
          {result.engine} · {result.durationMs}ms
        </p>
        {ocrState.fallback && (
          <p className="ocr-note">本地 manga-ocr 不可用，已使用内置 Tesseract。</p>
        )}
      </div>
    );
  };

  const renderTranslation = () => {
    if (!activeSelection) {
      return <p className="placeholder">先框选一个区域。</p>;
    }
    if (ocrState?.status !== 'done' || !ocrState.result?.text) {
      return <p className="placeholder">等待日文识别完成。</p>;
    }
    if (
      !settings?.autoTranslate &&
      manualTranslation?.createdAt !== activeSelection.createdAt &&
      translationState?.status !== 'done'
    ) {
      return <p className="placeholder">自动翻译已关闭，点击「翻译」开始。</p>;
    }
    if (!translationState || translationState.createdAt !== activeSelection.createdAt) {
      return <p className="placeholder">准备翻译…</p>;
    }
    if (translationState.status === 'running') {
      return (
        <div className="translation-result">
          {translationState.text ? (
            <p className="translation-text">{translationState.text}</p>
          ) : null}
          <div className="ocr-progress">
            <div className="progress-track">
              <div className="progress-bar indeterminate" />
            </div>
            <span className="progress-label">{translationState.statusText ?? '翻译中'}…</span>
          </div>
        </div>
      );
    }
    if (translationState.status === 'error') {
      return <p className="ocr-error">翻译失败：{translationState.error ?? '未知错误'}</p>;
    }

    return (
      <div className="translation-result">
        <p className="translation-text">{translationState.text || '（空）'}</p>
        <p className="ocr-meta">
          {translationState.engine} · {translationState.durationMs}ms
        </p>
      </div>
    );
  };

  const renderLearning = () => {
    if (!activeSelection) {
      return <p className="placeholder">先框选一个区域。</p>;
    }
    if (ocrState?.status !== 'done' || !recognizedText) {
      return <p className="placeholder">等待日文识别完成。</p>;
    }
    if (llmConfigured && (translationState?.status !== 'done' || !translationText)) {
      return <p className="placeholder">翻译完成后可生成学习卡。</p>;
    }
    if (!learningState || learningState.createdAt !== activeSelection.createdAt) {
      return (
        <p className="placeholder">
          {llmConfigured
            ? '点击「生成学习卡」查看词汇与语法讲解。'
            : '点击「本地分词」查看读音/词性/辞书形；配置 LLM 可获得释义和语法讲解。'}
        </p>
      );
    }
    if (learningState.status === 'running') {
      return (
        <div className="ocr-progress">
          <div className="progress-track">
            <div className="progress-bar indeterminate" />
          </div>
          <span className="progress-label">{learningState.statusText ?? '处理中'}…</span>
        </div>
      );
    }
    if (learningState.status === 'error') {
      return (
        <p className="ocr-error">
          {learningState.mode === 'basic' ? '本地分词失败' : '学习卡生成失败'}：
          {learningState.error ?? '未知错误'}
        </p>
      );
    }

    if (learningState.mode === 'basic') {
      const tokens = learningState.tokens ?? [];
      if (learningCollapsed) {
        return <p className="placeholder">已分词：{tokens.length} 个词（点击「展开」查看）</p>;
      }
      if (tokens.length === 0) {
        return <p className="placeholder">未分词到内容。</p>;
      }
      return (
        <div className="learn-list">
          <p className="ocr-note">
            本地分词只提供读音/词性/辞书形；配置 LLM 可获得中文释义、用法和语法讲解。
          </p>
          {tokens.map((token, index) => (
            <div className="learn-word" key={`${token.surface}-${index}`}>
              <div className="learn-word-head">
                <span className="learn-surface">{token.surface}</span>
                {token.reading && <span className="learn-reading">{token.reading}</span>}
                {token.pos && <span className="learn-pos">{token.pos}</span>}
              </div>
              {(token.lemma || token.form) && (
                <p className="learn-detail">
                  {token.lemma && token.lemma !== token.surface ? `辞书形：${token.lemma}` : ''}
                  {token.form
                    ? `${token.lemma && token.lemma !== token.surface ? ' · ' : ''}活用：${token.form}`
                    : ''}
                </p>
              )}
            </div>
          ))}
          <p className="ocr-meta">
            {learningState.engine} · {learningState.durationMs}ms
          </p>
        </div>
      );
    }

    const card = learningState.card;
    if (!card) {
      return <p className="placeholder">暂无内容。</p>;
    }
    if (learningCollapsed) {
      return (
        <p className="placeholder">
          已生成：{card.words.length} 个词 / {card.grammar.length} 个语法点（点击「展开」查看）
        </p>
      );
    }

    return (
      <div className="learn-list">
        {card.words.map((word, index) => (
          <div className="learn-word" key={`${word.surface}-${index}`}>
            <div className="learn-word-head">
              <span className="learn-surface">{word.surface}</span>
              {word.reading && <span className="learn-reading">{word.reading}</span>}
              {word.pos && <span className="learn-pos">{word.pos}</span>}
            </div>
            {word.meaning && <p className="learn-meaning">{word.meaning}</p>}
            {word.usage && <p className="learn-detail">用法：{word.usage}</p>}
            {word.example && <p className="learn-example">例：{word.example}</p>}
          </div>
        ))}
        {card.grammar.map((grammar, index) => (
          <div className="learn-grammar" key={`${grammar.pattern}-${index}`}>
            <p className="learn-pattern">{grammar.pattern}</p>
            {grammar.meaning && <p className="learn-meaning">{grammar.meaning}</p>}
            {grammar.nuance && <p className="learn-detail">语感：{grammar.nuance}</p>}
            {grammar.example && <p className="learn-example">例：{grammar.example}</p>}
          </div>
        ))}
        <p className="ocr-meta">
          {learningState.engine} · {learningState.durationMs}ms
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
            引擎
            <select
              value={engineSetting}
              onChange={(event) =>
                updateOcrSettings({ ocrEngine: event.target.value as OcrEngineSetting })
              }
            >
              <option value="auto">本地 manga-ocr（失败回退）</option>
              <option value="tesseract">内置 Tesseract</option>
            </select>
          </label>
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

        <p className="ocr-hint">方向/顺序仅在内置 Tesseract 生效；本地 manga-ocr 自动处理。</p>

        <div className="service-status">
          <span>{serviceStatusLabel(serviceStatus, serviceChecking)}</span>
          <button className="ghost" onClick={() => void refreshService()} type="button">
            重试连接
          </button>
        </div>

        {renderOcr()}
      </section>

      <section className="translation">
        <div className="result-head">
          <h2>译文（{targetLanguageLabel(targetLang)}）</h2>
          <div className="head-actions">
            {translationState?.status === 'done' && translationState.text && (
              <button className="ghost" onClick={() => void copyTranslation()} type="button">
                复制
              </button>
            )}
            <button className="ghost" onClick={() => void requestTranslation()} type="button">
              {translationState?.status === 'done' ? '重新翻译' : '翻译'}
            </button>
          </div>
        </div>
        {renderTranslation()}
      </section>

      <section className="learning">
        <div className="result-head">
          <h2>学习（词汇 / 语法）</h2>
          <div className="head-actions">
            {learningState?.status === 'done' && (
              <>
                <button
                  className="ghost"
                  onClick={() => setLearningCollapsed((value) => !value)}
                  type="button"
                >
                  {learningCollapsed ? '展开' : '收起'}
                </button>
                <button className="ghost" onClick={() => void generateLearning(true)} type="button">
                  {learningState?.mode === 'basic' ? '重新分词' : '重新生成'}
                </button>
              </>
            )}
            {learningState?.status !== 'done' && (
              <button
                className="ghost"
                onClick={() => void generateLearning()}
                disabled={!canGenerateLearning || learningState?.status === 'running'}
                type="button"
              >
                {llmConfigured ? '生成学习卡' : '本地分词'}
              </button>
            )}
          </div>
        </div>
        {renderLearning()}
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

function serviceStatusLabel(status: ServiceStatus | null, checking: boolean): string {
  if (checking) {
    return '本地服务：检测中…';
  }
  if (!status) {
    return '本地服务：未检测';
  }
  if (!status.available) {
    return '本地服务：未启动（将回退 Tesseract）';
  }
  if (status.loading) {
    return '本地服务：模型加载中（将回退 Tesseract）';
  }
  if (status.ready) {
    return '本地服务：可用';
  }
  return '本地服务：未就绪（将回退 Tesseract）';
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
