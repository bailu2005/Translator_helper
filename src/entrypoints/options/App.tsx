import { useEffect, useState } from 'react';
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

  useEffect(() => {
    void loadSettings().then(setSettings);
    void loadGlossary().then(setGlossary);
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
  };

  const testService = async () => {
    setServiceMessage('检测中…');
    const status = await checkOcrService(settings.ocrServiceUrl);

    if (!status.available) {
      setServiceMessage(`未连接：${status.error ?? '服务未启动'}`);
      return;
    }
    if (status.loading) {
      setServiceMessage('已连接，模型加载中…');
      return;
    }
    if (status.ready) {
      setServiceMessage('已连接，manga-ocr 可用。');
      return;
    }
    setServiceMessage(`已连接，但未就绪：${status.error ?? '未知状态'}`);
  };

  const testTranslation = async () => {
    setTranslationTest('测试中…');
    try {
      const result = await translateText(
        { text: 'こんにちは', sourceLang: 'ja', targetLang: settings.targetLang },
        settings,
      );
      setTranslationTest(`${result.engine}：${result.text}`);
    } catch (error) {
      setTranslationTest(`失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const importGlossary = async () => {
    const entries = parseGlossary(glossaryText);
    if (entries.length === 0) {
      setGlossaryMessage('没有解析到有效条目');
      return;
    }
    await saveGlossary(entries);
    setGlossary(entries);
    setGlossaryMessage(`已导入 ${entries.length} 条`);
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
      return;
    }
    await saveGlossary(entries);
    setGlossary(entries);
    setGlossaryMessage(`已从文件导入 ${entries.length} 条`);
  };

  const clearAllGlossary = async () => {
    await clearGlossary();
    setGlossary([]);
    setGlossaryText('');
    setGlossaryMessage('术语表已清空');
  };

  const exportGlossary = () => {
    const blob = new Blob([serializeGlossaryCsv(glossary)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'glossary.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="options">
      <h1>Translator Helper 设置</h1>

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

      <button onClick={() => void testService()} type="button">
        测试连接
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
        格式：CSV / TSV / JSON，每行 source,target，例如「ルフィ,路飞」。导入后会在翻译时强制使用。
      </p>

      <textarea
        rows={6}
        value={glossaryText}
        placeholder={'ルフィ,路飞\nナミ,娜美'}
        onChange={(event) => setGlossaryText(event.target.value)}
      />

      <div className="glossary-actions">
        <button onClick={() => void importGlossary()} type="button">
          导入文本
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
          disabled={glossary.length === 0}
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

      <button onClick={() => void testTranslation()} type="button">
        测试翻译
      </button>

      {translationTest && <p className="service-message">{translationTest}</p>}

      <button className="primary" onClick={save}>
        保存
      </button>

      {saved && <p className="saved">已保存</p>}
    </main>
  );
}
