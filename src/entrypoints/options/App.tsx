import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../lib/settings';

const TARGET_LANGS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
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

      <button className="primary" onClick={save}>
        保存
      </button>

      {saved && <p className="saved">已保存</p>}
    </main>
  );
}
