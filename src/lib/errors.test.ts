import { describe, expect, it } from 'vitest';
import { classifyError, detectCode, makeError } from './errors';

describe('detectCode', () => {
  it('classifies network failures', () => {
    expect(detectCode('Failed to fetch')).toBe('network');
    expect(detectCode('Load failed')).toBe('network');
    expect(detectCode('Failed to fetch', 'service')).toBe('serviceOffline');
  });

  it('classifies service and timeout problems', () => {
    expect(detectCode('本地分词服务不可用，请确认 ocr-service 已启动', 'learning')).toBe(
      'serviceOffline',
    );
    expect(detectCode('本地 manga-ocr 服务超时', 'ocr')).toBe('timeout');
    expect(detectCode('LLM 请求超时', 'translation')).toBe('timeout');
  });

  it('classifies LLM auth and limits', () => {
    expect(detectCode('LLM 返回 401: invalid api key', 'translation')).toBe('unauthorized');
    expect(detectCode('LLM 返回 429: too many requests', 'translation')).toBe('rateLimit');
    expect(detectCode('MyMemory 配额已用尽', 'translation')).toBe('rateLimit');
    expect(detectCode('LLM 未配置（需要 Base URL 与模型名）', 'translation')).toBe(
      'llmNotConfigured',
    );
  });

  it('classifies server and empty results', () => {
    expect(detectCode('LLM 返回 503: unavailable', 'translation')).toBe('server');
    expect(detectCode('LLM 返回空结果', 'translation')).toBe('emptyResult');
    expect(detectCode('什么也没发生')).toBe('unknown');
  });

  it('honors the clipboard context', () => {
    expect(detectCode('denied', 'clipboard')).toBe('clipboard');
  });
});

describe('classifyError', () => {
  it('keeps the raw message and marks retryable errors', () => {
    const error = classifyError(new Error('Failed to fetch'), 'translation');
    expect(error.code).toBe('network');
    expect(error.message).toBe('Failed to fetch');
    expect(error.retryable).toBe(true);
  });

  it('marks configuration errors as non-retryable', () => {
    expect(makeError('llmNotConfigured').retryable).toBe(false);
    expect(makeError('unsupported').retryable).toBe(false);
    expect(makeError('timeout').retryable).toBe(true);
  });
});
