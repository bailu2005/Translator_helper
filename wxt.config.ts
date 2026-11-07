import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Translator Helper',
    description: '框选网页图片/漫画文字，本地 OCR 识别并翻译到侧边栏。',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'contextMenus'],
    action: {
      default_title: 'Translator Helper',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
