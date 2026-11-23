interface ChromeSidePanelApi {
  open?: (options: { tabId: number }) => Promise<void>;
  setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
}

interface SidebarActionApi {
  open?: () => Promise<void>;
  toggle?: () => Promise<void>;
}

function chromeSidePanel(): ChromeSidePanelApi | undefined {
  const chromeApi = (globalThis as { chrome?: { sidePanel?: ChromeSidePanelApi } }).chrome;
  return chromeApi?.sidePanel;
}

function firefoxSidebar(): SidebarActionApi | undefined {
  if (typeof browser === 'undefined') {
    return undefined;
  }
  const browserApi = browser as unknown as { sidebarAction?: SidebarActionApi };
  return browserApi.sidebarAction;
}

export function configureSidePanel(): void {
  const api = chromeSidePanel();
  if (api?.setPanelBehavior) {
    void api.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

export async function openSidePanel(tabId?: number): Promise<boolean> {
  const api = chromeSidePanel();
  if (api?.open && tabId !== undefined) {
    try {
      await api.open({ tabId });
      return true;
    } catch {
      // fall through to Firefox sidebar_action
    }
  }

  const sidebar = firefoxSidebar();
  if (sidebar?.open) {
    try {
      await sidebar.open();
      return true;
    } catch {
      // fall through to toggle
    }
  }

  if (sidebar?.toggle) {
    try {
      await sidebar.toggle();
      return true;
    } catch {
      // ignore when sidebar is unavailable
    }
  }

  return false;
}
