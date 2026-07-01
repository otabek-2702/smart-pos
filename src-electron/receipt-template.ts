// src-electron/receipt-template.ts
//
// Minimalist 80mm receipt (Manrope, hairlines, whitespace) — ported from the
// "Chek dizayni 80mm" Claude Design handoff. One markup, two stylesheets:
//   • SCREEN px  → captured by the network ESC/POS raster path (htmlToImage @576).
//   • print mm   → the USB/Chromium @page print path (true 1:1, no zoom).
// Logo and QR are plain <img> (data URLs) so both paths render them identically.
// Colours are ALL BLACK (#000) — the on-screen mock uses greys, but a 1-bit
// thermal head dithers grey to a faint, smeary result, so every tone (labels,
// dividers, "muted" text) is forced solid black for crisp output.

import { formatPhoneNumber } from 'src/utils';
import { kvGet } from './kv-store';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  description?: string;
}

export interface ReceiptFreeItem {
  name: string;
  promo?: string;
}

export interface ReceiptSettings {
  logoBase64: string | null;
  useDefaultLogo: boolean;
  thankYouMessage: string;
  showThankYouMessage: boolean;
  footerTitle: string;
  footerPhone: string;
  showFooterPhone: boolean;
  additionalFooterText: string;
  showAdditionalFooter: boolean;
  // QR — qrImageBase64 is the rendered PNG data URL (generated in the renderer
  // from qrData); the print paths only ever embed this image.
  showQr: boolean;
  qrData: string;
  qrCaption: string;
  qrHandle: string;
  qrImageBase64: string | null;
  fontScale: number;
}

export interface ReceiptData {
  displayId: number;
  orderType: string;
  cashierName: string;
  items: ReceiptItem[];
  total: number;
  description?: string;
  phoneNumber?: string;
  // Delivery address (DELIVERY orders) — shown in the "Yetkazib berish" block.
  address?: string;
  // Totals breakdown — when discountPercent > 0 and subtotal is given, the
  // receipt prints Oraliq summa / Chegirma / Jami; otherwise just Jami.
  subtotal?: number;
  discountPercent?: number;
  // Free (promo) products — printed with a "Bepul" tag.
  freeItems?: ReceiptFreeItem[];
  // Paid state — TO'LANDI / TO'LANMAGAN pill. paymentMethodLabel (e.g. "Karta")
  // is appended to the paid pill when provided.
  isPaid?: boolean;
  paymentMethodLabel?: string;
}

// Same kv key the renderer's useOrderTypes composable writes — one source, so
// the printed "Turi" matches what the screens show after a Settings edit.
const DEFAULT_ORDER_TYPE_LABELS: Record<string, string> = {
  HALL: 'Zal',
  PICKUP: 'Olib ketish',
  DELIVERY: 'Yetkazib berish',
};

function orderTypeLabels(): Record<string, string> {
  return {
    ...DEFAULT_ORDER_TYPE_LABELS,
    ...kvGet<Record<string, string>>('pos:orderTypeLabels', {}),
  };
}

function formatPrice(price: number): string {
  return Math.round(price)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} · ${hours}:${minutes}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Palette — all TEXT is black (#000); a 1-bit thermal head would smear grey text
// to a faint mess. The only grey is the section divider (`hair`): the raster path
// ordered-dithers mid-greys (see thermal-printer.ts), so it prints as a light
// halftone line, and the USB/driver path halftones it natively — a subtler rule
// than a heavy solid-black line, matching the design.
const C = {
  ink: '#000',
  sub: '#000',
  faint: '#000',
  hair: '#b0b5bb',
};

// One stylesheet, parameterised by output medium. Text sizes are in `em` so the
// single `fontScale` on the body resizes the whole receipt; only the physical
// dimensions (paper width, font base, logo/QR size, hairline) switch px↔mm.
function receiptStyle(print: boolean, scale: number, sizes: Record<string, number> = {}): string {
  const s = Math.min(1.4, Math.max(0.8, scale || 1));
  // Per-part size multipliers → CSS vars on the body. Clamp to a sane range.
  const sz = (k: string): string => Math.min(2, Math.max(0.6, Number(sizes[k]) || 1)).toFixed(3);
  const dim = print
    ? {
        width: '72mm',
        pad: '0 2mm',
        base: `${(3.05 * s).toFixed(2)}mm`,
        logoW: '44mm',
        logoH: '22mm',
        qr: '26mm',
        hair: '0.25mm',
      }
    : {
        width: '576px',
        pad: '0 16px',
        base: `${Math.round(24 * s)}px`,
        logoW: '300px',
        logoH: '150px',
        qr: '200px',
        hair: '2px',
      };

  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${dim.width};
    padding: ${dim.pad};
    background: #fff;
    color: ${C.ink};
    font-family: 'Manrope', 'Hanken Grotesk', Arial, sans-serif;
    font-size: ${dim.base};
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    /* per-part size multipliers (Settings → receipt preview) */
    --sz-meta: ${sz('meta')};
    --sz-delivery: ${sz('delivery')};
    --sz-items: ${sz('items')};
    --sz-total: ${sz('total')};
    --sz-grand: ${sz('grand')};
    --sz-status: ${sz('status')};
    --sz-orderno: ${sz('orderno')};
    --sz-footer: ${sz('footer')};
  }

  .logo { text-align: center; margin: 0.4em 0 0.2em; }
  /* full printable width */
  .logo img { width: 100%; height: auto; }

  .meta { text-align: center; color: ${C.sub}; font-size: calc(0.92em * var(--sz-meta, 1)); line-height: 1.55; margin-top: 0.5em; }

  .rule { border-top: ${dim.hair} solid ${C.hair}; margin: 0.85em 0; }

  .sec-label { font-size: 0.82em; letter-spacing: 0.12em; color: ${C.faint}; font-weight: 700; text-transform: uppercase; margin-bottom: 0.55em; }

  .kv { display: flex; justify-content: space-between; gap: 0.8em; margin-bottom: 0.4em; }
  .kv .k { color: ${C.sub}; font-size: 0.92em; flex-shrink: 0; }
  .kv .v { font-weight: 700; text-align: right; line-height: 1.35; word-break: break-word; }
  .v.nums { font-variant-numeric: tabular-nums; }

  /* delivery block — stacked small label over a big value (design fidelity).
     The wrapper carries the per-part size var so the whole block scales. */
  .deliv { font-size: calc(1em * var(--sz-delivery, 1)); }
  .dblock { margin-bottom: 0.7em; }
  .dblock:last-child { margin-bottom: 0; }
  .dk { font-size: 0.82em; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 700; color: ${C.ink}; margin-bottom: 0.1em; }
  .dv-phone { font-size: 1.4em; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .dv-addr { font-size: 1.25em; font-weight: 700; line-height: 1.3; word-break: break-word; }

  .item { display: flex; justify-content: space-between; align-items: baseline; gap: 0.7em; margin-bottom: 0.7em; font-size: calc(1em * var(--sz-items, 1)); }
  .item .name { flex: 1; font-weight: 600; }
  .item .qty { color: ${C.sub}; font-size: 0.92em; white-space: nowrap; }
  .item .sum { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .free { display: flex; justify-content: space-between; align-items: center; gap: 0.7em; margin-bottom: 0.7em; font-size: calc(1em * var(--sz-items, 1)); }
  .free .name { flex: 1; font-weight: 600; }
  .free .promo { color: ${C.faint}; font-size: 0.82em; font-weight: 600; }
  .badge { background: ${C.ink}; color: #fff; border-radius: 0.45em; padding: 0.1em 0.6em; font-size: 0.82em; font-weight: 700; white-space: nowrap; }

  .tot { display: flex; justify-content: space-between; color: ${C.sub}; margin-bottom: 0.4em; font-size: calc(1em * var(--sz-total, 1)); }
  .tot .val { font-variant-numeric: tabular-nums; }
  .tot .off { color: ${C.ink}; font-weight: 700; }
  .grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.7em; font-size: calc(1em * var(--sz-grand, 1)); }
  .grand .lbl { font-size: 1.15em; font-weight: 700; }
  .grand .amt { font-size: 1.7em; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
  .grand .amt .cur { font-size: 0.6em; font-weight: 600; color: ${C.faint}; }

  .status { text-align: center; margin-top: 1.1em; font-size: calc(1em * var(--sz-status, 1)); }
  .pill { display: inline-flex; align-items: center; gap: 0.5em; border-radius: 999px; font-size: 0.92em; font-weight: 700; }
  .pill.paid { background: ${C.ink}; color: #fff; padding: 0.5em 1.1em; }
  .pill.paid .dot { width: 0.45em; height: 0.45em; border-radius: 50%; background: #fff; }
  .pill.unpaid { background: #fff; border: 0.12em solid ${C.ink}; color: ${C.ink}; padding: 0.42em 1em; }
  .pill.unpaid .dot { width: 0.5em; height: 0.5em; border-radius: 50%; border: 0.12em solid ${C.ink}; }

  .note { margin-top: 0.6em; }
  .note .k { font-size: 0.82em; letter-spacing: 0.06em; color: ${C.faint}; font-weight: 700; text-transform: uppercase; }
  .note .t { line-height: 1.35; word-break: break-word; }

  .qr { text-align: center; }
  .qr img { width: ${dim.qr}; height: ${dim.qr}; image-rendering: pixelated; }
  .qr .cap { font-size: 0.92em; font-weight: 600; margin-top: 0.45em; }
  .qr .handle { font-size: 0.82em; color: ${C.faint}; }

  .orderno { text-align: center; margin-top: 1.2em; font-size: calc(1em * var(--sz-orderno, 1)); }
  .orderno .lbl { font-size: 0.82em; letter-spacing: 0.16em; color: ${C.faint}; font-weight: 600; }
  .orderno .num { font-size: 5em; font-weight: 800; line-height: 1; letter-spacing: -0.03em; margin-top: 0.06em; }

  .foot { text-align: center; color: ${C.sub}; font-size: calc(0.85em * var(--sz-footer, 1)); line-height: 1.6; margin-top: 1.2em; }
  .foot .strong { font-weight: 700; color: ${C.ink}; }
  .foot .extra { margin-top: 0.5em; }
  `;
}

// Per-part size keys (must match src/composables/useReceiptSizes.ts RECEIPT_PARTS).
export const RECEIPT_SIZE_KEYS = [
  'meta',
  'delivery',
  'items',
  'total',
  'grand',
  'status',
  'orderno',
  'footer',
] as const;

export function generateReceiptHtml(
  data: ReceiptData,
  logoBase64: string,
  settings: ReceiptSettings,
  opts: { print?: boolean; sizes?: Record<string, number> } = {},
): string {
  const print = !!opts.print;
  const styleCss = receiptStyle(print, settings.fontScale ?? 1, opts.sizes ?? {});
  const orderTypeLabel = orderTypeLabels()[data.orderType] || data.orderType;
  const isDelivery = data.orderType === 'DELIVERY';

  const logoHtml = logoBase64
    ? `<div class="logo"><img src="${logoBase64}" alt="Logo" /></div>`
    : '';

  // Delivery block (client phone + address) — only for DELIVERY orders.
  let deliveryHtml = '';
  if (isDelivery && (data.phoneNumber || data.address)) {
    const rows: string[] = [];
    if (data.phoneNumber) {
      rows.push(
        `<div class="dblock"><div class="dk">Mijoz</div><div class="dv-phone">${esc(formatPhoneNumber(data.phoneNumber))}</div></div>`,
      );
    }
    if (data.address) {
      rows.push(
        `<div class="dblock"><div class="dk">Manzil</div><div class="dv-addr">${esc(data.address)}</div></div>`,
      );
    }
    deliveryHtml = `
      <div class="rule"></div>
      <div class="deliv">
        <div class="sec-label">Yetkazib berish</div>
        ${rows.join('')}
      </div>`;
  }

  const itemsHtml = data.items
    .map(
      (item) => `
      <div class="item">
        <span class="name">${esc(item.name)}</span>
        <span class="qty">${item.quantity}×</span>
        <span class="sum">${formatPrice(item.price * item.quantity)}</span>
      </div>`,
    )
    .join('');

  const freeHtml = (data.freeItems || [])
    .map(
      (f) => `
      <div class="free">
        <span class="name">${esc(f.name)}${f.promo ? ` <span class="promo">· ${esc(f.promo)}</span>` : ''}</span>
        <span class="badge">Bepul</span>
      </div>`,
    )
    .join('');

  // Totals — show the breakdown only when a discount actually applied.
  const hasDiscount =
    !!data.discountPercent && data.discountPercent > 0 && data.subtotal != null;
  const subtotal = hasDiscount ? (data.subtotal as number) : data.total;
  const totalsHtml = `
    ${
      hasDiscount
        ? `<div class="tot"><span>Oraliq summa</span><span class="val">${formatPrice(subtotal)}</span></div>
           <div class="tot"><span>Chegirma ${data.discountPercent}%</span><span class="off">−${formatPrice(subtotal - data.total)}</span></div>`
        : ''
    }
    <div class="grand">
      <span class="lbl">Jami</span>
      <span class="amt">${formatPrice(data.total)}<span class="cur"> so'm</span></span>
    </div>`;

  // Paid / unpaid pill.
  let statusHtml = '';
  if (data.isPaid === true) {
    const label = data.paymentMethodLabel ? ` · ${esc(data.paymentMethodLabel)}` : '';
    statusHtml = `<div class="status"><span class="pill paid"><span class="dot"></span>To'landi${label}</span></div>`;
  } else if (data.isPaid === false) {
    statusHtml = `<div class="status"><span class="pill unpaid"><span class="dot"></span>To'lanmagan</span></div>`;
  }

  // Izoh + (non-delivery) client phone.
  const noteParts: string[] = [];
  if (data.description) {
    noteParts.push(
      `<div class="note"><div class="k">Izoh</div><div class="t">${esc(data.description)}</div></div>`,
    );
  }
  if (!isDelivery && data.phoneNumber) {
    noteParts.push(
      `<div class="note"><div class="k">Mijoz tel</div><div class="t">${esc(formatPhoneNumber(data.phoneNumber))}</div></div>`,
    );
  }
  const noteHtml = noteParts.length ? `<div class="rule"></div>${noteParts.join('')}` : '';

  // QR — embed the pre-rendered image straight from settings.
  const qrHtml =
    settings.showQr && settings.qrImageBase64
      ? `
      <div class="rule"></div>
      <div class="qr">
        <img src="${settings.qrImageBase64}" alt="QR" />
        ${settings.qrCaption ? `<div class="cap">${esc(settings.qrCaption)}</div>` : ''}
        ${settings.qrHandle ? `<div class="handle">${esc(settings.qrHandle)}</div>` : ''}
      </div>`
      : '';

  // Footer — thank-you + feedback phone + extra lines.
  const footParts: string[] = [];
  if (settings.showThankYouMessage && settings.thankYouMessage) {
    footParts.push(`<div class="strong">${esc(settings.thankYouMessage)}</div>`);
  }
  if (settings.showFooterPhone && (settings.footerTitle || settings.footerPhone)) {
    const line = [settings.footerTitle, settings.footerPhone]
      .filter(Boolean)
      .map((t) => esc(t))
      .join(' ');
    footParts.push(`<div>${line}</div>`);
  }
  if (settings.showAdditionalFooter && settings.additionalFooterText) {
    const extra = settings.additionalFooterText
      .split('\n')
      .map((l) => esc(l))
      .join('<br>');
    footParts.push(`<div class="extra">${extra}</div>`);
  }
  const footHtml = footParts.length ? `<div class="foot">${footParts.join('')}</div>` : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>${styleCss}</style>
      </head>
      <body>
        ${logoHtml}

        <div class="meta">
          <div>${formatDate()}</div>
          <div>Chek №${data.displayId} · ${esc(orderTypeLabel)} · ${esc(data.cashierName)}</div>
        </div>

        ${deliveryHtml}

        <div class="rule"></div>

        ${itemsHtml}
        ${freeHtml}

        <div class="rule"></div>

        ${totalsHtml}

        ${statusHtml}

        ${noteHtml}

        ${qrHtml}

        <div class="orderno">
          <div class="lbl">BUYURTMA RAQAMI</div>
          <div class="num">${data.displayId}</div>
        </div>

        ${footHtml}
      </body>
    </html>
  `;
}
