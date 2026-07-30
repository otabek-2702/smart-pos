import fs from 'node:fs';

export const TELEGRAM_API_TIMEOUT_MS = 40_000;

interface TelegramEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export class TelegramApiError extends Error {
  readonly statusCode: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, statusCode = 0, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'TelegramApiError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function endpoint(token: string, method: string): string {
  const clean = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(clean)) {
    throw new TelegramApiError('Invalid Telegram bot token');
  }
  return `https://api.telegram.org/bot${clean}/${method}`;
}

async function telegramFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  // Electron's network stack follows the machine's proxy configuration.
  // Node/Undici fetch does not, which makes Telegram fail on restaurants
  // whose Windows internet connection is routed through a system proxy.
  if (process.versions.electron) {
    const { net } = await import('electron');
    return net.fetch(url, init);
  }
  return fetch(url, init);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TELEGRAM_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timedOut = false;
  const onUpstreamAbort = (): void => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) {
    onUpstreamAbort();
  } else {
    upstreamSignal?.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await telegramFetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new TelegramApiError('Telegram request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let envelope: TelegramEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as TelegramEnvelope<T>;
  } catch {
    throw new TelegramApiError(`Telegram returned HTTP ${response.status}`, response.status);
  }
  if (!response.ok || !envelope.ok || envelope.result === undefined) {
    throw new TelegramApiError(
      envelope.description || `Telegram returned HTTP ${response.status}`,
      envelope.error_code || response.status,
      envelope.parameters?.retry_after ?? null,
    );
  }
  return envelope.result;
}

export async function telegramCall<T>(
  token: string,
  method: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const request: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (signal) request.signal = signal;
  const response = await fetchWithTimeout(endpoint(token, method), request);
  return parseResponse<T>(response);
}

export async function setTelegramProfilePhoto(
  token: string,
  jpgPath: string,
): Promise<void> {
  if (!fs.existsSync(jpgPath)) {
    throw new TelegramApiError('Telegram bot profile photo is missing');
  }
  const form = new FormData();
  form.append(
    'photo',
    JSON.stringify({ type: 'static', photo: 'attach://avatar' }),
  );
  form.append(
    'avatar',
    new Blob([fs.readFileSync(jpgPath)], { type: 'image/jpeg' }),
    'alfa-pos-daily-reports.jpg',
  );
  const response = await fetchWithTimeout(endpoint(token, 'setMyProfilePhoto'), {
    method: 'POST',
    body: form,
  });
  await parseResponse<boolean>(response);
}

export async function sendTelegramDocument(
  token: string,
  chatId: string,
  filename: string,
  contents: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append(
    'document',
    new Blob([contents], { type: 'text/csv;charset=utf-8' }),
    filename,
  );
  const response = await fetchWithTimeout(endpoint(token, 'sendDocument'), {
    method: 'POST',
    body: form,
  });
  await parseResponse<unknown>(response);
}
