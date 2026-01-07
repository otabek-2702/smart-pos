// src-electron/receipt-template.ts

import { formatPhoneNumber } from 'src/utils';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  description?: string;
}

export interface ReceiptData {
  displayId: number;
  orderType: string;
  cashierName: string;
  items: ReceiptItem[];
  total: number;
  description?: string;
  phoneNumber?: string;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  HALL: 'Zal',
  PICKUP: 'S soboy',
  DELIVERY: 'Dostavka',
};

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

export function generateReceiptHtml(data: ReceiptData, logoBase64: string): string {
  const orderTypeLabel = ORDER_TYPE_LABELS[data.orderType] || data.orderType;

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

  const logoHtml = logoBase64
    ? `<div class="logo"><img src="${logoBase64}" alt="Logo" /></div>`
    : '';

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
        <span class="client-value">${formatPhoneNumber(data.phoneNumber)}</span>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: 576px;
            background: white;
            font-family: 'Arial', sans-serif;
            padding: 0 10px;
            color: #000;
          }
          
          .logo {
            text-align: center;
            margin-bottom: 20px;
          }
          .logo img {
            max-width: 480px;
            height: auto;
          }
          
          .order-info {
            font-size: 26px;
            line-height: 1.7;
            margin-bottom: 20px;
          }
          .order-info div {
            display: flex;
          }
          .order-info .label {
            min-width: 140px;
            font-weight: bold;
          }
          
          .divider {
            border-top: 3px dashed #000;
            margin: 15px 0;
          }
          
          .items-table {
            width: 100%;
            font-size: 26px;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .items-table th {
            text-align: left;
            padding: 10px 0;
            border-bottom: 2px solid #000;
            font-size: 24px;
          }
          .items-table th:nth-child(2),
          .items-table th:nth-child(3) {
            text-align: right;
          }
          .items-table td {
            padding: 10px 0;
            vertical-align: top;
          }
          .item-name {
            max-width: 300px;
            word-wrap: break-word;
          }
          .item-qty {
            text-align: right;
            min-width: 70px;
          }
          .item-price {
            text-align: right;
            min-width: 120px;
          }
          
          .thank-you {
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            margin: 20px 0;
            padding: 12px 0;
          }
          
          .total-section {
            margin: 15px 0;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 28px;
            padding: 8px 0;
          }
          .total-row.grand-total {
            font-size: 34px;
            font-weight: bold;
            border-top: 3px solid #000;
            padding-top: 12px;
            margin-top: 8px;
          }
          
          .client-info {
            margin: 12px 0;
            font-size: 35px;
            text-wrap:wrap;
            padding: 8px 0;
            width: 100%;
            }
            
          .client-label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
            margin-left: 260px;

          }
          .client-value {
            margin-left: 260px;
            display: block;
            font-size: 30px;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            max-width: 536px;
            line-height: 1.4;
          }
          
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 22px;
          }
          .footer-title {
            font-weight: bold;
            margin-bottom: 8px;
          }
          .footer-phone {
            font-size: 26px;
            font-weight: bold;
          }

          .display_id {
            font-size: 90px;
            font-weight: bold;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${logoHtml}
        
        <div class="order-info">
          <div><span class="label">Sana:</span> ${formatDate()}</div>
          <div><span class="label">Kassir:</span> ${data.cashierName}</div>
          <div><span class="label">Chek №:</span> ${data.displayId}</div>
          <div><span class="label">Turi:</span> ${orderTypeLabel}</div>
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
        
        <div class="thank-you">XARIDINGIZ UCHUN RAHMAT!</div>
        
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

        ${data.description || phoneHtml ? '<div class="divider"></div>' : ''}

        <div class="display_id">${data.displayId}</div>
        
        <div class="footer">
          <div class="footer-title">FIKR BILDIRISH UCHUN TEL:</div>
          <div class="footer-phone">+998 90 205 50 80</div>
        </div>
      </body>
    </html>
  `;
}
