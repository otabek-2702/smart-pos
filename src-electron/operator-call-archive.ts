import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { OperatorCallRecord } from '../src/types/operator';

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '');
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify(value), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function parseOperatorCallRecord(value: unknown): OperatorCallRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    !record.id ||
    record.id.length > 160 ||
    typeof record.phone !== 'string' ||
    record.phone.length > 80 ||
    (record.direction !== 'in' && record.direction !== 'out') ||
    typeof record.startedAt !== 'number' ||
    !Number.isFinite(record.startedAt) ||
    record.startedAt <= 0 ||
    (record.endedAt !== null &&
      (typeof record.endedAt !== 'number' ||
        !Number.isFinite(record.endedAt) ||
        record.endedAt < record.startedAt)) ||
    (record.revision !== undefined &&
      (!Number.isSafeInteger(record.revision) || Number(record.revision) < 0))
  )
    return null;
  return record as OperatorCallRecord;
}

/** One atomic file per stable call ID: callback updates replace that call, never append duplicates. */
export class OperatorCallArchive {
  private readonly root: string;
  private readonly namesFile: string;
  private names: Record<string, string>;

  constructor(persistDir: string) {
    this.root = path.join(persistDir, 'operator-calls', 'records');
    this.namesFile = path.join(persistDir, 'operator-calls', 'customer-names.json');
    const stored = readJson(this.namesFile);
    this.names =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? (stored as Record<string, string>)
        : {};
  }

  private file(id: string): string {
    return path.join(this.root, `${crypto.createHash('sha256').update(id).digest('hex')}.json`);
  }

  get(id: string): OperatorCallRecord | null {
    const record = parseOperatorCallRecord(readJson(this.file(id)));
    if (!record) return null;
    const name = this.customerName(record.phone);
    return name ? { ...record, customerName: name } : record;
  }

  save(record: OperatorCallRecord): OperatorCallRecord {
    const previous = this.get(record.id);
    if (previous && Number(previous.revision ?? 0) > Number(record.revision ?? 0)) return previous;
    const merged = { ...previous, ...record };
    const name = this.customerName(record.phone);
    if (name) merged.customerName = name;
    atomicJson(this.file(record.id), merged);
    return merged;
  }

  customerName(phone: string): string | null {
    return this.names[phoneKey(phone)] ?? null;
  }

  setCustomerName(phone: string, name: string): void {
    const key = phoneKey(phone);
    if (!key || !name.trim() || this.names[key] === name.trim()) return;
    const next = { ...this.names, [key]: name.trim() };
    atomicJson(this.namesFile, next);
    this.names = next;
  }
}
