import { useEffect, useMemo, useState } from 'react';
import { classifyError } from '../../lib/errors';
import {
  createTranslator,
  UI_LANGS,
  uiLanguageLabel,
  type MessageKey,
  type UiLang,
} from '../../lib/i18n';
import {
  clearVocabulary,
  loadVocabulary,
  normalizeVocabulary,
  removeVocabularyEntry,
  serializeVocabularyCsv,
  serializeVocabularyJson,
  type VocabularyEntry,
} from '../../lib/learn/vocabulary';
import { checkOcrService } from '../../lib/ocr/service';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type OcrEngineSetting,
  type Settings,
} from '../../lib/settings';
import { translateText } from '../../lib/translate/engine';
import {
  clearGlossary,
  loadGlossary,
  parseGlossary,
  saveGlossary,
  serializeGlossaryCsv,
} from '../../lib/translate/glossary';
import type { GlossaryEntry, TranslationProviderSetting } from '../../lib/translate/types';
import { showToast } from '../../lib/ui/toast';

type Tab = 'settings' | 'vocabulary';

const TARGET_LANGS: { value: string; key: MessageKey }[] = [
  { value: 'zh-CN', key: 'targetSimplified' },
  { value: 'zh-TW', key: 'targetTraditional' },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');
  const [translationTest, setTranslationTest] = useState('');
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [glossaryText, setGlossaryText] = useState('');
  const [glossaryMessage, setGlossaryMessage] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [vocabQuery, setVocabQuery] = useState('');
  const [vocabMessage, setVocabMessage] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    window.location.hash === '#vocabulary' ? 'vocabulary' : 'settings',
  );
  const [saving, setSaving] = useState(false);
  const [serviceTesting, setServiceTesting] = useState(false);
  const [translationTesting, setTranslationTesting] = useState(false);
  const [glossaryBusy, setGlossaryBusy] = useState(false);

  const lang = settings.uiLang;
  const tr = useMemo(() => createTranslator(lang), [lang]);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void loadGlossary().then(setGlossary);
    void loadVocabulary().then(setVocabulary);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      setActiveTab(window.location.hash === '#vocabulary' ? 'vocabulary' : 'settings');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    const handleStorage = (
      changes: { [key: string]: { newValue?: unknown } },
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.vocabulary) {
        setVocabulary(normalizeVocabulary(changes.vocabulary.newValue));
      }
    };

    browser.storage.onChanged.addListener(handleStorage);
    return () => browser.storage.onChanged.removeListener(handleStorage);
  }, []);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', tab === 'vocabulary' ? '#vocabulary' : '#settings');
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      setSaved(true);
      showToast(tr('optionsSaved'), 'success');
    } catch (error) {
      showToast(tr('optionsSaveFailed', { detail: classifyError(error, 'save').message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const testService = async () => {
    setServiceTesting(true);
    setServiceMessage(tr('optionsTesting'));
    try {
      const status = await checkOcrService(settings.ocrServiceUrl);
      let message: string;
      let type: 'success' | 'info' | 'error';

      if (!status.available) {
        message = tr('optionsServiceNotConnected', {
          detail: status.error ?? tr('serviceDown'),
        });
        type = 'error';
      } else if (status.loading) {
        message = tr('optionsServiceConnectedLoading');
        type = 'info';
      } else if (status.ready) {
        message = tr('optionsServiceConnectedReady');
        type = 'success';
      } else {
        message = tr('optionsServiceConnectedNotReady', {
          detail: status.error ?? tr('serviceNotReady'),
        });
        type = 'error';
      }

      setServiceMessage(message);
      showToast(message, type);
    } finally {
      setServiceTesting(false);
    }
  };

  const testTranslation = async () => {
    setTranslationTesting(true);
    setTranslationTest(tr('optionsTesting'));
    try {
      const result = await translateText(
        { text: 'こんにちは', sourceLang: 'ja', targetLang: settings.targetLang },
        settings,
      );
      const message = `${result.engine}：${result.text}`;
      setTranslationTest(message);
      showToast(tr('optionsTestTranslationSuccess'), 'success');
    } catch (error) {
      const message = `${tr('optionsTestTranslationFailed')}：${classifyError(error, 'translation').message}`;
      setTranslationTest(message);
      showToast(message, 'error');
    } finally {
      setTranslationTesting(false);
    }
  };

  const importGlossary = async () => {
    const entries = parseGlossary(glossaryText);
    if (entries.length === 0) {
      setGlossaryMessage(tr('optionsNoValidEntries'));
      showToast(tr('optionsNoValidEntries'), 'error');
      return;
    }

    setGlossaryBusy(true);
    try {
      await saveGlossary(entries);
      setGlossary(entries);
      setGlossaryMessage(tr('optionsGlossaryImportedCount', { count: entries.length }));
      showToast(tr('optionsGlossaryImportedCount', { count: entries.length }), 'success');
    } finally {
      setGlossaryBusy(false);
    }
  };

  const handleGlossaryFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    setGlossaryText(text);
    const entries = parseGlossary(text);
    if (entries.length === 0) {
      setGlossaryMessage(tr('optionsFileNoValidEntries'));
      showToast(tr('optionsFileNoValidEntries'), 'error');
      return;
    }

    setGlossaryBusy(true);
    try {
      await saveGlossary(entries);
      setGlossary(entries);
      setGlossaryMessage(tr('optionsImportedFromFile', { count: entries.length }));
      showToast(tr('optionsImportedFromFile', { count: entries.length }), 'success');
    } finally {
      setGlossaryBusy(false);
    }
  };

  const clearAllGlossary = async () => {
    if (!window.confirm(tr('optionsConfirmClearGlossary'))) {
      return;
    }
    setGlossaryBusy(true);
    try {
      await clearGlossary();
      setGlossary([]);
      setGlossaryText('');
      setGlossaryMessage(tr('optionsGlossaryCleared'));
      showToast(tr('optionsGlossaryCleared'), 'success');
    } finally {
      setGlossaryBusy(false);
    }
  };

  const downloadFile = (content: string, type: string, filename: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportGlossary = () => {
    downloadFile(serializeGlossaryCsv(glossary), 'text/csv;charset=utf-8', 'glossary.csv');
    showToast(tr('optionsExportedGlossary'), 'success');
  };

  const deleteVocab = async (id: string) => {
    try {
      const next = await removeVocabularyEntry(id);
      setVocabulary(next);
      setVocabMessage(tr('optionsDeleted'));
      showToast(tr('optionsDeleted'), 'success');
    } catch (error) {
      showToast(classifyError(error, 'save').message, 'error');
    }
  };

  const clearVocab = async () => {
    if (!window.confirm(tr('optionsConfirmClearVocabulary'))) {
      return;
    }
    await clearVocabulary();
    setVocabulary([]);
    setVocabMessage(tr('optionsVocabularyCleared'));
    showToast(tr('optionsVocabularyCleared'), 'success');
  };

  const exportVocabCsv = () => {
    downloadFile(serializeVocabularyCsv(vocabulary), 'text/csv;charset=utf-8', 'vocabulary.csv');
    showToast(tr('optionsExportedVocabularyCsv'), 'success');
  };

  const exportVocabJson = () => {
    downloadFile(
      serializeVocabularyJson(vocabulary),
      'application/json;charset=utf-8',
      'vocabulary.json',
    );
    showToast(tr('optionsExportedVocabularyJson'), 'success');
  };

  const query = vocabQuery.trim().toLowerCase();
  const filteredVocabulary = query
    ? vocabulary.filter((entry) =>
        [entry.surface, entry.reading, entry.meaning].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
    : vocabulary;

  return (
    <main className="options">
      <header className="options-header">
        <h1>{tr('appName')}</h1>
        <div className="tab-bar">
          <button
            className={activeTab === 'settings' ? 'tab active' : 'tab'}
            onClick={() => switchTab('settings')}
            type="button"
          >
            {tr('optionsTabSettings')}
          </button>
          <button
            className={activeTab === 'vocabulary' ? 'tab active' : 'tab'}
            onClick={() => switchTab('vocabulary')}
            type="button"
          >
            {tr('optionsTabVocabulary', { count: vocabulary.length })}
          </button>
        </div>
      </header>

      <div className="tab-content">
        {activeTab === 'settings' ? (
          <div className="tab-panel">
            <label>
              {tr('optionsUiLanguage')}
              <select
                value={settings.uiLang}
                onChange={(event) => update('uiLang', event.target.value as UiLang)}
              >
                {UI_LANGS.map((value) => (
                  <option key={value} value={value}>
                    {uiLanguageLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {tr('optionsSourceLanguage')}
              <input
                value={settings.sourceLang}
                onChange={(event) => update('sourceLang', event.target.value)}
              />
            </label>

            <label>
              {tr('optionsTargetLanguage')}
              <select
                value={settings.targetLang}
                onChange={(event) => update('targetLang', event.target.value)}
              >
                {TARGET_LANGS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.key)}
                  </option>
                ))}
              </select>
            </label>

            <h2>{tr('optionsOcrSection')}</h2>

            <label>
              {tr('optionsOcrEngine')}
              <select
                value={settings.ocrEngine}
                onChange={(event) => update('ocrEngine', event.target.value as OcrEngineSetting)}
              >
                <option value="auto">{tr('optionsOcrEngineAuto')}</option>
                <option value="tesseract">{tr('optionsOcrEngineTesseract')}</option>
              </select>
            </label>

            <label>
              {tr('optionsServiceUrl')}
              <input
                value={settings.ocrServiceUrl}
                onChange={(event) => update('ocrServiceUrl', event.target.value)}
              />
            </label>

            <button onClick={() => void testService()} type="button" disabled={serviceTesting}>
              {serviceTesting ? tr('optionsTesting') : tr('optionsTestConnection')}
            </button>

            {serviceMessage && <p className="service-message">{serviceMessage}</p>}

            <h2>{tr('optionsTranslationSection')}</h2>

            <label>
              {tr('optionsTranslationEngine')}
              <select
                value={settings.translationProvider}
                onChange={(event) =>
                  update('translationProvider', event.target.value as TranslationProviderSetting)
                }
              >
                <option value="auto">{tr('optionsProviderAuto')}</option>
                <option value="chrome">{tr('optionsProviderChrome')}</option>
                <option value="mymemory">{tr('optionsProviderMyMemory')}</option>
                <option value="llm">{tr('optionsProviderLlm')}</option>
              </select>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.autoTranslate}
                onChange={(event) => update('autoTranslate', event.target.checked)}
              />
              {tr('optionsAutoTranslate')}
            </label>

            <h2>{tr('optionsGlossarySection')}</h2>

            <p className="hint">{tr('optionsGlossaryHint')}</p>

            <textarea
              rows={6}
              value={glossaryText}
              placeholder={'ルフィ,路飞\nナミ,娜美'}
              onChange={(event) => setGlossaryText(event.target.value)}
            />

            <div className="glossary-actions">
              <button onClick={() => void importGlossary()} type="button" disabled={glossaryBusy}>
                {glossaryBusy ? tr('optionsImporting') : tr('optionsImportText')}
              </button>
              <label className="file-button">
                {tr('actionChooseFile')}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.json"
                  onChange={(event) => void handleGlossaryFile(event.target.files?.[0])}
                />
              </label>
              <button onClick={exportGlossary} type="button" disabled={glossary.length === 0}>
                {tr('actionExportCsv')}
              </button>
              <button
                onClick={() => void clearAllGlossary()}
                type="button"
                disabled={glossary.length === 0 || glossaryBusy}
              >
                {tr('actionClear')}
              </button>
            </div>

            {glossaryMessage && <p className="service-message">{glossaryMessage}</p>}

            <p className="hint">
              {glossary.length > 0
                ? `${tr('optionsGlossaryImportedCount', { count: glossary.length })}${tr(
                    'optionsGlossaryExamples',
                    {
                      examples: glossary
                        .slice(0, 3)
                        .map((entry) => `${entry.source}→${entry.target}`)
                        .join('；'),
                    },
                  )}`
                : tr('optionsGlossaryNone')}
            </p>

            <h2>{tr('optionsLlmSection')}</h2>

            <label>
              {tr('optionsBaseUrl')}
              <input
                value={settings.llmBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => update('llmBaseUrl', event.target.value)}
              />
            </label>

            <label>
              {tr('optionsModel')}
              <input
                value={settings.llmModel}
                placeholder="gpt-4o-mini / qwen2.5:7b"
                onChange={(event) => update('llmModel', event.target.value)}
              />
            </label>

            <label>
              {tr('optionsApiKey')}
              <input
                type="password"
                value={settings.llmApiKey}
                onChange={(event) => update('llmApiKey', event.target.value)}
              />
            </label>

            <p className="hint">{tr('optionsLlmHint')}</p>

            <button
              onClick={() => void testTranslation()}
              type="button"
              disabled={translationTesting}
            >
              {translationTesting ? tr('optionsTesting') : tr('optionsTestTranslation')}
            </button>

            {translationTest && <p className="service-message">{translationTest}</p>}

            <button className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? tr('optionsSaving') : tr('actionSave')}
            </button>

            {saved && <p className="saved">{tr('optionsSaved')}</p>}
          </div>
        ) : (
          <div className="tab-panel">
            <div className="vocab-toolbar">
              <input
                placeholder={tr('optionsSearchPlaceholder')}
                value={vocabQuery}
                onChange={(event) => setVocabQuery(event.target.value)}
              />

              <div className="glossary-actions">
                <button onClick={exportVocabCsv} type="button" disabled={vocabulary.length === 0}>
                  {tr('actionExportCsv')}
                </button>
                <button onClick={exportVocabJson} type="button" disabled={vocabulary.length === 0}>
                  {tr('actionExportJson')}
                </button>
                <button
                  onClick={() => void clearVocab()}
                  type="button"
                  disabled={vocabulary.length === 0}
                >
                  {tr('actionClear')}
                </button>
              </div>

              {vocabMessage && <p className="service-message">{vocabMessage}</p>}

              <p className="hint">
                {tr('optionsVocabularyCount', {
                  total: vocabulary.length,
                  shown: filteredVocabulary.length,
                })}
              </p>
            </div>

            {filteredVocabulary.length === 0 ? (
              <p className="hint">{tr('optionsVocabularyEmpty')}</p>
            ) : (
              <div className="vocab-list">
                {filteredVocabulary.map((entry) => (
                  <div className="vocab-item" key={entry.id}>
                    <div className="vocab-head">
                      <span className="vocab-surface">{entry.surface}</span>
                      {entry.reading && <span className="vocab-reading">{entry.reading}</span>}
                      {entry.pos && <span className="vocab-pos">{entry.pos}</span>}
                      <button
                        className="ghost"
                        onClick={() => void deleteVocab(entry.id)}
                        type="button"
                      >
                        {tr('actionDelete')}
                      </button>
                    </div>
                    {entry.meaning && <p className="vocab-meaning">{entry.meaning}</p>}
                    {entry.usage && (
                      <p className="vocab-detail">{tr('optionsUsage', { text: entry.usage })}</p>
                    )}
                    {entry.example && (
                      <p className="vocab-detail">
                        {tr('optionsExample', { text: entry.example })}
                      </p>
                    )}
                    {entry.source && (
                      <p className="vocab-source">{tr('optionsSource', { text: entry.source })}</p>
                    )}
                    {entry.translation && (
                      <p className="vocab-source">
                        {tr('optionsTranslation', { text: entry.translation })}
                      </p>
                    )}
                    <p className="vocab-meta">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
