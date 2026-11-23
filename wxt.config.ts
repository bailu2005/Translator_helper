import { defineConfig, type UserManifest } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: (env): UserManifest => {
    const isFirefox = env.browser === 'firefox';
    const manifest: UserManifest = {
      name: 'Translator Helper',
      description: '框选网页图片/漫画文字，本地 OCR 识别并翻译到侧边栏。',
      permissions: isFirefox
        ? ['storage', 'activeTab', 'contextMenus']
        : ['storage', 'sidePanel', 'activeTab', 'scripting', 'contextMenus'],
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
    };

    if (isFirefox) {
      manifest.browser_specific_settings = {
        gecko: {
          id: 'translator-helper@bailu2005',
          strict_min_version: '115.0',
          data_collection_permissions: {
            required: ['websiteContent'],
          },
        },
      };
    }

    return manifest;
  },
});
