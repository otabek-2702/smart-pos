import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ReportMutationKind = 'created' | 'paid' | 'cancelled' | 'updated';

export interface PendingReportRefresh {
  eventId: string;
  orderId: string;
  kind: ReportMutationKind;
  queuedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
}

type JournalEntry =
  | { op: 'put'; event: PendingReportRefresh }
  | { op: 'ack'; orderId: string; eventId: string };

const COMPACT_MIN_ENTRIES = 128;

function canonicalOrderId(value: number | string): string {
  const id = String(value).trim();
  if (!/^\d+$/.test(id) || id === '0') {
    throw new Error('Invalid order id');
  }
  return id.replace(/^0+(?=\d)/, '');
}

function parseJournal(filePath: string): {
  pending: Map<string, PendingReportRefresh>;
  entryCount: number;
} {
  const pending = new Map<string, PendingReportRefresh>();
  let entryCount = 0;
  let text = '';
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { pending, entryCount };
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    entryCount += 1;
    try {
      const entry = JSON.parse(line) as JournalEntry;
      if (entry.op === 'put' && entry.event?.eventId) {
        pending.set(canonicalOrderId(entry.event.orderId), entry.event);
      } else if (
        entry.op === 'ack' &&
        pending.get(canonicalOrderId(entry.orderId))?.eventId === entry.eventId
      ) {
        pending.delete(canonicalOrderId(entry.orderId));
      }
    } catch {
      // A power loss can truncate the final line. Earlier durable entries are
      // still valid and are deliberately retained.
    }
  }
  return { pending, entryCount };
}

export class ReportOutbox {
  private readonly filePath: string;
  private readonly pending: Map<string, PendingReportRefresh>;
  private writeChain: Promise<void> = Promise.resolve();
  private journalEntries: number;

  constructor(baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
    this.filePath = path.join(baseDir, 'refresh-outbox.jsonl');
    const parsed = parseJournal(this.filePath);
    this.pending = parsed.pending;
    this.journalEntries = parsed.entryCount;
    this.compactIfNeeded();
  }

  private serialize<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.writeChain.then(operation, operation);
    this.writeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private append(entry: JournalEntry): void {
    const fd = fs.openSync(this.filePath, 'a');
    try {
      fs.writeSync(fd, `${JSON.stringify(entry)}\n`, undefined, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.journalEntries += 1;
  }

  private compactIfNeeded(): void {
    const threshold = Math.max(COMPACT_MIN_ENTRIES, this.pending.size * 4);
    if (this.journalEntries < threshold) return;

    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    let fd: number | null = null;
    try {
      fd = fs.openSync(tempPath, 'wx');
      const contents = Array.from(this.pending.values(), (event) =>
        JSON.stringify({ op: 'put', event } satisfies JournalEntry),
      ).join('\n');
      fs.writeSync(fd, contents ? `${contents}\n` : '', undefined, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(tempPath, this.filePath);
      this.journalEntries = this.pending.size;
    } catch (error) {
      if (fd !== null) fs.closeSync(fd);
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // The temp file may not have been created or may already be renamed.
      }
      throw error;
    }
  }

  enqueue(orderIdValue: number | string, kind: ReportMutationKind): Promise<PendingReportRefresh> {
    return this.serialize(() => {
      const orderId = canonicalOrderId(orderIdValue);
      const now = new Date().toISOString();
      const event: PendingReportRefresh = {
        eventId: randomUUID(),
        orderId,
        kind,
        queuedAt: now,
        attempts: 0,
        nextAttemptAt: now,
      };
      this.append({ op: 'put', event });
      this.pending.set(orderId, event);
      this.compactIfNeeded();
      return { ...event };
    });
  }

  ready(now = new Date(), limit = 25): Promise<PendingReportRefresh[]> {
    return this.serialize(() =>
      Array.from(this.pending.values())
        .filter((event) => Date.parse(event.nextAttemptAt) <= now.getTime())
        .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
        .slice(0, Math.max(1, limit))
        .map((event) => ({ ...event })),
    );
  }

  acknowledge(event: PendingReportRefresh): Promise<void> {
    return this.serialize(() => {
      const current = this.pending.get(event.orderId);
      if (!current || current.eventId !== event.eventId) return;
      this.append({ op: 'ack', orderId: event.orderId, eventId: event.eventId });
      this.pending.delete(event.orderId);
      // In the normal online case the queue returns to empty after each event.
      // Compact then so this journal cannot grow forever on every till.
      if (this.pending.size === 0) {
        fs.writeFileSync(this.filePath, '', 'utf8');
        this.journalEntries = 0;
      } else {
        this.compactIfNeeded();
      }
    });
  }

  fail(event: PendingReportRefresh, error: string, now = new Date()): Promise<void> {
    return this.serialize(() => {
      const current = this.pending.get(event.orderId);
      if (!current || current.eventId !== event.eventId) return;
      const attempts = current.attempts + 1;
      const delayMs = Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attempts - 1, 7));
      const updated: PendingReportRefresh = {
        ...current,
        attempts,
        nextAttemptAt: new Date(now.getTime() + delayMs).toISOString(),
        lastError: error.slice(0, 300),
      };
      this.append({ op: 'put', event: updated });
      this.pending.set(event.orderId, updated);
      this.compactIfNeeded();
    });
  }

  size(): Promise<number> {
    return this.serialize(() => this.pending.size);
  }
}
