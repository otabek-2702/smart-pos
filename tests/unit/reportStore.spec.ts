import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReportStore,
  aggregateSales,
  businessDateFor,
  isBuiltInSqliteAvailable,
  normalizeReportRecord,
} from '../../src-electron/reporting/report-store';
import type { OrderReportRecord } from '../../src-electron/reporting/report-types';

const temporaryDirectories: string[] = [];
const openStores: ReportStore[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'alpha-pos-reports-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createStore(
  baseDir: string,
  options: Partial<ConstructorParameters<typeof ReportStore>[0]> = {},
): ReportStore {
  const store = new ReportStore({
    baseDir,
    timeZone: 'Asia/Tashkent',
    ...options,
  });
  openStores.push(store);
  return store;
}

function order(
  orderId: string | number,
  overrides: Partial<OrderReportRecord> = {},
): OrderReportRecord {
  return {
    orderId,
    displayId: orderId,
    orderNumber: orderId,
    createdAt: '2026-07-29T08:00:00.000Z',
    paidAt: '2026-07-29T08:05:00.000Z',
    updatedAt: '2026-07-29T08:06:00.000Z',
    status: 'PAID',
    isPaid: true,
    totalMinor: 100_000,
    creator: { id: 6, name: 'Vali' },
    cashier: { id: 7, name: 'Ali' },
    orderType: 'HALL',
    itemCount: 2,
    items: [
      {
        itemId: 12,
        productId: 9,
        name: 'Burger',
        categoryName: 'Food',
        quantity: 2,
        unitPriceMinor: 50_000,
        lineTotalMinor: 100_000,
      },
    ],
    payments: [{ method: 'CASH', amountMinor: 100_000 }],
    ...overrides,
  };
}

afterEach(async () => {
  for (const store of openStores.splice(0)) store.close();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('report business calendar and aggregation', () => {
  it('models the 07:00 to next-day 03:00 Tashkent service window', () => {
    expect(businessDateFor(new Date('2026-07-29T07:00:00+05:00'))).toBe('2026-07-29');
    expect(businessDateFor(new Date('2026-07-30T02:59:59+05:00'))).toBe('2026-07-29');
    expect(businessDateFor(new Date('2026-07-30T03:00:00+05:00'))).toBeNull();
    expect(businessDateFor(new Date('2026-07-30T06:59:59+05:00'))).toBeNull();
    expect(businessDateFor(new Date('2026-07-30T07:00:00+05:00'))).toBe('2026-07-30');
  });

  it('keeps creator and settlement cashier distinct and normalizes integer UZS', () => {
    const normalized = normalizeReportRecord(
      order(1, {
        creator: { id: 3, name: ' Waiter ' },
        cashier: { id: 9, name: ' Cashier ' },
        itemCount: 999,
      }),
    );

    expect(normalized).toMatchObject({
      creator: { id: 3, name: 'Waiter' },
      cashier: { id: 9, name: 'Cashier' },
      itemCount: 2,
      totalMinor: 100_000,
    });
  });

  it('excludes unpaid/cancelled states and allocates cash change without inflating sales', () => {
    const totals = aggregateSales([
      order(1, {
        totalMinor: 100_000,
        payments: [
          { method: 'HUMO', amountMinor: 40_000 },
          { method: 'CASH', amountMinor: 100_000 },
        ],
      }),
      order(2, {
        totalMinor: 75_000,
        cashier: { id: '8', name: 'Dilorom' },
        orderType: 'DELIVERY',
        itemCount: 1,
        items: [],
        payments: [{ method: 'UZCARD', amountMinor: 75_000 }],
      }),
      order(3, {
        status: 'OPEN',
        isPaid: false,
        totalMinor: 200_000,
      }),
      order(4, {
        status: 'cancelled',
        isPaid: true,
        totalMinor: 300_000,
      }),
    ]);

    expect(totals).toMatchObject({
      orderCount: 2,
      totalMinor: 175_000,
      itemCount: 3,
      byCashier: [
        {
          cashierId: 7,
          cashierName: 'Ali',
          orderCount: 1,
          totalMinor: 100_000,
        },
        {
          cashierId: '8',
          cashierName: 'Dilorom',
          orderCount: 1,
          totalMinor: 75_000,
        },
      ],
      byPaymentMethod: [
        { key: 'UZCARD', totalMinor: 75_000 },
        { key: 'CASH', totalMinor: 60_000 },
        { key: 'HUMO', totalMinor: 40_000 },
      ],
    });
    expect(totals.byPaymentMethod.reduce((sum, row) => sum + row.totalMinor, 0)).toBe(
      totals.totalMinor,
    );
  });
});

const describeSqlite = isBuiltInSqliteAvailable() ? describe : describe.skip;

describeSqlite('ReportStore SQLite persistence', () => {
  it('transactionally upserts latest state by backend order ID', async () => {
    const baseDir = await temporaryDirectory();
    const store = createStore(baseDir);

    await Promise.all([
      store.upsert(order(1)),
      store.upsert(
        order('1', {
          updatedAt: '2026-07-29T08:07:00.000Z',
          totalMinor: 125_000,
          items: [
            {
              itemId: 12,
              productId: 9,
              name: 'Burger',
              categoryName: 'Food',
              quantity: 2,
              unitPriceMinor: 62_500,
              lineTotalMinor: 125_000,
            },
          ],
          payments: [{ method: 'CASH', amountMinor: 150_000 }],
        }),
      ),
      store.upsert(order(2, { totalMinor: 80_000 })),
    ]);

    expect(await store.all()).toHaveLength(2);
    expect(await store.get(1)).toMatchObject({
      orderId: 1,
      totalMinor: 125_000,
      creator: { id: 6, name: 'Vali' },
      cashier: { id: 7, name: 'Ali' },
      payments: [{ method: 'CASH', amountMinor: 150_000 }],
    });
  });

  it('does not let a stale retry replace a newer paid snapshot', async () => {
    const baseDir = await temporaryDirectory();
    const store = createStore(baseDir);

    await store.upsert(
      order(1, {
        updatedAt: '2026-07-29T09:00:00.000Z',
        totalMinor: 140_000,
      }),
    );
    await store.upsert(
      order(1, {
        updatedAt: '2026-07-29T08:00:00.000Z',
        status: 'OPEN',
        isPaid: false,
        totalMinor: 100_000,
      }),
    );

    expect(await store.get(1)).toMatchObject({
      status: 'PAID',
      isPaid: true,
      totalMinor: 140_000,
    });
  });

  it('reopens the same database and efficiently queries paid business dates', async () => {
    const baseDir = await temporaryDirectory();
    const store = createStore(baseDir);

    await store.upsert(
      order(1, {
        paidAt: '2026-07-29T21:59:00.000Z', // 30 Jul 02:59 Tashkent -> 29 Jul
      }),
    );
    await store.upsert(
      order(2, {
        paidAt: null,
        createdAt: '2026-07-30T02:30:00.000Z', // 07:30 Tashkent -> 30 Jul
      }),
    );
    await store.upsert(
      order(3, {
        paidAt: '2026-07-29T23:00:00.000Z', // 04:00 Tashkent quiet gap
      }),
    );

    store.close();
    const reopened = createStore(baseDir);

    expect(
      (await reopened.queryBusinessDate('2026-07-29')).map((record) => record.orderId),
    ).toEqual([1]);
    expect(
      (await reopened.queryBusinessDate('2026-07-30')).map((record) => record.orderId),
    ).toEqual([2]);
    expect(await reopened.get(3)).not.toBeNull();

    const stats = await reopened.stats();
    expect(stats).toMatchObject({
      orderCount: 3,
      earliestBusinessDate: '2026-07-29',
      latestBusinessDate: '2026-07-30',
    });
    expect(stats.databaseBytes).toBeGreaterThan(0);
  });

  it('uses the latest cancelled state without double-counting paid revisions', async () => {
    const baseDir = await temporaryDirectory();
    const store = createStore(baseDir);

    await store.upsert(order(1));
    await store.upsert(
      order(1, {
        updatedAt: '2026-07-29T09:00:00.000Z',
        status: 'CANCELED',
      }),
    );

    expect(
      await store.aggregateRange({
        from: '2026-07-29',
        to: '2026-07-29',
      }),
    ).toMatchObject({ orderCount: 0, totalMinor: 0, itemCount: 0 });
  });
});
