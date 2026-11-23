import { afterEach, describe, expect, it } from 'vitest';
import { injectContentScripts } from './inject';
import { openSidePanel } from './sidepanel';

const globals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete globals.browser;
  delete globals.chrome;
});

describe('openSidePanel', () => {
  it('uses Chrome sidePanel when available', async () => {
    let openedTab: number | undefined;
    globals.chrome = {
      sidePanel: {
        open: async (options: { tabId: number }) => {
          openedTab = options.tabId;
        },
      },
    };

    expect(await openSidePanel(7)).toBe(true);
    expect(openedTab).toBe(7);
  });

  it('falls back to Firefox sidebarAction', async () => {
    let opened = false;
    globals.browser = {
      sidebarAction: {
        open: async () => {
          opened = true;
        },
      },
    };

    expect(await openSidePanel(7)).toBe(true);
    expect(opened).toBe(true);
  });

  it('returns false when no side panel API exists', async () => {
    expect(await openSidePanel(7)).toBe(false);
  });
});

describe('injectContentScripts', () => {
  it('uses chrome.scripting when available', async () => {
    let injected: { target: { tabId: number }; files: string[] } | undefined;
    globals.chrome = {
      scripting: {
        executeScript: async (options: { target: { tabId: number }; files: string[] }) => {
          injected = options;
        },
      },
    };

    expect(await injectContentScripts(3, ['content.js'])).toBe(true);
    expect(injected).toEqual({ target: { tabId: 3 }, files: ['content.js'] });
  });

  it('falls back to browser.tabs.executeScript', async () => {
    const files: string[] = [];
    globals.browser = {
      tabs: {
        executeScript: async (_tabId: number, details: { file: string }) => {
          files.push(details.file);
        },
      },
    };

    expect(await injectContentScripts(3, ['a.js', 'b.js'])).toBe(true);
    expect(files).toEqual(['a.js', 'b.js']);
  });

  it('returns false for empty file lists or missing APIs', async () => {
    expect(await injectContentScripts(3, [])).toBe(false);
    expect(await injectContentScripts(3, ['content.js'])).toBe(false);
  });
});
