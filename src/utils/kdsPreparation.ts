export type PreparationStatus = 'ON_TIME' | 'SLIGHTLY_LATE' | 'VERY_LATE' | 'UNTRACKED';
export type PreparationTone = 'success' | 'warning' | 'error' | 'neutral';

export interface PreparationTarget {
  maximumSeconds: number;
  displayFromMinutes: number;
  displayToMinutes: number;
}

export interface KdsPreparationItem {
  product_name?: unknown;
  product__name?: unknown;
  is_ready?: boolean | null | undefined;
  ready_at?: unknown;
  is_instant?: boolean | null | undefined;
  status?: string | null | undefined;
}

export interface KdsPreparationOrder {
  created_at?: unknown;
  ready_at?: unknown;
  status?: string | null | undefined;
  items?: readonly KdsPreparationItem[] | null | undefined;
}

export interface KdsPreparation {
  elapsedSeconds: number | null;
  target: PreparationTarget | null;
  status: PreparationStatus;
  tone: PreparationTone;
}

interface PreparationTargetRule {
  matches: (name: string) => boolean;
  maximumMinutes: number;
  displayFromMinutes?: number;
}

function exact(...names: string[]) {
  return (name: string) => names.includes(name);
}

function prefix(...prefixes: string[]) {
  return (name: string) => prefixes.some((value) => name.startsWith(value));
}

// Approved kitchen timing sheet, mirrored from the server's
// alpha_pos_core/notifications/preparation.py. The local KDS API exposes actual
// preparation_time_seconds, not a configured target. Unknown meals stay untracked.
const preparationTargetRules: PreparationTargetRule[] = [
  { matches: exact('hot dog mini', 'xodok mini'), maximumMinutes: 3 },
  {
    matches: exact('hot dog dabl', 'dabl hot dog', 'double hot dog', 'dabl xodok'),
    maximumMinutes: 4,
  },
  {
    matches: exact('hot dog karalevskiy', 'hot dog korolevskiy', 'qora lavash', 'kora lavash'),
    maximumMinutes: 4,
  },
  { matches: prefix('non burger'), maximumMinutes: 6 },
  { matches: prefix('longer', 'toster', 'nostar'), maximumMinutes: 5 },
  {
    matches: (name) =>
      name.startsWith('chicken burger') ||
      (name.startsWith('chicken ') && name.endsWith(' burger')) ||
      name.startsWith('burger chikin'),
    maximumMinutes: 8,
  },
  { matches: prefix('burger donarli', 'donar burger'), maximumMinutes: 8 },
  {
    matches: exact('burger', 'burger chiz', 'dabl burger', 'dabl burger chiz', 'smart burger'),
    maximumMinutes: 20,
  },
  {
    matches: (name) => name.includes('pitsa') || name.includes('pizza'),
    maximumMinutes: 20,
    displayFromMinutes: 15,
  },
  { matches: exact('kartoshka fri', 'fri'), maximumMinutes: 3 },
  { matches: prefix('smart strips'), maximumMinutes: 8, displayFromMinutes: 7 },
  { matches: prefix('qanotcha', 'qanot'), maximumMinutes: 9, displayFromMinutes: 8 },
  { matches: prefix('strips'), maximumMinutes: 8, displayFromMinutes: 7 },
  { matches: prefix('naggetsi', 'nuggets'), maximumMinutes: 6, displayFromMinutes: 5 },
  {
    matches: (name) => name === 'file' || name.startsWith('file '),
    maximumMinutes: 8,
    displayFromMinutes: 7,
  },
  { matches: exact('chicken big', 'chikin big'), maximumMinutes: 11, displayFromMinutes: 10 },
];

export function normalizePreparationProductName(value: unknown): string {
  const name = typeof value === 'string' ? value : '';
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[ʻ’`]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function preparationTargetForProduct(productName: unknown): PreparationTarget | null {
  const name = normalizePreparationProductName(productName);
  const rule = preparationTargetRules.find((candidate) => candidate.matches(name));
  if (!rule) return null;

  return {
    maximumSeconds: rule.maximumMinutes * 60,
    displayFromMinutes: rule.displayFromMinutes ?? rule.maximumMinutes,
    displayToMinutes: rule.maximumMinutes,
  };
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedStatus(status: string | null | undefined): string {
  return status?.trim().toUpperCase() ?? '';
}

/** Prepared items remain active; cancellation and instant service remove kitchen work. */
export function isActivePreparationItem(item: KdsPreparationItem): boolean {
  const status = normalizedStatus(item.status);
  return status !== 'CANCELED' && status !== 'CANCELLED' && item.is_instant !== true;
}

function isPrepared(item: KdsPreparationItem): boolean {
  return item.is_ready ?? timestamp(item.ready_at) !== null;
}

export function classifyPreparation(
  elapsedSeconds: number | null,
  target: PreparationTarget | null,
): Pick<KdsPreparation, 'status' | 'tone'> {
  if (elapsedSeconds === null || !Number.isFinite(elapsedSeconds) || !target)
    return { status: 'UNTRACKED', tone: 'neutral' };

  // Match the backend's whole-second boundaries, including clock-skew handling.
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  if (elapsed <= target.maximumSeconds) return { status: 'ON_TIME', tone: 'success' };
  if (elapsed * 2 <= target.maximumSeconds * 3) return { status: 'SLIGHTLY_LATE', tone: 'warning' };
  return { status: 'VERY_LATE', tone: 'error' };
}

/** Recompute from the current items each tick; no cached target survives ready/undo/removal. */
export function getKdsPreparation(order: KdsPreparationOrder, nowMs = Date.now()): KdsPreparation {
  const isReady = normalizedStatus(order.status) === 'READY';
  let target: PreparationTarget | null = null;
  for (const item of order.items ?? []) {
    if (!isActivePreparationItem(item) || (!isReady && isPrepared(item))) continue;
    const current = preparationTargetForProduct(item.product_name || item.product__name);
    if (current && (!target || current.maximumSeconds > target.maximumSeconds)) target = current;
  }

  const start = timestamp(order.created_at);
  const end = isReady ? timestamp(order.ready_at) : nowMs;
  const elapsedSeconds =
    start === null || end === null || !Number.isFinite(end)
      ? null
      : Math.max(0, Math.floor((end - start) / 1000));

  return { elapsedSeconds, target, ...classifyPreparation(elapsedSeconds, target) };
}

export function formatPreparationTarget(
  target: PreparationTarget | null,
  minuteLabel: string,
): string {
  if (!target) return '—';
  const range =
    target.displayFromMinutes === target.displayToMinutes
      ? String(target.displayToMinutes)
      : `${target.displayFromMinutes}–${target.displayToMinutes}`;
  return `${range} ${minuteLabel}`;
}

export function formatPreparationElapsed(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const elapsed = Math.max(0, Math.floor(seconds));
  return `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
}
