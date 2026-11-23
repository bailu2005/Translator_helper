import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorPanel } from '../../components/ErrorPanel';
import { classifyError, makeError, type AppError } from '../../lib/errors';
import {
  clearHistory,
  loadHistory,
  MAX_HISTORY,
  removeHistoryItem,
  saveHistory,
} from '../../lib/history';
import {
  clearHistoryMeta,
  loadHistoryMeta,
  removeHistoryMeta,
  upsertHistoryMeta,
  type HistoryMetaMap,
  type HistoryMetaPatch,
} from '../../lib/historyMeta';
import { createTranslator, type MessageKey, type Translator, type UiLang } from '../../lib/i18n';
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
import { addVocabularyEntry, type VocabularyInput } from '../../lib/learn/vocabulary';
import { injectContentScripts } from '../../lib/platform/inject';
import { showToast } from '../../lib/ui/toast';
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
import type { GlossaryEntry } from '../../lib/translate/types';

interface OcrState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  progress: number;
  statusText?: string;
  result?: OcrResult;
  error?: AppError;
  fallback?: boolean;
}

interface TranslationState {
  createdAt: number;
  status: 'running' | 'done' | 'error';
  statusText?: string;
  text?: string;
  engine?: string;
  durationMs?: number;
  error?: AppError;
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
  error?: AppError;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<SelectionPayload[]>([]);
  const [activeCreatedAt, setActiveCreatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState('');
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
  const [historyMeta, setHistoryMeta] = useState<HistoryMetaMap>({});
  const learningRequestId = useRef(0);
  const ocrCache = useRef(new Map<string, OcrResult>());
  const recentPairs = useRef<{ createdAt: number; source: string; translation?: string }[]>([]);
  const historyMetaRef = useRef<HistoryMetaMap>({});
  const metaWrite = useRef<Promise<void>>(Promise.resolve());

  const lang: UiLang = settings?.uiLang ?? DEFAULT_SETTINGS.uiLang;
  const tr = useMemo(() => createTranslator(lang), [lang]);

  const persistHistoryMeta = (createdAt: number, patch: HistoryMetaPatch): Promise<void> => {
    metaWrite.current = metaWrite.current.then(async () => {
      const next = await upsertHistoryMeta(createdAt, patch);
      historyMetaRef.current = next;
      setHistoryMeta(next);
    });
    return metaWrite.current;
  };

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
  const targetLabel = targetLang === 'zh-TW' ? tr('targetTraditional') : tr('targetSimplified');
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
  const ocrBusy =
    ocrState?.status === 'running' && ocrState.createdAt === activeSelection?.createdAt;
  const translationBusy =
    translationState?.status === 'running' &&
    translationState.createdAt === activeSelection?.createdAt;
  const learningBusy =
    learningState?.status === 'running' && learningState.createdAt === activeSelection?.createdAt;
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

    void loadHistoryMeta().then((meta) => {
      historyMetaRef.current = meta;
      setHistoryMeta(meta);
    });

    const listener = (message: unknown) => {
      if (isSelectionCropped(message)) {
        setHistory((previous) => mergeHistory(previous, [message.payload]));
        setActiveCreatedAt(message.payload.createdAt);
        setStatus(tr('statusCaptured'));
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
    setOcrState({
      createdAt: activeId,
      status: 'running',
      progress: 0,
      statusText: tr('ocrPreparing'),
    });

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
        setStatus(tr(outcome.fallback ? 'statusOcrFallback' : 'statusOcrDone'));
        void persistHistoryMeta(activeId, {
          ocrText: outcome.result.text,
          ocrEngine: outcome.result.engine,
          ocrConfidence: outcome.result.confidence ?? null,
          ocrDurationMs: outcome.result.durationMs,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOcrState({
          createdAt: activeId,
          status: 'error',
          progress: 0,
          error: classifyError(error, 'ocr'),
        });
        setStatus(tr('statusOcrFailed'));
        showToast(tr('ocrFailedTitle'), 'error');
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
    const manual = manualTranslation?.createdAt === activeId;
    if (!shouldTranslate) {
      setTranslationState((previous) => (previous?.createdAt === activeId ? previous : null));
      return;
    }

    const meta = historyMetaRef.current[String(activeId)];
    if (!manual && meta?.translation && meta.ocrText === recognizedText) {
      setTranslationState({
        createdAt: activeId,
        status: 'done',
        text: meta.translation,
        engine: meta.translationEngine,
        durationMs: meta.translationDurationMs,
      });
      recentPairs.current = [
        ...recentPairs.current.filter((pair) => pair.createdAt !== activeId),
        { createdAt: activeId, source: recognizedText, translation: meta.translation },
      ].slice(-5);
      return;
    }

    let cancelled = false;
    setTranslationState({
      createdAt: activeId,
      status: 'running',
      statusText: tr('translationProgressPreparing'),
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
        void persistHistoryMeta(activeId, {
          translation: cached.text,
          translationEngine: cached.engine,
          translationDurationMs: cached.durationMs,
        });
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
        void persistHistoryMeta(activeId, {
          translation: result.text,
          translationEngine: result.engine,
          translationDurationMs: result.durationMs,
        });
        setStatus(tr('statusTranslationDone'));
        if (manual) {
          showToast(tr('statusTranslationDone'), 'success');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setTranslationState({
          createdAt: activeId,
          status: 'error',
          error: classifyError(error, 'translation'),
        });
        setStatus(tr('statusTranslationFailed'));
        showToast(tr('translationFailedTitle'), 'error');
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
    const meta = activeId ? historyMetaRef.current[String(activeId)] : undefined;
    if (meta?.learning && meta.ocrText === recognizedText) {
      const snapshot = meta.learning;
      setLearningState({
        createdAt: activeId as number,
        status: 'done',
        mode: snapshot.mode,
        card: snapshot.card,
        tokens: snapshot.tokens,
        engine: snapshot.engine,
        durationMs: snapshot.durationMs,
      });
      setLearningCollapsed(false);
      return;
    }
    setLearningState(null);
    setLearningCollapsed(false);
  }, [activeId, recognizedText, targetLang]);

  useEffect(() => {
    setLearningState((previous) => {
      if (previous?.mode !== 'llm') {
        return previous;
      }
      const meta = activeId ? historyMetaRef.current[String(activeId)] : undefined;
      if (meta?.learning?.mode === 'llm' && meta.translation === translationText) {
        return previous;
      }
      learningRequestId.current += 1;
      return null;
    });
  }, [translationText]);

  const openOptions = (hash: 'settings' | 'vocabulary') => {
    void browser.tabs.create({ url: browser.runtime.getURL(`options.html#${hash}`) });
  };

  const startSelection = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (await tryStartSelection(tab.id)) {
      setStatus(tr('statusSelectionMode'));
      showToast(tr('selectionModeTitle'), 'info');
      return;
    }

    const injected = await injectContentScripts(tab.id, contentScriptFiles());
    if (injected && (await tryStartSelection(tab.id))) {
      setStatus(tr('statusSelectionMode'));
      showToast(tr('selectionModeTitle'), 'info');
      return;
    }

    setStatus(tr('statusCannotSelect'));
    showToast(tr('cannotSelectTitle'), 'error');
  };

  const selectHistory = (createdAt: number) => {
    const meta = historyMetaRef.current[String(createdAt)];
    if (meta?.ocrText) {
      const key = `${createdAt}:${orientation}:${readingOrder}:${engineSetting}:${serviceUrl}`;
      if (!ocrCache.current.has(key)) {
        ocrCache.current.set(key, {
          text: meta.ocrText,
          confidence: meta.ocrConfidence ?? null,
          engine: meta.ocrEngine ?? 'history',
          durationMs: meta.ocrDurationMs ?? 0,
        });
      }
    }
    setActiveCreatedAt(createdAt);
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
    const nextMeta = await removeHistoryMeta(createdAt);
    historyMetaRef.current = nextMeta;
    setHistoryMeta(nextMeta);
    setStatus(tr('statusHistoryDeleted'));
    showToast(tr('historyDeletedTitle'), 'success');
  };

  const clearAll = async () => {
    if (!window.confirm(tr('confirmClearHistory'))) {
      return;
    }
    await clearHistory();
    await clearHistoryMeta();
    historyMetaRef.current = {};
    setHistoryMeta({});
    setHistory([]);
    setActiveCreatedAt(null);
    ocrCache.current.clear();
    setStatus(tr('statusHistoryCleared'));
    showToast(tr('historyClearedTitle'), 'success');
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
    if (!status.available) {
      showToast(tr('serviceToastDown'), 'error');
    } else if (status.loading) {
      showToast(tr('serviceToastLoading'), 'info');
    } else if (status.ready) {
      showToast(tr('serviceToastReady'), 'success');
    } else {
      showToast(tr('serviceToastNotReady'), 'error');
    }
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
      setStatus(tr('statusCopyTranslationDone'));
      showToast(tr('copyTranslationDoneTitle'), 'success');
    } catch {
      setStatus(tr('statusCopyFailed'));
      showToast(tr('copyFailedTitle'), 'error');
    }
  };

  const addWordToNotebook = async (word: Omit<VocabularyInput, 'source' | 'translation'>) => {
    try {
      await addVocabularyEntry({
        ...word,
        source: recognizedText,
        translation: translationText,
      });
      setStatus(tr('statusAddedVocabulary', { surface: word.surface }));
      showToast(tr('statusAddedVocabulary', { surface: word.surface }), 'success');
    } catch (error) {
      showToast(classifyError(error, 'save').message, 'error');
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
        statusText: tr('learningProgressTokenize'),
      });

      const started = performance.now();
      try {
        const result = await tokenizeWithService(settings.ocrServiceUrl, recognizedText);
        if (requestId !== learningRequestId.current) {
          return;
        }
        const durationMs = Math.round(performance.now() - started);
        setLearningState({
          createdAt: capturedId,
          status: 'done',
          mode,
          tokens: result.tokens,
          engine: '本地分词 (fugashi)',
          durationMs,
        });
        setLearningCollapsed(false);
        setStatus(tr('statusBasicDone'));
        showToast(tr('statusBasicDone'), 'success');
        void persistHistoryMeta(capturedId, {
          learning: {
            mode,
            tokens: result.tokens,
            engine: '本地分词 (fugashi)',
            durationMs,
            updatedAt: Date.now(),
          },
        });
      } catch (error) {
        if (requestId !== learningRequestId.current) {
          return;
        }
        setLearningState({
          createdAt: capturedId,
          status: 'error',
          mode,
          error: classifyError(error, 'learning'),
        });
        setStatus(tr('learningBasicFailedTitle'));
        showToast(tr('learningBasicFailedTitle'), 'error');
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
        void persistHistoryMeta(capturedId, {
          learning: {
            mode,
            card: cached.card,
            engine: cached.engine,
            durationMs: cached.durationMs,
            updatedAt: Date.now(),
          },
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
      statusText: tr('learningProgressCard'),
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
      setStatus(tr('statusLearningDone'));
      showToast(tr('statusLearningDone'), 'success');
      void persistHistoryMeta(capturedId, {
        learning: {
          mode,
          card: result.card,
          engine: result.engine,
          durationMs: result.durationMs,
          updatedAt: Date.now(),
        },
      });
    } catch (error) {
      if (requestId !== learningRequestId.current) {
        return;
      }
      setLearningState({
        createdAt: capturedId,
        status: 'error',
        mode,
        error: classifyError(error, 'learning'),
      });
      setStatus(tr('learningCardFailedTitle'));
      showToast(tr('learningCardFailedTitle'), 'error');
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
      setStatus(tr('statusCopyOcrDone'));
      showToast(tr('copyOcrDoneTitle'), 'success');
    } catch {
      setStatus(tr('statusCopyFailed'));
      showToast(tr('copyFailedTitle'), 'error');
    }
  };

  const renderOcr = () => {
    if (!activeSelection) {
      return <p className="placeholder">{tr('ocrSelectFirst')}</p>;
    }
    if (!ocrState || ocrState.createdAt !== activeSelection.createdAt) {
      return <p className="placeholder">{tr('ocrPreparing')}</p>;
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
            {ocrProgressLabel(ocrState.statusText, tr)}
            {indeterminate ? '…' : ` ${percent}%`}
          </span>
        </div>
      );
    }
    if (ocrState.status === 'error') {
      return (
        <ErrorPanel
          error={ocrState.error ?? makeError('unknown', '', 'ocr')}
          lang={lang}
          onRetry={retryOcr}
          retryLabel={tr('ocrRetry')}
          retryDisabled={ocrBusy}
        />
      );
    }

    const result = ocrState.result;
    if (!result) {
      return <p className="placeholder">{tr('ocrNoResult')}</p>;
    }

    return (
      <div className="ocr-result">
        <pre className="ocr-text">{result.text || tr('ocrEmptyText')}</pre>
        <p className="ocr-meta">
          {typeof result.confidence === 'number'
            ? `${tr('ocrConfidence', { value: Math.round(result.confidence) })} · `
            : ''}
          {tr('ocrMeta', { engine: result.engine, duration: result.durationMs })}
        </p>
        {!result.text && (
          <div className="error-panel" role="alert">
            <p className="error-title">{tr('error.title.emptyOcr')}</p>
            <p className="error-hint">{tr('error.hint.emptyOcr')}</p>
            <button
              className="ghost error-retry"
              onClick={retryOcr}
              disabled={ocrBusy}
              type="button"
            >
              {ocrBusy ? tr('stateRetrying') : tr('ocrRetry')}
            </button>
          </div>
        )}
        {ocrState.fallback && <p className="ocr-note">{tr('ocrFallbackNote')}</p>}
      </div>
    );
  };

  const renderTranslation = () => {
    if (!activeSelection) {
      return <p className="placeholder">{tr('ocrSelectFirst')}</p>;
    }
    if (ocrState?.status !== 'done' || !ocrState.result?.text) {
      return <p className="placeholder">{tr('translationWaitingOcr')}</p>;
    }
    if (
      !settings?.autoTranslate &&
      manualTranslation?.createdAt !== activeSelection.createdAt &&
      translationState?.status !== 'done'
    ) {
      return <p className="placeholder">{tr('translationAutoOff')}</p>;
    }
    if (!translationState || translationState.createdAt !== activeSelection.createdAt) {
      return <p className="placeholder">{tr('translationPreparing')}</p>;
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
            <span className="progress-label">
              {translationState.statusText ?? tr('translationTranslating')}…
            </span>
          </div>
        </div>
      );
    }
    if (translationState.status === 'error') {
      return (
        <ErrorPanel
          error={translationState.error ?? makeError('unknown', '', 'translation')}
          lang={lang}
          onRetry={() => void requestTranslation()}
          retryLabel={tr('translationRetry')}
          retryDisabled={translationBusy}
        />
      );
    }

    return (
      <div className="translation-result">
        <p className="translation-text">{translationState.text || tr('translationEmpty')}</p>
        <p className="ocr-meta">
          {translationState.engine && translationState.durationMs !== undefined
            ? tr('translationMeta', {
                engine: translationState.engine,
                duration: translationState.durationMs,
              })
            : translationState.engine}
        </p>
      </div>
    );
  };

  const renderLearning = () => {
    if (!activeSelection) {
      return <p className="placeholder">{tr('learningSelectFirst')}</p>;
    }
    if (ocrState?.status !== 'done' || !recognizedText) {
      return <p className="placeholder">{tr('learningWaitingOcr')}</p>;
    }
    if (llmConfigured && (translationState?.status !== 'done' || !translationText)) {
      return <p className="placeholder">{tr('learningWaitTranslation')}</p>;
    }
    if (!learningState || learningState.createdAt !== activeSelection.createdAt) {
      return (
        <p className="placeholder">
          {llmConfigured ? tr('learningPlaceholderLlm') : tr('learningPlaceholderBasic')}
        </p>
      );
    }
    if (learningState.status === 'running') {
      return (
        <div className="ocr-progress">
          <div className="progress-track">
            <div className="progress-bar indeterminate" />
          </div>
          <span className="progress-label">
            {learningState.statusText ?? tr('learningGenerating')}…
          </span>
        </div>
      );
    }
    if (learningState.status === 'error') {
      return (
        <ErrorPanel
          error={learningState.error ?? makeError('unknown', '', 'learning')}
          lang={lang}
          onRetry={() => void generateLearning(true)}
          retryLabel={
            learningState.mode === 'basic' ? tr('learningRetokenize') : tr('learningRegenerate')
          }
          retryDisabled={learningBusy}
        />
      );
    }

    if (learningState.mode === 'basic') {
      const tokens = learningState.tokens ?? [];
      if (learningCollapsed) {
        return (
          <p className="placeholder">{tr('learningCollapsedBasic', { count: tokens.length })}</p>
        );
      }
      if (tokens.length === 0) {
        return <p className="placeholder">{tr('learningEmptyTokens')}</p>;
      }
      return (
        <div className="learn-list">
          <p className="ocr-note">{tr('learningBasicNote')}</p>
          {tokens.map((token, index) => (
            <div className="learn-word" key={`${token.surface}-${index}`}>
              <div className="learn-word-head">
                <span className="learn-surface">{token.surface}</span>
                {token.reading && <span className="learn-reading">{token.reading}</span>}
                {token.pos && <span className="learn-pos">{token.pos}</span>}
                <button
                  className="ghost learn-add"
                  onClick={() =>
                    void addWordToNotebook({
                      surface: token.surface,
                      reading: token.reading,
                      pos: token.pos,
                      meaning: '',
                      usage: '',
                      example: '',
                    })
                  }
                  type="button"
                >
                  {tr('learningAddVocabulary')}
                </button>
              </div>
              {(token.lemma || token.form) && (
                <p className="learn-detail">
                  {token.lemma && token.lemma !== token.surface
                    ? tr('learningLemma', { lemma: token.lemma })
                    : ''}
                  {token.form
                    ? `${token.lemma && token.lemma !== token.surface ? ' · ' : ''}${tr('learningForm', { form: token.form })}`
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
      return <p className="placeholder">{tr('learningNoContent')}</p>;
    }
    if (learningCollapsed) {
      return (
        <p className="placeholder">
          {tr('learningCollapsedLlm', { words: card.words.length, grammar: card.grammar.length })}
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
              <button
                className="ghost learn-add"
                onClick={() =>
                  void addWordToNotebook({
                    surface: word.surface,
                    reading: word.reading,
                    pos: word.pos,
                    meaning: word.meaning,
                    usage: word.usage,
                    example: word.example,
                  })
                }
                type="button"
              >
                {tr('learningAddVocabulary')}
              </button>
            </div>
            {word.meaning && <p className="learn-meaning">{word.meaning}</p>}
            {word.usage && (
              <p className="learn-detail">{tr('learningUsage', { text: word.usage })}</p>
            )}
            {word.example && (
              <p className="learn-example">{tr('learningExample', { text: word.example })}</p>
            )}
          </div>
        ))}
        {card.grammar.map((grammar, index) => (
          <div className="learn-grammar" key={`${grammar.pattern}-${index}`}>
            <p className="learn-pattern">{grammar.pattern}</p>
            {grammar.meaning && <p className="learn-meaning">{grammar.meaning}</p>}
            {grammar.nuance && (
              <p className="learn-detail">{tr('learningNuance', { text: grammar.nuance })}</p>
            )}
            {grammar.example && (
              <p className="learn-example">{tr('learningExample', { text: grammar.example })}</p>
            )}
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
      <header className="panel-header">
        <div>
          <h1>{tr('appName')}</h1>
          <p className="subtitle">{tr('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => openOptions('vocabulary')} type="button">
            {tr('navVocabulary')}
          </button>
          <button className="ghost" onClick={() => openOptions('settings')} type="button">
            {tr('optionsTabSettings')}
          </button>
        </div>
      </header>

      <button className="primary" onClick={startSelection} type="button">
        {tr('startSelection')}
      </button>

      <p className="status">{status || tr('statusIdle')}</p>

      <section className="ocr">
        <div className="result-head">
          <h2>{tr('ocrTitle')}</h2>
          <div className="head-actions">
            {ocrState?.status === 'done' && ocrState.result?.text && (
              <button className="ghost" onClick={() => void copyOcrText()} type="button">
                {tr('ocrCopy')}
              </button>
            )}
            {activeSelection && (
              <button className="ghost" onClick={retryOcr} disabled={ocrBusy} type="button">
                {ocrBusy ? tr('ocrRetrying') : tr('ocrRetry')}
              </button>
            )}
          </div>
        </div>

        <div className="ocr-options">
          <label>
            {tr('ocrEngine')}
            <select
              value={engineSetting}
              onChange={(event) =>
                updateOcrSettings({ ocrEngine: event.target.value as OcrEngineSetting })
              }
            >
              <option value="auto">{tr('ocrEngineAuto')}</option>
              <option value="tesseract">{tr('ocrEngineTesseract')}</option>
            </select>
          </label>
          <label>
            {tr('ocrOrientation')}
            <select
              value={orientation}
              onChange={(event) => changeOrientation(event.target.value as OcrOrientation)}
            >
              <option value="vertical">{tr('ocrVertical')}</option>
              <option value="horizontal">{tr('ocrHorizontal')}</option>
            </select>
          </label>
          <label>
            {tr('ocrOrder')}
            <select
              value={readingOrder}
              onChange={(event) => changeReadingOrder(event.target.value as ReadingOrder)}
            >
              <option value="rtl">{tr('ocrRtl')}</option>
              <option value="ltr">{tr('ocrLtr')}</option>
            </select>
          </label>
        </div>

        <p className="ocr-hint">{tr('ocrHint')}</p>

        <div className="service-status">
          <span title={serviceStatus?.error}>
            {serviceStatusLabel(serviceStatus, serviceChecking, tr)}
          </span>
          <button
            className="ghost"
            onClick={() => void refreshService()}
            disabled={serviceChecking}
            type="button"
          >
            {serviceChecking ? tr('serviceRetrying') : tr('serviceRetry')}
          </button>
        </div>

        {renderOcr()}
      </section>

      <section className="translation">
        <div className="result-head">
          <h2>{tr('translationTitle', { lang: targetLabel })}</h2>
          <div className="head-actions">
            {translationState?.status === 'done' && translationState.text && (
              <button className="ghost" onClick={() => void copyTranslation()} type="button">
                {tr('translationCopy')}
              </button>
            )}
            <button
              className="ghost"
              onClick={() => void requestTranslation()}
              disabled={!recognizedText || translationBusy}
              title={!recognizedText ? tr('translationWaitingOcr') : undefined}
              type="button"
            >
              {translationBusy
                ? tr('translationTranslating')
                : translationState?.status === 'done'
                  ? tr('translationRetry')
                  : tr('translationTranslate')}
            </button>
          </div>
        </div>
        {renderTranslation()}
      </section>

      <section className="learning">
        <div className="result-head">
          <h2>{tr('learningTitle')}</h2>
          <div className="head-actions">
            {learningState?.status === 'done' && (
              <>
                <button
                  className="ghost"
                  onClick={() => setLearningCollapsed((value) => !value)}
                  type="button"
                >
                  {learningCollapsed ? tr('actionExpand') : tr('actionCollapse')}
                </button>
                <button className="ghost" onClick={() => void generateLearning(true)} type="button">
                  {learningState?.mode === 'basic'
                    ? tr('learningRetokenize')
                    : tr('learningRegenerate')}
                </button>
              </>
            )}
            {learningState?.status !== 'done' && (
              <button
                className="ghost"
                onClick={() => void generateLearning()}
                disabled={!canGenerateLearning || learningBusy}
                title={!canGenerateLearning ? tr('learningWaitTranslation') : undefined}
                type="button"
              >
                {learningBusy
                  ? tr('learningGenerating')
                  : llmConfigured
                    ? tr('learningGenerate')
                    : tr('learningTokenize')}
              </button>
            )}
          </div>
        </div>
        {renderLearning()}
      </section>

      <section className="result">
        <div className="result-head">
          <h2>{tr('previewTitle')}</h2>
          {activeSelection && (
            <button
              className="ghost"
              onClick={() => void removeItem(activeSelection.createdAt)}
              type="button"
            >
              {tr('previewDelete')}
            </button>
          )}
        </div>

        {activeSelection ? (
          <div className="preview">
            <img src={activeSelection.dataUrl} alt={tr('previewTitle')} />
            <dl>
              <div>
                <dt>{tr('previewSize')}</dt>
                <dd>
                  {activeSelection.width} × {activeSelection.height}
                </dd>
              </div>
              <div>
                <dt>{tr('previewSource')}</dt>
                <dd>{sourceLabel(activeSelection.source, tr)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="placeholder">{tr('previewEmpty')}</p>
        )}
      </section>

      <section className="history">
        <div className="result-head">
          <h2>
            {history.length > 0
              ? tr('historyTitleCount', { count: history.length })
              : tr('historyTitle')}
          </h2>
          {history.length > 0 && (
            <button className="ghost" onClick={() => void clearAll()} type="button">
              {tr('historyClear')}
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <ul className="history-list">
            {history.map((item) => {
              const meta = historyMeta[String(item.createdAt)];
              return (
                <li
                  key={item.createdAt}
                  className={item.createdAt === activeCreatedAt ? 'active' : undefined}
                >
                  <button
                    className="thumb"
                    onClick={() => selectHistory(item.createdAt)}
                    title={
                      meta?.translation
                        ? `${item.width} × ${item.height} · ${sourceLabel(item.source, tr)} · ${meta.translation}`
                        : `${item.width} × ${item.height} · ${sourceLabel(item.source, tr)}`
                    }
                    type="button"
                  >
                    <img src={item.dataUrl} alt="" />
                    <span>
                      {item.width}×{item.height}
                    </span>
                    {meta?.translation && (
                      <span className="thumb-badge">{tr('historyTranslatedBadge')}</span>
                    )}
                  </button>
                  <button
                    className="remove"
                    onClick={() => void removeItem(item.createdAt)}
                    aria-label={tr('historyDeleteAria')}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="placeholder">{tr('historyEmpty')}</p>
        )}
      </section>

      <footer>
        {tr('footerSummary', {
          source: settings ? settings.sourceLang : '...',
          target: settings ? settings.targetLang : '...',
        })}
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

function contentScriptFiles(): string[] {
  const manifest = browser.runtime.getManifest();
  return (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []);
}

function serviceStatusLabel(
  status: ServiceStatus | null,
  checking: boolean,
  tr: Translator,
): string {
  if (checking) {
    return tr('serviceChecking');
  }
  if (!status) {
    return tr('serviceNotDetected');
  }
  if (!status.available) {
    return tr('serviceDown');
  }
  if (status.loading) {
    return tr('serviceLoading');
  }
  if (status.ready) {
    return tr('serviceReady');
  }
  return tr('serviceNotReady');
}

function ocrProgressLabel(status: string | undefined, tr: Translator): string {
  const labels: Record<string, MessageKey> = {
    'loading tesseract core': 'ocrProgressLoadingCore',
    'loading language traineddata': 'ocrProgressLanguage',
    'initializing tesseract': 'ocrProgressInit',
    'recognizing text': 'ocrProgressRecognize',
  };

  if (!status) {
    return tr('ocrProgress');
  }
  const key = labels[status];
  return key ? tr(key) : status;
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

function sourceLabel(source: SelectionSource, tr: Translator): string {
  switch (source) {
    case 'img':
      return tr('sourceImg');
    case 'canvas':
      return tr('sourceCanvas');
    case 'video':
      return tr('sourceVideo');
    case 'background':
      return tr('sourceBackground');
    case 'viewport':
      return tr('sourceViewport');
    default:
      return source;
  }
}
