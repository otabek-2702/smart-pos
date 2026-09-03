import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BackendPerformanceLog,
  normalizeBackendEndpoint,
} from '../../src-electron/reporting/backend-performance-log';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('backend response-time logging', () => {
  it('removes hosts, queries and entity IDs from recorded endpoints', () => {
    expect(
      normalizeBackendEndpoint(
        'http://10.0.0.8:8000/orders/123e4567-e89b-12d3-a456-426614174000/items/42?phone=99890',
      ),
    ).toBe('/orders/:id/items/:id');
  });

  it('stores timings in one CSV file and calculates sendable statistics', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-pos-performance-'));
    temporaryDirectories.push(directory);
    const log = new BackendPerformanceLog(directory);

    await log.record({
      timestamp: '2026-09-03T09:00:00.000Z',
      method: 'get',
      url: '/orders/123?customer=secret',
      status: 200,
      durationMs: 100,
      outcome: 'success',
    });
    await log.record({
      timestamp: '2026-09-03T09:01:00.000Z',
      method: 'post',
      url: '/orders/123/pay',
      status: 503,
      durationMs: 400,
      outcome: 'http_error',
    });

    const snapshot = await log.snapshot();
    expect(fs.readdirSync(directory)).toEqual(['backend-response-times.csv']);
    expect(snapshot.contents).toContain('/orders/:id');
    expect(snapshot.contents).not.toContain('customer=secret');
    expect(snapshot.stats).toMatchObject({
      requestCount: 2,
      errorCount: 1,
      averageMs: 250,
      p95Ms: 400,
      slowestMs: 400,
    });
  });
});
