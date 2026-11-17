export type ToastType = 'info' | 'success' | 'error';

export function showToast(message: string, type: ToastType = 'info'): void {
  if (typeof document === 'undefined') {
    return;
  }

  for (const existing of document.querySelectorAll('[data-translator-helper-toast]')) {
    existing.remove();
  }

  const host = document.createElement('div');
  host.setAttribute('data-translator-helper-toast', '');
  host.style.cssText =
    'all: initial; position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; pointer-events: none;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .toast {
      padding: 9px 14px;
      border-radius: 8px;
      color: #fff;
      font: 13px/1.5 system-ui, sans-serif;
      max-width: 70vw;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .success { background: #1f8a4c; }
    .error { background: #c0392b; }
    .info { background: rgba(17, 17, 17, 0.9); }
  `;

  const content = document.createElement('div');
  content.className = `toast ${type}`;
  content.textContent = message;
  shadow.append(style, content);
  document.body.append(host);

  requestAnimationFrame(() => content.classList.add('show'));
  window.setTimeout(() => {
    content.classList.remove('show');
    window.setTimeout(() => host.remove(), 200);
  }, 2200);
}
