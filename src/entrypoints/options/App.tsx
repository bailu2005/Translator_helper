import { useEffect, useState } from 'react';
import { checkOcrService } from '../../lib/ocr/service';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type OcrEngineSetting,
  type Settings,
} from '../../lib/settings';

const TARGET_LANGS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');

  useEffect(() => {
    void loadSettings().then(setSettings);
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

      <button className="primary" onClick={save}>
        保存
      </button>

      {saved && <p className="saved">已保存</p>}
    </main>
  );
}
