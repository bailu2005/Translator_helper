import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Translator Helper',
    description: '框选网页图片/漫画文字，本地 OCR 识别并翻译到侧边栏。',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: {
      default_title: 'Translator Helper',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
