interface ChromeScriptingApi {
  executeScript?: (injection: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
}

interface BrowserTabsApi {
  executeScript?: (tabId: number, details: { file: string }) => Promise<unknown>;
}

export async function injectContentScripts(tabId: number, files: string[]): Promise<boolean> {
  if (files.length === 0) {
    return false;
  }

  const scripting = (globalThis as { chrome?: { scripting?: ChromeScriptingApi } }).chrome
    ?.scripting;
  if (scripting?.executeScript) {
    try {
      await scripting.executeScript({ target: { tabId }, files });
      return true;
    } catch {
      return false;
    }
  }

  if (typeof browser === 'undefined') {
    return false;
  }

  const tabs = browser.tabs as unknown as BrowserTabsApi;
  if (tabs.executeScript) {
    try {
      for (const file of files) {
        await tabs.executeScript(tabId, { file });
      }
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
