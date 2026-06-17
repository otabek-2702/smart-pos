// src-electron/receipt-template.ts

import { formatPhoneNumber } from 'src/utils';
import { kvGet } from './kv-store';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  description?: string;
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
}

export interface ReceiptData {
  displayId: number;
  orderType: string;
  cashierName: string;
  items: ReceiptItem[];
  total: number;
  description?: string;
  phoneNumber?: string;
  // Paid state — printed as TO'LANGAN / TO'LANMAGAN when provided. (The richer
  // paid receipt — payment type, discount, time — comes with the new design.)
  isPaid?: boolean;
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
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// 576px design — captured by the network ESC/POS raster (576 dots @203dpi).
const SCREEN_STYLE_PX = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 576px; background: white; font-family: 'Arial', sans-serif; padding: 0 10px; color: #000; }
  .logo { text-align: center; margin-bottom: 20px; }
  .logo img { max-width: 480px; height: auto; }
  .order-info { font-size: 26px; line-height: 1.7; margin-bottom: 20px; }
  .order-info div { display: flex; }
  .order-info .label { min-width: 140px; font-weight: bold; }
  .divider { border-top: 3px dashed #000; margin: 15px 0; }
  .items-table { width: 100%; font-size: 26px; border-collapse: collapse; margin-bottom: 15px; }
  .items-table th { text-align: left; padding: 10px 0; border-bottom: 2px solid #000; font-size: 24px; }
  .items-table th:nth-child(2), .items-table th:nth-child(3) { text-align: right; }
  .items-table td { padding: 10px 0; vertical-align: top; }
  .item-name { max-width: 300px; word-wrap: break-word; }
  .item-qty { text-align: right; min-width: 70px; }
  .item-price { text-align: right; min-width: 120px; }
  .thank-you { text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; padding: 12px 0; }
  .total-section { margin: 15px 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 28px; padding: 8px 0; }
  .total-row.grand-total { font-size: 34px; font-weight: bold; border-top: 3px solid #000; padding-top: 12px; margin-top: 8px; }
  .client-info { margin: 12px 0; font-size: 35px; padding: 8px 0; width: 100%; }
  .client-label { font-weight: bold; display: block; margin-bottom: 5px; }
  .client-value { display: block; font-size: 36px; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap; max-width: 536px; line-height: 1.4; }
  .footer { margin-top: 25px; text-align: center; font-size: 22px; }
  .footer-title { font-weight: bold; margin-bottom: 8px; }
  .footer-phone { font-size: 26px; font-weight: bold; }
  .additional-footer { margin-top: 15px; text-align: center; font-size: 20px; line-height: 1.6; }
  .display_id { font-size: 90px; font-weight: bold; text-align: center; margin: 20px 0; }
  .brand-stamp { margin-top: 22px; padding-top: 12px; border-top: 2px dashed #000; text-align: center; font-size: 18px; color: #111; letter-spacing: 0.6px; }
  .brand-stamp strong { font-weight: 800; }
  .brand-stamp .sub { margin-top: 4px; font-size: 20px; color: #444; letter-spacing: 0.3px; }
`;

// Physical mm design for the USB/Chromium print path — 80mm thermal paper
// (72mm printable, centered). All sizes in mm; edit these to resize the receipt.
function printStyleMm(): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  /* LEFT-aligned (the head's printable starts at the paper's left edge). Width =
     the printable span (~75mm of an 80mm head); the right edge must stay inside
     it or it cuts. Nudge this down 1mm at a time until the right stops cutting. */
  body { width: 72mm; margin: 0; background: white; font-family: 'Arial', sans-serif; color: #000; }
  .logo { text-align: center; margin-bottom: 2.5mm; }
  .logo img { max-width: 60mm; height: auto; }
  .order-info { font-size: 3.2mm; line-height: 1.6; margin-bottom: 2.5mm; }
  .order-info div { display: flex; }
  .order-info .label { min-width: 17mm; font-weight: bold; }
  .divider { border-top: 0.4mm dashed #000; margin: 1.8mm 0; }
  .items-table { width: 100%; font-size: 3.2mm; border-collapse: collapse; margin-bottom: 1.8mm; }
  .items-table th { text-align: left; padding: 1.2mm 0; border-bottom: 0.3mm solid #000; font-size: 3mm; }
  .items-table th:nth-child(2), .items-table th:nth-child(3) { text-align: right; }
  .items-table td { padding: 1.2mm 0; vertical-align: top; }
  .item-name { max-width: 37mm; word-wrap: break-word; }
  .item-qty { text-align: right; min-width: 9mm; }
  .item-price { text-align: right; min-width: 15mm; }
  .thank-you { text-align: center; font-size: 3mm; font-weight: bold; margin: 2.5mm 0; padding: 1.5mm 0; }
  .total-section { margin: 1.8mm 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 3.5mm; padding: 1mm 0; }
  .total-row.grand-total { font-size: 4.3mm; font-weight: bold; border-top: 0.4mm solid #000; padding-top: 1.5mm; margin-top: 1mm; }
  .client-info { margin: 1.5mm 0; font-size: 4mm; padding: 1mm 0; width: 100%; }
  .client-label { font-weight: bold; display: block; margin-bottom: 0.6mm; }
  .client-value { display: block; font-size: 4mm; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap; max-width: 76mm; line-height: 1.35; }
  .footer { margin-top: 3mm; text-align: center; font-size: 2.8mm; }
  .footer-title { font-weight: bold; margin-bottom: 1mm; }
  .footer-phone { font-size: 3.2mm; font-weight: bold; }
  .additional-footer { margin-top: 1.8mm; text-align: center; font-size: 2.5mm; line-height: 1.5; }
  .display_id { font-size: 11mm; font-weight: bold; text-align: center; margin: 2.5mm 0; }
  .brand-stamp { margin-top: 2.5mm; padding-top: 1.5mm; border-top: 0.3mm dashed #000; text-align: center; font-size: 2.3mm; color: #111; }
  .brand-stamp strong { font-weight: 800; }
  .brand-stamp .sub { margin-top: 0.5mm; font-size: 2.5mm; color: #444; }
`;
}

// `print` mode emits the receipt in physical mm + @page (for the USB/Chromium
// print path → true 1:1 size, no zoom). Default (off) keeps the 576px design
// that the network ESC/POS raster path captures at the head's native dots.
export function generateReceiptHtml(
  data: ReceiptData,
  logoBase64: string,
  settings: ReceiptSettings,
  opts: { print?: boolean } = {},
): string {
  const orderTypeLabel = orderTypeLabels()[data.orderType] || data.orderType;

  const styleCss = opts.print ? printStyleMm() : SCREEN_STYLE_PX;

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td class="item-name">${item.name}</td>
        <td class="item-qty">${item.quantity}</td>
        <td class="item-price">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `,
    )
    .join('');

  // Logo section
  const logoHtml = logoBase64
    ? `<div class="logo"><img src="${logoBase64}" alt="Logo" /></div>`
    : '';

  // Thank you message section
  const thankYouHtml =
    settings.showThankYouMessage && settings.thankYouMessage
      ? `<div class="thank-you">${settings.thankYouMessage}</div>`
      : '';

  // Client info sections
  const descriptionHtml = data.description
    ? `
      <div class="client-info">
        <span class="client-label">Izoh:</span>
        <span class="client-value">${data.description}</span>
      </div>
    `
    : '';

  const phoneHtml = data.phoneNumber
    ? `
      <div class="client-info">
        <span class="client-label">Mijoz tel:</span>
        <span class="client-value bigger">${formatPhoneNumber(data.phoneNumber)}</span>
      </div>
    `
    : '';

  // Footer sections
  const footerPhoneHtml =
    settings.showFooterPhone && (settings.footerTitle || settings.footerPhone)
      ? `
      <div class="footer">
        ${settings.footerTitle ? `<div class="footer-title">${settings.footerTitle}</div>` : ''}
        ${settings.footerPhone ? `<div class="footer-phone">${settings.footerPhone}</div>` : ''}
      </div>
    `
      : '';

  // Additional footer (Instagram, address, etc.)
  const additionalFooterHtml =
    settings.showAdditionalFooter && settings.additionalFooterText
      ? `
      <div class="additional-footer">
        ${settings.additionalFooterText
          .split('\n')
          .map((line) => `<div>${line}</div>`)
          .join('')}
      </div>
    `
      : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>${styleCss}</style>
      </head>
      <body>
        ${logoHtml}
        
        <div class="order-info">
          <div><span class="label">Sana:</span> ${formatDate()}</div>
          <div><span class="label">Kassir:</span> ${data.cashierName}</div>
          <div><span class="label">Chek №:</span> ${data.displayId}</div>
          <div><span class="label">Turi:</span> ${orderTypeLabel}</div>
          ${
            data.isPaid !== undefined
              ? `<div><span class="label">Holat:</span> ${data.isPaid ? "TO'LANGAN" : "TO'LANMAGAN"}</div>`
              : ''
          }
        </div>
        
        <div class="divider"></div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Soni</th>
              <th>Summa</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="divider"></div>
        
        ${thankYouHtml}
        
        <div class="total-section">
          <div class="total-row">
            <span>Summa:</span>
            <span>${formatPrice(data.total)} so'm</span>
          </div>
          <div class="total-row grand-total">
            <span>JAMI:</span>
            <span>${formatPrice(data.total)} so'm</span>
          </div>
        </div>
        
        <div class="divider"></div>
        
        ${phoneHtml}
        ${descriptionHtml}

        ${data.description || data.phoneNumber ? '<div class="divider"></div>' : ''}

        <div class="display_id">${data.displayId}</div>
        
        ${footerPhoneHtml}
        ${additionalFooterHtml}

        <div class="brand-stamp">
          <div class="sub">RetailFlow tomonidan qo‘llab-quvvatlangan</div>
          <strong>retailflow.uz</strong>
        </div>
      </body>
    </html>
  `;
}
