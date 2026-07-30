import { describe, expect, it, vi } from 'vitest';

const roleMock = vi.hoisted(() => ({
  isMainPc: vi.fn(() => true),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));

vi.mock('../../src-electron/kv-store', () => ({
  kvGet: vi.fn(),
  onKvChanged: vi.fn(() => () => undefined),
}));

vi.mock('../../src-electron/device-role', () => ({
  getConfiguredBackendHost: () => '127.0.0.1',
  isMainPc: roleMock.isMainPc,
  localBackendBaseUrl: () => 'http://127.0.0.1:8000',
}));

vi.mock('../../src-electron/persist-path', () => ({
  getPersistDir: () => 'C:\\temporary-alpha-pos-tests',
}));

import {
  reconcileBackendOrders,
  ReportingService,
  type ReportingReconciliationOptions,
} from '../../src-electron/reporting/reporting-service';
import type {
  BackendOrderSnapshot,
} from '../../src-electron/reporting/backend-order-mapper';
import type { OrderReportRecord } from '../../src-electron/reporting/report-types';

describe('reporting PC roles', () => {
  it('does not create or open the SQLite report store on a secondary PC', async () => {
    vi.useFakeTimers();
    roleMock.isMainPc.mockReturnValue(false);
    const storeFactory = vi.fn();
    const service = new ReportingService(undefined, { storeFactory });

    try {
      await service.start();
      expect(storeFactory).not.toHaveBeenCalled();
      // Only the durable outbox retry loop runs on B/C; reconciliation and the
      // Telegram bot are main-PC responsibilities.
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      service.stop();
      roleMock.isMainPc.mockReturnValue(true);
      vi.useRealTimers();
    }
  });
});

function storedOrder(
  orderId: number | string,
  updatedAt: string,
  overrides: Partial<OrderReportRecord> = {},
): OrderReportRecord {
  return {
    orderId,
    displayId: orderId,
    orderNumber: null,
    createdAt: '2026-07-29T08:00:00.000Z',
    paidAt: '2026-07-29T08:05:00.000Z',
    updatedAt,
    status: 'PAID',
    isPaid: true,
    totalMinor: 50_000,
    creator: { id: 1, name: 'Creator' },
    cashier: { id: 2, name: 'Cashier' },
    orderType: 'HALL',
    itemCount: 1,
    items: [
      {
        itemId: 1,
        productId: 10,
        name: 'Meal',
        categoryName: 'Food',
        quantity: 1,
        unitPriceMinor: 50_000,
        lineTotalMinor: 50_000,
      },
    ],
    payments: [{ method: 'CASH', amountMinor: 50_000 }],
    ...overrides,
  };
}

function detailOrder(
  orderId: number,
  updatedAt: string,
  creatorId = orderId + 100,
): BackendOrderSnapshot {
  return {
    id: orderId,
    display_id: orderId,
    created_at: '2026-07-29T08:00:00.000Z',
    updated_at: updatedAt,
    paid_at: '2026-07-29T08:05:00.000Z',
    status: 'PAID',
    is_paid: true,
    total_amount: '50000.00',
    user: { id: creatorId, name: `Creator ${orderId}` },
    cashier: { id: 200 + orderId, name: `Cashier ${orderId}` },
    order_type: 'HALL',
    items: [
      {
        id: orderId,
        product: {
          id: 10 + orderId,
          name: `Product ${orderId}`,
          category: 'Food',
        },
        quantity: 1,
        price: '50000.00',
      },
    ],
    payments: [{ method: 'CASH', amount: '50000.00' }],
  };
}

function reconciliationOptions(
  overrides: Partial<ReportingReconciliationOptions>,
): ReportingReconciliationOptions {
  return {
    includeWeek: false,
    fromBusinessDate: '2026-07-29',
    currentWatermark: '2026-07-29T09:00:00.000Z',
    fetchPage: vi.fn(),
    fetchDetail: vi.fn(),
    getExisting: vi.fn(),
    upsert: vi.fn((record) => Promise.resolve(record)),
    commitWatermark: vi.fn(),
    ...overrides,
  };
}

describe('reporting reconciliation', () => {
  it('uses list rows only to detect changes and fetches authoritative detail', async () => {
    const existing = new Map<string, OrderReportRecord>([
      ['1', storedOrder(1, '2026-07-29T10:00:00.000Z')],
      ['2', storedOrder(2, '2026-07-29T10:00:00.000Z')],
    ]);
    const fetchDetail = vi.fn((orderId: string) => {
      if (orderId === '2') {
        return Promise.resolve(detailOrder(2, '2026-07-29T11:00:00.000Z'));
      }
      return Promise.resolve(detailOrder(3, '2026-07-29T12:00:00.000Z'));
    });
    const upsert = vi.fn((record: OrderReportRecord) => {
      existing.set(String(record.orderId), record);
      return Promise.resolve(record);
    });
    const commitWatermark = vi.fn();
    const options = reconciliationOptions({
      fetchPage: vi.fn(() =>
        Promise.resolve({
          orders: [
            {
              id: 3,
              created_at: '2026-07-29T08:00:00.000Z',
              updated_at: '2026-07-29T12:00:00.000Z',
              items: [
                {
                  product__id: 999,
                  product__name: 'Non-authoritative list value',
                  quantity: 1,
                  price: 1,
                },
              ],
            },
            {
              id: 2,
              created_at: '2026-07-29T08:00:00.000Z',
              updated_at: '2026-07-29T11:00:00.000Z',
            },
            {
              id: 1,
              created_at: '2026-07-29T08:00:00.000Z',
              updated_at: '2026-07-29T10:00:00.000Z',
            },
          ],
          hasNext: false,
        }),
      ),
      fetchDetail,
      getExisting: vi.fn((orderId) =>
        Promise.resolve(existing.get(String(orderId)) ?? null),
      ),
      upsert,
      commitWatermark,
    });

    const result = await reconcileBackendOrders(options);

    expect(fetchDetail.mock.calls.map(([id]) => id)).toEqual(['3', '2']);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(existing.get('3')).toMatchObject({
      creator: { id: 103, name: 'Creator 3' },
      cashier: { id: 203, name: 'Cashier 3' },
      items: [{ productId: 13, name: 'Product 3', categoryName: 'Food' }],
    });
    expect(result).toMatchObject({
      updatedCount: 2,
      unchangedCount: 1,
      pageCount: 1,
      watermark: '2026-07-29T12:00:00.000Z',
    });
    expect(commitWatermark).toHaveBeenCalledWith('2026-07-29T12:00:00.000Z');
  });

  it('does not commit a watermark past a failed detail and retries only that ID', async () => {
    const existing = new Map<string, OrderReportRecord>();
    let failOrderOne = true;
    const fetchDetail = vi.fn((orderId: string) => {
      if (orderId === '1' && failOrderOne) {
        return Promise.reject(new Error('detail temporarily unavailable'));
      }
      return Promise.resolve(
        detailOrder(
          Number(orderId),
          orderId === '1'
            ? '2026-07-29T10:00:00.000Z'
            : '2026-07-29T11:00:00.000Z',
        ),
      );
    });
    const upsert = vi.fn((record: OrderReportRecord) => {
      existing.set(String(record.orderId), record);
      return Promise.resolve(record);
    });
    const commitWatermark = vi.fn();
    const page = {
      orders: [
        {
          id: 2,
          created_at: '2026-07-29T08:00:00.000Z',
          updated_at: '2026-07-29T11:00:00.000Z',
        },
        {
          id: 1,
          created_at: '2026-07-29T08:00:00.000Z',
          updated_at: '2026-07-29T10:00:00.000Z',
        },
      ],
      hasNext: false,
    };
    const options = reconciliationOptions({
      fetchPage: vi.fn(() => Promise.resolve(page)),
      fetchDetail,
      getExisting: vi.fn((orderId) =>
        Promise.resolve(existing.get(String(orderId)) ?? null),
      ),
      upsert,
      commitWatermark,
    });

    await expect(reconcileBackendOrders(options)).rejects.toThrow(
      'detail temporarily unavailable',
    );
    expect(commitWatermark).not.toHaveBeenCalled();
    expect(existing.has('2')).toBe(true);

    failOrderOne = false;
    fetchDetail.mockClear();
    const result = await reconcileBackendOrders(options);

    expect(fetchDetail.mock.calls.map(([id]) => id)).toEqual(['1']);
    expect(result).toMatchObject({ updatedCount: 1, unchangedCount: 1 });
    expect(commitWatermark).toHaveBeenCalledWith('2026-07-29T11:00:00.000Z');
  });

  it('continues beyond the former 10,000-row pagination cap', async () => {
    const updatedAt = '2026-07-30T12:00:00.000Z';
    const fetchPage = vi.fn((page: number) => {
      const firstId = (page - 1) * 100 + 1;
      const count = page <= 100 ? 100 : 1;
      return Promise.resolve({
        orders: Array.from({ length: count }, (_, index) => ({
          id: firstId + index,
          created_at: '2026-07-30T08:00:00.000Z',
          updated_at: updatedAt,
        })),
        hasNext: page <= 100,
      });
    });
    const fetchDetail = vi.fn();
    const commitWatermark = vi.fn();
    const options = reconciliationOptions({
      fetchPage,
      fetchDetail,
      getExisting: vi.fn((orderId) => Promise.resolve(storedOrder(orderId, updatedAt))),
      commitWatermark,
    });

    const result = await reconcileBackendOrders(options);

    expect(fetchPage).toHaveBeenCalledTimes(101);
    expect(fetchDetail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      updatedCount: 0,
      unchangedCount: 10_001,
      pageCount: 101,
      watermark: updatedAt,
    });
    expect(commitWatermark).toHaveBeenCalledWith(updatedAt);
  });
});
