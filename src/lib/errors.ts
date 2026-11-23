export type ErrorContext =
  'ocr' | 'translation' | 'learning' | 'service' | 'clipboard' | 'save' | 'generic';

export type ErrorCode =
  | 'network'
  | 'timeout'
  | 'serviceOffline'
  | 'serviceBusy'
  | 'unauthorized'
  | 'rateLimit'
  | 'server'
  | 'llmNotConfigured'
  | 'emptyResult'
  | 'emptyOcr'
  | 'lowConfidence'
  | 'unsupported'
  | 'clipboard'
  | 'saveFailed'
  | 'unknown';

export const ERROR_CODES: ErrorCode[] = [
  'network',
  'timeout',
  'serviceOffline',
  'serviceBusy',
  'unauthorized',
  'rateLimit',
  'server',
  'llmNotConfigured',
  'emptyResult',
  'emptyOcr',
  'lowConfidence',
  'unsupported',
  'clipboard',
  'saveFailed',
  'unknown',
];

export interface AppError {
  code: ErrorCode;
  message: string;
  context: ErrorContext;
  retryable: boolean;
}

const NON_RETRYABLE: ErrorCode[] = ['llmNotConfigured', 'unsupported'];

export function makeError(
  code: ErrorCode,
  message = '',
  context: ErrorContext = 'generic',
): AppError {
  return {
    code,
    message,
    context,
    retryable: !NON_RETRYABLE.includes(code),
  };
}

export function classifyError(error: unknown, context: ErrorContext = 'generic'): AppError {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = detectCode(message, context);
  return makeError(code, message, context);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function detectCode(message: string, context: ErrorContext = 'generic'): ErrorCode {
  const text = message.toLowerCase();

  if (context === 'clipboard') {
    return 'clipboard';
  }
  if (/(401|403|unauthor|invalid api key|incorrect api key|鉴权|未授权)/i.test(message)) {
    return 'unauthorized';
  }
  if (/(429|rate limit|too many requests|quota|配额|限流|mymemory warning)/i.test(message)) {
    return 'rateLimit';
  }
  if (/(未配置|not configured)/i.test(message)) {
    return 'llmNotConfigured';
  }
  if (/\b5\d\d\b/.test(text) || /server error|internal error|bad gateway/.test(text)) {
    return 'server';
  }
  if (/(不支持|unavailable|not supported|不支持该语言)/i.test(message)) {
    return 'unsupported';
  }
  if (/(超时|timed out|timeout|abort)/i.test(message)) {
    return 'timeout';
  }
  if (/(服务不可用|服务未启动|ocr-service|offline)/i.test(message)) {
    return 'serviceOffline';
  }
  if (
    context === 'service' &&
    /(failed to fetch|networkerror|load failed|err_|fetch failed)/i.test(message)
  ) {
    return 'serviceOffline';
  }
  if (/(模型加载|model loading|loading)/i.test(message)) {
    return 'serviceBusy';
  }
  if (/(failed to fetch|networkerror|load failed|err_|fetch failed)/i.test(message)) {
    return 'network';
  }
  if (/(返回空|空结果|empty result|empty response)/i.test(message)) {
    return 'emptyResult';
  }
  if (context === 'save' && /(quota|storage|存储)/i.test(message)) {
    return 'saveFailed';
  }

  return 'unknown';
}
