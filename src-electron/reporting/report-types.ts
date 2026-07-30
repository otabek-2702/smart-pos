export type ReportEntityId = string | number;

export interface ReportPerson {
  id: ReportEntityId | null;
  name: string;
}

// Backward-compatible name used by the backend mapper. A creator and a
// settlement cashier deliberately share the same value shape.
export type ReportCashier = ReportPerson;

export interface ReportOrderItem {
  itemId?: ReportEntityId | null;
  productId?: ReportEntityId | null;
  name: string;
  categoryName?: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface ReportPaymentLine {
  method: string;
  /**
   * Tendered amount. A CASH line may be greater than the bill because it can
   * include the customer's change; reporting allocates only the bill amount.
   */
  amountMinor: number;
}

/**
 * Canonical local copy of the latest authoritative backend order.
 *
 * UZS amounts are safe integers (so'm has no minor unit in this application).
 * `creator` is the account that opened the order, while `cashier` is the
 * settlement cashier credited when the order was paid. They can differ.
 */
export interface OrderReportRecord {
  orderId: ReportEntityId;
  displayId: ReportEntityId;
  orderNumber?: ReportEntityId | null;
  createdAt: string;
  paidAt?: string | null;
  updatedAt?: string | null;
  status: string;
  isPaid: boolean;
  totalMinor: number;
  creator: ReportPerson;
  cashier: ReportPerson;
  orderType: string;
  itemCount: number;
  items: ReportOrderItem[];
  payments: ReportPaymentLine[];
}

export interface ReportDateRange {
  from: string;
  to: string;
}

export interface CashierReportTotal {
  cashierId: ReportEntityId | null;
  cashierName: string;
  orderCount: number;
  totalMinor: number;
  itemCount: number;
}

export interface DimensionReportTotal {
  key: string;
  orderCount: number;
  totalMinor: number;
  itemCount: number;
}

export interface SalesReportAggregate {
  orderCount: number;
  totalMinor: number;
  itemCount: number;
  byCashier: CashierReportTotal[];
  byOrderType: DimensionReportTotal[];
  byPaymentMethod: DimensionReportTotal[];
}
