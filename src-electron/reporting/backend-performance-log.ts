import fs from 'node:fs';
import path from 'node:path';

export type BackendTimingOutcome = 'success' | 'http_error' | 'network_error' | 'timeout';

export interface BackendTimingInput {
  timestamp: string;
  method: string;
  url: string;
  status: number | null;
  durationMs: number;
  outcome: BackendTimingOutcome;
}

interface BackendTimingRecord {
  timestamp: string;
  method: string;
  endpoint: string;
  status: number | null;
  durationMs: number;
  outcome: BackendTimingOutcome;
}

export interface BackendPerformanceStats {
  fileName: string;
  fileSizeBytes: number;
  requestCount: number;
  errorCount: number;
  averageMs: number;
  p95Ms: number;
  slowestMs: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
}

export interface BackendPerformanceSnapshot {
  contents: string;
  stats: BackendPerformanceStats;
}

const FILE_NAME = 'backend-response-times.csv';
const CSV_HEADER = 'timestamp,method,endpoint,status,duration_ms,outcome';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const COMPACTED_RECORDS = 10_000;
const OUTCOMES = new Set<BackendTimingOutcome>([
  'success',
  'http_error',
  'network_error',
  'timeout',
]);

/**
 * Keep useful route structure while stripping IDs, query parameters, hosts and
 * unusual characters that could contain customer-controlled data.
 */
export function normalizeBackendEndpoint(value: string): string {
  let pathname = '/unknown';
  try {
    pathname = new URL(value, 'http://alpha-pos.local').pathname || '/';
  } catch {
    pathname = String(value || '').split(/[?#]/, 1)[0] || '/unknown';
  }

  const normalized = pathname
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (segment.includes('%') || segment.includes('@')) return ':value';
      if (segment.length > 64) return ':value';
      return segment.replace(/[^A-Za-z0-9_.:-]/g, '_');
    })
    .join('/');

  return (normalized.startsWith('/') ? normalized : `/${normalized}`).slice(0, 240);
}

function normalizeInput(input: BackendTimingInput): BackendTimingRecord | null {
  const parsedTimestamp = Date.parse(input.timestamp);
  const method = String(input.method || '')
    .trim()
    .toUpperCase();
  const duration = Number(input.durationMs);
  const status = Number(input.status);

  if (!Number.isFinite(parsedTimestamp) || !/^[A-Z]{1,12}$/.test(method)) return null;
  if (!Number.isFinite(duration) || duration < 0 || duration > 10 * 60_000) return null;
  if (!OUTCOMES.has(input.outcome)) return null;

  return {
    timestamp: new Date(parsedTimestamp).toISOString(),
    method,
    endpoint: normalizeBackendEndpoint(input.url),
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    durationMs: Math.round(duration * 10) / 10,
    outcome: input.outcome,
  };
}

function serialize(record: BackendTimingRecord): string {
  return [
    record.timestamp,
    record.method,
    record.endpoint,
    record.status ?? '',
    record.durationMs.toFixed(1),
    record.outcome,
  ].join(',');
}

function parse(contents: string): BackendTimingRecord[] {
  const records: BackendTimingRecord[] = [];
  for (const line of contents.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [timestamp, method, endpoint, rawStatus, rawDuration, rawOutcome] = line.split(',');
    const durationMs = Number(rawDuration);
    const status = rawStatus ? Number(rawStatus) : null;
    const outcome = rawOutcome as BackendTimingOutcome;
    if (
      !timestamp ||
      !method ||
      !endpoint ||
      !Number.isFinite(Date.parse(timestamp)) ||
      !Number.isFinite(durationMs) ||
      !OUTCOMES.has(outcome)
    ) {
      continue;
    }
    records.push({ timestamp, method, endpoint, status, durationMs, outcome });
  }
  return records;
}

function summarize(contents: string): BackendPerformanceStats {
  const records = parse(contents);
  const durations = records.map((record) => record.durationMs).sort((a, b) => a - b);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);

  return {
    fileName: FILE_NAME,
    fileSizeBytes: Buffer.byteLength(contents, 'utf8'),
    requestCount: records.length,
    errorCount: records.filter((record) => record.outcome !== 'success').length,
    averageMs: records.length ? Math.round((total / records.length) * 10) / 10 : 0,
    p95Ms: durations.length ? (durations[p95Index] ?? 0) : 0,
    slowestMs: durations.length ? (durations[durations.length - 1] ?? 0) : 0,
    firstRecordedAt: records[0]?.timestamp ?? null,
    lastRecordedAt: records[records.length - 1]?.timestamp ?? null,
  };
}

export class BackendPerformanceLog {
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, FILE_NAME);
  }

  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(operation, operation);
    this.writeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async record(input: BackendTimingInput): Promise<boolean> {
    const record = normalizeInput(input);
    if (!record) return false;

    return this.queue(async () => {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      let needsHeader = false;
      try {
        needsHeader = (await fs.promises.stat(this.filePath)).size === 0;
      } catch {
        needsHeader = true;
      }
      await fs.promises.appendFile(
        this.filePath,
        `${needsHeader ? `${CSV_HEADER}\n` : ''}${serialize(record)}\n`,
        'utf8',
      );
      await this.compactIfNeeded();
      return true;
    });
  }

  async stats(): Promise<BackendPerformanceStats> {
    return this.queue(async () => summarize(await this.readContents()));
  }

  async snapshot(): Promise<BackendPerformanceSnapshot> {
    return this.queue(async () => {
      const contents = await this.readContents();
      return { contents, stats: summarize(contents) };
    });
  }

  private async readContents(): Promise<string> {
    try {
      return await fs.promises.readFile(this.filePath, 'utf8');
    } catch {
      return `${CSV_HEADER}\n`;
    }
  }

  private async compactIfNeeded(): Promise<void> {
    const stat = await fs.promises.stat(this.filePath);
    if (stat.size <= MAX_FILE_BYTES) return;

    const contents = await fs.promises.readFile(this.filePath, 'utf8');
    const lines = contents.split(/\r?\n/).filter(Boolean);
    const retained = lines.slice(1).slice(-COMPACTED_RECORDS);
    const tempPath = `${this.filePath}.${process.pid}.next`;
    await fs.promises.writeFile(tempPath, `${CSV_HEADER}\n${retained.join('\n')}\n`, 'utf8');
    await fs.promises.rename(tempPath, this.filePath);
  }
}
