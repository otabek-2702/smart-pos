import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TELEGRAM_API_TIMEOUT_MS,
  telegramCall,
} from '../../src-electron/reporting/telegram-api';

describe('Telegram Bot API requests', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborts a request that exceeds the bounded API timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = telegramCall(
      '123456:abcdefghijklmnopqrstuvwxyz',
      'getMe',
    );
    const rejection = expect(request).rejects.toThrow(
      'Telegram request timed out',
    );

    await vi.advanceTimersByTimeAsync(TELEGRAM_API_TIMEOUT_MS);
    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
