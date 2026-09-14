export type KdsMode = 'PREPARING' | 'READY';

export interface KdsOrderItem {
  id: number;
  product__id?: number;
  product__name: string;
  product__category__id?: number | null;
  product__category__name?: string | null;
  product?: { id?: number; name?: string; category?: string | null; is_instant?: boolean };
  is_instant?: boolean;
  quantity: number;
  detail?: string | null;
  ready_at?: string | null;
  /** Unknown when the server omitted readiness; never inferred from order status. */
  is_ready?: boolean | undefined;
  preparation_time_seconds?: number | null;
}

export interface KdsOrder {
  id: number;
  display_id: number;
  order_type: 'HALL' | 'PICKUP' | 'DELIVERY';
  status: KdsMode;
  created_at: string;
  ready_at: string | null;
  updated_at: string;
  cashier: { name: string } | null;
  user?: { email?: string | null } | null;
  customer?: { telegram_id?: number | string | null } | null;
  source?: string | null;
  order_source?: string | null;
  channel?: string | null;
  origin?: string | null;
  is_telegram?: boolean;
  items: KdsOrderItem[];
}
