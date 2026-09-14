import { describe, expect, it } from 'vitest';
import {
  classifyPreparation,
  formatPreparationElapsed,
  formatPreparationTarget,
  getKdsPreparation,
  isActivePreparationItem,
  normalizePreparationProductName,
  preparationTargetForProduct,
  type KdsPreparationOrder,
} from 'src/utils/kdsPreparation';

const createdAt = '2026-09-15T07:00:00Z';
const startedMs = Date.parse(createdAt);
const atSeconds = (seconds: number) => startedMs + seconds * 1000;

describe('approved kitchen preparation targets', () => {
  it.each([
    ['HOT-DOG MINI', 3, 3],
    ['xodok mini', 3, 3],
    ['double hot dog', 4, 4],
    ['Qora Lavash', 4, 4],
    ['Non Burger chiz', 6, 6],
    ['Longer', 5, 5],
    ['Toster big', 5, 5],
    ['Nostar', 5, 5],
    ['Chicken burger', 8, 8],
    ['Chicken cheese burger', 8, 8],
    ['Burger chikin big', 8, 8],
    ['Donar burger', 8, 8],
    ['Burger donarli big', 8, 8],
    ['Burger', 20, 20],
    ['Dabl burger chiz', 20, 20],
    ['Smart burger', 20, 20],
    ['Pepperoni Pizza 30cm', 20, 15],
    ['Pitsa', 20, 15],
    ['Kartoshka fri', 3, 3],
    ['Smart strips 5', 8, 7],
    ['Qanotcha 6', 9, 8],
    ['Qanot 3', 9, 8],
    ['Strips 3', 8, 7],
    ['Naggetsi', 6, 5],
    ['Nuggets 6', 6, 5],
    ['File 3', 8, 7],
    ['Chicken big', 11, 10],
    ['Chikin big', 11, 10],
  ])('matches %s to the server timing sheet', (name, maximumMinutes, fromMinutes) => {
    expect(preparationTargetForProduct(name)).toEqual({
      maximumSeconds: maximumMinutes * 60,
      displayFromMinutes: fromMinutes,
      displayToMinutes: maximumMinutes,
    });
  });

  it('normalizes punctuation, case, and apostrophes with the server rules', () => {
    expect(normalizePreparationProductName('  HOT--DOG   MINI  ')).toBe('hot dog mini');
    expect(normalizePreparationProductName('HÓT')).toBe('ho t');
    expect(normalizePreparationProductName('oʻz o’z o`z')).toBe("o'z o'z o'z");
  });

  it.each([null, undefined, '', 'Cola', 'Unknown burger', 'Filefish'])(
    'does not invent a target for %s',
    (name) => expect(preparationTargetForProduct(name)).toBeNull(),
  );
});

describe('dynamic order preparation timer', () => {
  it('uses the longest unfinished meal, recalculating on ready, undo, and removal', () => {
    const pizza = { product_name: 'Pizza', is_ready: false };
    const strips = { product_name: 'Strips 3', is_ready: false };
    const order: KdsPreparationOrder = {
      created_at: createdAt,
      status: 'PREPARING',
      items: [pizza, strips, { product_name: 'Fri', is_ready: false }],
    };

    expect(getKdsPreparation(order, atSeconds(600))).toMatchObject({
      elapsedSeconds: 600,
      target: { maximumSeconds: 1200 },
      status: 'ON_TIME',
    });
    pizza.is_ready = true;
    expect(getKdsPreparation(order, atSeconds(601))).toMatchObject({
      elapsedSeconds: 601,
      target: { maximumSeconds: 480 },
      status: 'SLIGHTLY_LATE',
    });
    pizza.is_ready = false;
    expect(getKdsPreparation(order, atSeconds(602)).target?.maximumSeconds).toBe(1200);
    order.items = order.items?.filter((item) => item !== pizza) ?? [];
    expect(getKdsPreparation(order, atSeconds(603)).target?.maximumSeconds).toBe(480);
    strips.is_ready = true;
    expect(getKdsPreparation(order, atSeconds(604)).target?.maximumSeconds).toBe(180);
  });

  it('ignores canceled, instant, and already prepared items', () => {
    const order = {
      created_at: createdAt,
      items: [
        { product_name: 'Pizza', status: 'CANCELED' },
        { product_name: 'Burger', status: 'cancelled' },
        { product_name: 'Qanotcha', is_instant: true },
        { product_name: 'Strips', is_ready: true },
        { product__name: 'Fri', is_ready: false },
      ],
    };
    expect(getKdsPreparation(order, atSeconds(60)).target?.maximumSeconds).toBe(180);
    expect(isActivePreparationItem({ product_name: 'Fri', is_ready: true })).toBe(true);
  });

  it('uses item ready_at when is_ready is absent and honors an explicit undo', () => {
    const item = { product_name: 'Pizza', ready_at: '2026-09-15T07:04:00Z' };
    const order = { created_at: createdAt, items: [item, { product_name: 'Fri' }] };
    expect(getKdsPreparation(order, atSeconds(300)).target?.maximumSeconds).toBe(180);
    expect(
      getKdsPreparation({ ...order, items: [{ ...item, is_ready: false }] }, atSeconds(300)).target
        ?.maximumSeconds,
    ).toBe(1200);
  });

  it('freezes READY elapsed at ready_at and includes prepared meals in the historical target', () => {
    const order = {
      created_at: createdAt,
      status: 'READY',
      ready_at: '2026-09-15T07:12:34Z',
      items: [
        { product_name: 'Pizza', is_ready: true },
        { product_name: 'Fri', is_ready: true },
      ],
    };
    const expected = {
      elapsedSeconds: 754,
      target: { maximumSeconds: 1200 },
      status: 'ON_TIME',
    };
    expect(getKdsPreparation(order, atSeconds(800))).toMatchObject(expected);
    expect(getKdsPreparation(order, atSeconds(8000))).toMatchObject(expected);
  });

  it('excludes cancelled and instant meals from READY historical targets too', () => {
    expect(
      getKdsPreparation({
        created_at: createdAt,
        ready_at: '2026-09-15T07:05:00Z',
        status: 'READY',
        items: [
          { product_name: 'Pizza', status: 'CANCELLED', is_ready: true },
          { product_name: 'Burger', is_instant: true, is_ready: true },
          { product_name: 'Fri', is_ready: true },
        ],
      }).target?.maximumSeconds,
    ).toBe(180);
  });

  it.each([
    {},
    { created_at: '' },
    { created_at: 'invalid' },
    { created_at: 0 },
    { created_at: createdAt, status: 'READY' },
    { created_at: createdAt, status: 'READY', ready_at: 'invalid' },
  ])('keeps missing or invalid timer timestamps unknown: %j', (order) => {
    expect(
      getKdsPreparation({ ...order, items: [{ product_name: 'Fri' }] }, atSeconds(60)),
    ).toMatchObject({ elapsedSeconds: null, status: 'UNTRACKED', tone: 'neutral' });
  });

  it('treats an invalid clock as unknown and clamps a future created_at to zero', () => {
    const order = { created_at: createdAt, items: [{ product_name: 'Fri' }] };
    expect(getKdsPreparation(order, Number.NaN).elapsedSeconds).toBeNull();
    expect(getKdsPreparation(order, atSeconds(-20))).toMatchObject({
      elapsedSeconds: 0,
      status: 'ON_TIME',
    });
    expect(
      getKdsPreparation({ ...order, status: 'READY', ready_at: '2026-09-15T06:59:00Z' })
        .elapsedSeconds,
    ).toBe(0);
  });

  it.each([
    { items: [] },
    { items: [{ product_name: 'Cola' }] },
    { items: [{ product_name: 'Fri', is_ready: true }] },
  ])(
    'keeps elapsed visible and neutral when there is no unfinished tracked target: %j',
    ({ items }) => {
      expect(getKdsPreparation({ created_at: createdAt, items }, atSeconds(601))).toEqual({
        elapsedSeconds: 601,
        target: null,
        status: 'UNTRACKED',
        tone: 'neutral',
      });
    },
  );

  it('never mistakes an actual preparation duration for a configured target', () => {
    const item = {
      product_name: 'Cola',
      preparation_time_seconds: 900,
      prep_time: 30,
    };
    expect(
      getKdsPreparation({ created_at: createdAt, items: [item] }, atSeconds(10)).target,
    ).toBeNull();
  });
});

describe('preparation color boundaries and display', () => {
  const target = preparationTargetForProduct('Fri');

  it.each([
    [-1, 'ON_TIME', 'success'],
    [180, 'ON_TIME', 'success'],
    [180.9, 'ON_TIME', 'success'],
    [181, 'SLIGHTLY_LATE', 'warning'],
    [270, 'SLIGHTLY_LATE', 'warning'],
    [271, 'VERY_LATE', 'error'],
  ])('classifies %s seconds with backend inclusive thresholds', (elapsed, status, tone) => {
    expect(classifyPreparation(elapsed, target)).toEqual({ status, tone });
  });

  it('keeps missing values neutral', () => {
    expect(classifyPreparation(null, target)).toEqual({ status: 'UNTRACKED', tone: 'neutral' });
    expect(classifyPreparation(Number.NaN, target).tone).toBe('neutral');
    expect(classifyPreparation(120, null).tone).toBe('neutral');
  });

  it('formats minute ranges and total elapsed minutes without wrapping at an hour', () => {
    expect(formatPreparationTarget(target, 'daq')).toBe('3 daq');
    expect(formatPreparationTarget(preparationTargetForProduct('Pizza'), 'мин')).toBe('15–20 мин');
    expect(formatPreparationTarget(null, 'min')).toBe('—');
    expect(formatPreparationElapsed(null)).toBe('—');
    expect(formatPreparationElapsed(Number.NaN)).toBe('—');
    expect(formatPreparationElapsed(-1)).toBe('00:00');
    expect(formatPreparationElapsed(61.9)).toBe('01:01');
    expect(formatPreparationElapsed(3661)).toBe('61:01');
  });
});
