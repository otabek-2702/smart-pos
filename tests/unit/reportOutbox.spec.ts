import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportOutbox } from '../../src-electron/reporting/report-outbox';

const dirs: string[] = [];

function makeOutbox(): { dir: string; outbox: ReportOutbox } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-pos-outbox-'));
  dirs.push(dir);
  return { dir, outbox: new ReportOutbox(dir) };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('report refresh outbox', () => {
  it('durably reloads a queued refresh after restart', async () => {
    const { dir, outbox } = makeOutbox();
    await outbox.enqueue(42, 'created');

    const reloaded = new ReportOutbox(dir);
    expect(await reloaded.ready()).toMatchObject([{ orderId: '42', kind: 'created' }]);
  });

  it('collapses later mutations for the same authoritative order', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(42, 'created');
    await outbox.enqueue(42, 'paid');

    expect(await outbox.size()).toBe(1);
    expect(await outbox.ready()).toMatchObject([{ orderId: '42', kind: 'paid' }]);
  });

  it('retains failures with backoff and removes only the matching event', async () => {
    const { outbox } = makeOutbox();
    const first = await outbox.enqueue(7, 'created');
    await outbox.fail(first, 'main PC offline', new Date('2026-07-29T10:00:00Z'));
    expect(await outbox.ready(new Date('2026-07-29T10:00:01Z'))).toHaveLength(0);
    expect(await outbox.ready(new Date('2026-07-29T10:00:03Z'))).toHaveLength(1);

    const replacement = await outbox.enqueue(7, 'paid');
    await outbox.acknowledge(first);
    expect(await outbox.size()).toBe(1);
    await outbox.acknowledge(replacement);
    expect(await outbox.size()).toBe(0);
  });

  it('compacts a permanently failing event instead of growing the journal forever', async () => {
    const { dir, outbox } = makeOutbox();
    const event = await outbox.enqueue(99, 'paid');

    for (let attempt = 0; attempt < 160; attempt += 1) {
      await outbox.fail(
        event,
        'authoritative order is temporarily unavailable',
        new Date(Date.UTC(2026, 6, 29, 10, attempt)),
      );
    }

    const journalPath = path.join(dir, 'refresh-outbox.jsonl');
    const journalLines = fs
      .readFileSync(journalPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    expect(journalLines.length).toBeLessThan(128);

    const reloaded = new ReportOutbox(dir);
    const pending = await reloaded.ready(new Date('2026-08-01T00:00:00Z'));
    expect(pending).toMatchObject([
      {
        orderId: '99',
        kind: 'paid',
        attempts: 160,
      },
    ]);
  });
});
