import { useEffect, useState } from 'react';
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

const TARGET_LANGS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
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
      showToast('设置已保存', 'success');
    } catch (error) {
      showToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const testService = async () => {
    setServiceTesting(true);
    setServiceMessage('检测中…');
    try {
      const status = await checkOcrService(settings.ocrServiceUrl);
      let message: string;
      let type: 'success' | 'info' | 'error';

      if (!status.available) {
        message = `未连接：${status.error ?? '服务未启动'}`;
        type = 'error';
      } else if (status.loading) {
        message = '已连接，模型加载中…';
        type = 'info';
      } else if (status.ready) {
        message = '已连接，manga-ocr 可用。';
        type = 'success';
      } else {
        message = `已连接，但未就绪：${status.error ?? '未知状态'}`;
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
    setTranslationTest('测试中…');
    try {
      const result = await translateText(
        { text: 'こんにちは', sourceLang: 'ja', targetLang: settings.targetLang },
        settings,
      );
      const message = `${result.engine}：${result.text}`;
      setTranslationTest(message);
      showToast('测试翻译成功', 'success');
    } catch (error) {
      const message = `失败：${error instanceof Error ? error.message : String(error)}`;
      setTranslationTest(message);
      showToast(message, 'error');
    } finally {
      setTranslationTesting(false);
    }
  };

  const importGlossary = async () => {
    const entries = parseGlossary(glossaryText);
    if (entries.length === 0) {
      setGlossaryMessage('没有解析到有效条目');
      showToast('没有解析到有效条目', 'error');
      return;
    }

    setGlossaryBusy(true);
    try {
      await saveGlossary(entries);
      setGlossary(entries);
      setGlossaryMessage(`已导入 ${entries.length} 条`);
      showToast(`已导入 ${entries.length} 条术语`, 'success');
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
      setGlossaryMessage('文件里没有解析到有效条目');
      showToast('文件里没有解析到有效条目', 'error');
      return;
    }

    setGlossaryBusy(true);
    try {
      await saveGlossary(entries);
      setGlossary(entries);
      setGlossaryMessage(`已从文件导入 ${entries.length} 条`);
      showToast(`已从文件导入 ${entries.length} 条术语`, 'success');
    } finally {
      setGlossaryBusy(false);
    }
  };

  const clearAllGlossary = async () => {
    if (!window.confirm('确定清空术语表吗？')) {
      return;
    }
    setGlossaryBusy(true);
    try {
      await clearGlossary();
      setGlossary([]);
      setGlossaryText('');
      setGlossaryMessage('术语表已清空');
      showToast('术语表已清空', 'success');
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
    showToast('已导出术语表 CSV', 'success');
  };

  const deleteVocab = async (id: string) => {
    const next = await removeVocabularyEntry(id);
    setVocabulary(next);
    setVocabMessage('已删除');
    showToast('已删除生词', 'success');
  };

  const clearVocab = async () => {
    if (!window.confirm('确定清空生词本吗？')) {
      return;
    }
    await clearVocabulary();
    setVocabulary([]);
    setVocabMessage('生词本已清空');
    showToast('生词本已清空', 'success');
  };

  const exportVocabCsv = () => {
    downloadFile(serializeVocabularyCsv(vocabulary), 'text/csv;charset=utf-8', 'vocabulary.csv');
    showToast('已导出生词本 CSV', 'success');
  };

  const exportVocabJson = () => {
    downloadFile(
      serializeVocabularyJson(vocabulary),
      'application/json;charset=utf-8',
      'vocabulary.json',
    );
    showToast('已导出生词本 JSON', 'success');
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
        <h1>Translator Helper</h1>
        <div className="tab-bar">
          <button
            className={activeTab === 'settings' ? 'tab active' : 'tab'}
            onClick={() => switchTab('settings')}
            type="button"
          >
            设置
          </button>
          <button
            className={activeTab === 'vocabulary' ? 'tab active' : 'tab'}
            onClick={() => switchTab('vocabulary')}
            type="button"
          >
            生词本（{vocabulary.length}）
          </button>
        </div>
      </header>

      <div className="tab-content">
        {activeTab === 'settings' ? (
          <div className="tab-panel">
            <label>
              源语言
              <input
                value={settings.sourceLang}
                onChange={(event) => update('sourceLang', event.target.value)}
              />
            </label>

            <label>
              目标语言
              <select
                value={settings.targetLang}
                onChange={(event) => update('targetLang', event.target.value)}
              >
                {TARGET_LANGS.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <h2>OCR</h2>

            <label>
              OCR 引擎
              <select
                value={settings.ocrEngine}
                onChange={(event) => update('ocrEngine', event.target.value as OcrEngineSetting)}
              >
                <option value="auto">本地 manga-ocr（失败回退 Tesseract）</option>
                <option value="tesseract">仅内置 Tesseract</option>
              </select>
            </label>

            <label>
              本地服务地址
              <input
                value={settings.ocrServiceUrl}
                onChange={(event) => update('ocrServiceUrl', event.target.value)}
              />
            </label>

            <button onClick={() => void testService()} type="button" disabled={serviceTesting}>
              {serviceTesting ? '检测中…' : '测试连接'}
            </button>

            {serviceMessage && <p className="service-message">{serviceMessage}</p>}

            <h2>翻译</h2>

            <label>
              翻译引擎
              <select
                value={settings.translationProvider}
                onChange={(event) =>
                  update('translationProvider', event.target.value as TranslationProviderSetting)
                }
              >
                <option value="auto">自动（LLM → Chrome 内置 → MyMemory）</option>
                <option value="chrome">Chrome 内置翻译</option>
                <option value="mymemory">MyMemory</option>
                <option value="llm">LLM</option>
              </select>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.autoTranslate}
                onChange={(event) => update('autoTranslate', event.target.checked)}
              />
              识别完成后自动翻译
            </label>

            <h2>术语表</h2>

            <p className="hint">
              格式：CSV / TSV / JSON，每行
              source,target，例如「ルフィ,路飞」。导入后会在翻译时强制使用。
            </p>

            <textarea
              rows={6}
              value={glossaryText}
              placeholder={'ルフィ,路飞\nナミ,娜美'}
              onChange={(event) => setGlossaryText(event.target.value)}
            />

            <div className="glossary-actions">
              <button onClick={() => void importGlossary()} type="button" disabled={glossaryBusy}>
                {glossaryBusy ? '导入中…' : '导入文本'}
              </button>
              <label className="file-button">
                选择文件
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.json"
                  onChange={(event) => void handleGlossaryFile(event.target.files?.[0])}
                />
              </label>
              <button onClick={exportGlossary} type="button" disabled={glossary.length === 0}>
                导出 CSV
              </button>
              <button
                onClick={() => void clearAllGlossary()}
                type="button"
                disabled={glossary.length === 0 || glossaryBusy}
              >
                清空
              </button>
            </div>

            {glossaryMessage && <p className="service-message">{glossaryMessage}</p>}

            <p className="hint">
              已导入 {glossary.length} 条
              {glossary.length > 0
                ? `，例如：${glossary
                    .slice(0, 3)
                    .map((entry) => `${entry.source}→${entry.target}`)
                    .join('；')}`
                : ''}
            </p>

            <h2>LLM（可选）</h2>

            <label>
              Base URL
              <input
                value={settings.llmBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => update('llmBaseUrl', event.target.value)}
              />
            </label>

            <label>
              模型
              <input
                value={settings.llmModel}
                placeholder="gpt-4o-mini / qwen2.5:7b"
                onChange={(event) => update('llmModel', event.target.value)}
              />
            </label>

            <label>
              API Key
              <input
                type="password"
                value={settings.llmApiKey}
                onChange={(event) => update('llmApiKey', event.target.value)}
              />
            </label>

            <p className="hint">
              Key 仅存储在浏览器本地（未加密）。Ollama 可用 http://localhost:11434/v1，并设置
              OLLAMA_ORIGINS 允许扩展来源。
            </p>

            <button
              onClick={() => void testTranslation()}
              type="button"
              disabled={translationTesting}
            >
              {translationTesting ? '测试中…' : '测试翻译'}
            </button>

            {translationTest && <p className="service-message">{translationTest}</p>}

            <button className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>

            {saved && <p className="saved">已保存</p>}
          </div>
        ) : (
          <div className="tab-panel">
            <div className="vocab-toolbar">
              <input
                placeholder="搜索表记 / 读音 / 释义"
                value={vocabQuery}
                onChange={(event) => setVocabQuery(event.target.value)}
              />

              <div className="glossary-actions">
                <button onClick={exportVocabCsv} type="button" disabled={vocabulary.length === 0}>
                  导出 CSV
                </button>
                <button onClick={exportVocabJson} type="button" disabled={vocabulary.length === 0}>
                  导出 JSON
                </button>
                <button
                  onClick={() => void clearVocab()}
                  type="button"
                  disabled={vocabulary.length === 0}
                >
                  清空
                </button>
              </div>

              {vocabMessage && <p className="service-message">{vocabMessage}</p>}

              <p className="hint">
                共 {vocabulary.length} 条，当前显示 {filteredVocabulary.length} 条
              </p>
            </div>

            {filteredVocabulary.length === 0 ? (
              <p className="hint">暂无生词。在侧边栏学习区点击「加入生词本」。</p>
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
                        删除
                      </button>
                    </div>
                    {entry.meaning && <p className="vocab-meaning">{entry.meaning}</p>}
                    {entry.usage && <p className="vocab-detail">用法：{entry.usage}</p>}
                    {entry.example && <p className="vocab-detail">例：{entry.example}</p>}
                    {entry.source && <p className="vocab-source">原文：{entry.source}</p>}
                    {entry.translation && <p className="vocab-source">译文：{entry.translation}</p>}
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
