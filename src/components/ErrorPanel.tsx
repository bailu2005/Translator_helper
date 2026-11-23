import type { AppError } from '../lib/errors';
import { createTranslator, type MessageKey, type UiLang } from '../lib/i18n';

interface ErrorPanelProps {
  error: AppError;
  lang: UiLang;
  onRetry?: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
}

export function ErrorPanel({
  error,
  lang,
  onRetry,
  retryLabel,
  retryDisabled = false,
}: ErrorPanelProps) {
  const tr = createTranslator(lang);
  const titleKey = `error.title.${error.code}` as MessageKey;
  const hintKey = `error.hint.${error.code}` as MessageKey;

  return (
    <div className="error-panel" role="alert">
      <p className="error-title">{tr(titleKey)}</p>
      {error.message && <p className="error-detail">{error.message}</p>}
      <p className="error-hint">{tr(hintKey)}</p>
      {onRetry && (
        <button
          className="ghost error-retry"
          onClick={onRetry}
          disabled={retryDisabled}
          type="button"
        >
          {retryDisabled ? tr('stateRetrying') : (retryLabel ?? tr('actionRetry'))}
        </button>
      )}
    </div>
  );
}
