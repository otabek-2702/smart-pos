// src/utils/index.ts

type ReceiptItem = {
  name: string;
  quantity: number;
  price: number;
};

type BuildReceiptParams = {
  companyName: string;
  phone: string;
  cashier: string;
  displayId: number;
  orderType: string;
  items: ReceiptItem[];
  total: number;
  description: string;
  phone_number: string;
};

/* ESC/POS */
const ESC = '\x1B';
const GS = '\x1D';

const INIT = ESC + '@';
const CENTER = ESC + 'a' + '\x01';
const LEFT = ESC + 'a' + '\x00';
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
// const DOUBLE_ON = GS + '!' + '\x11';
// const DOUBLE_OFF = GS + '!' + '\x00';
const CUT = GS + 'V' + '\x41' + '\x00';
const SIZE_NORMAL = GS + '!' + '\x00';
const SIZE_BIG = GS + '!' + '\x22'; // 2x width + height
const SIZE_HUGE = GS + '!' + '\x33'; // very big (order number / phone)
const LINE_WIDTH = 50;

function formatMoney(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function padRight(text: string, length: number): string {
  return text.length >= length ? text.slice(0, length) : text + ' '.repeat(length - text.length);
}

function padLeft(text: string, length: number): string {
  return text.length >= length ? text.slice(0, length) : ' '.repeat(length - text.length) + text;
}

export function formatPhoneNumber(phone: string): string {
  // keep only digits
  const digits = phone.replace(/\D/g, '');

  // must start with 998 and be 12 digits total
  if (!digits.startsWith('998') || digits.length !== 12) {
    return phone; // fallback: return as-is
  }

  return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

export function buildReceipt(params: BuildReceiptParams): string {
  const {
    companyName,
    phone,
    cashier,
    displayId,
    orderType,
    items,
    total,
    description,
    phone_number,
  } = params;

  const now = new Date().toLocaleString();
  let text = '';

  // INIT
  text += INIT;

  /* ================= HEADER ================= */
  text += CENTER;
  text += SIZE_BIG;
  text += BOLD_ON;
  text += companyName + '\n';
  text += BOLD_OFF;
  text += SIZE_NORMAL;

  text += `Tel: ${phone}\n`;
  text += '\n';

  /* ================= META ================= */
  text += LEFT;
  text += `Sana: ${now}\n`;
  text += `Kassir: ${cashier}\n`;
  text += `Tur: ${orderType}\n`;
  text += '\n';

  /* ================= DESCRIPTION ================= */
  if (description) {
    text += BOLD_ON;
    text += SIZE_NORMAL;
    text += 'Izoh:\n';
    text += BOLD_OFF;
    text += description + '\n\n';
  }

  /* ================= CLIENT PHONE ================= */
  if (phone_number) {
    text += CENTER;
    text += BOLD_ON;
    text += SIZE_NORMAL;
    text += formatPhoneNumber(phone_number) + '\n';
    text += '\n';
  }

  text += '-'.repeat(LINE_WIDTH) + '\n';

  /* ================= ITEMS ================= */
  items.forEach((item) => {
    const name = padRight(item.name, 28);
    const qty = padLeft(String(item.quantity), 4);
    const sum = padLeft(formatMoney(item.price * item.quantity), 12);

    text += `${name}${qty}${sum}\n`;
  });

  text += '-'.repeat(LINE_WIDTH) + '\n';

  /* ================= TOTAL ================= */
  text += BOLD_ON;
  text += SIZE_NORMAL;
  text += padRight('JAMI', 24);
  text += padLeft(formatMoney(total), 12) +' so\'m' +'\n';
  text += BOLD_OFF;
  text += '\n';

  /* ================= THANK YOU ================= */
  text += CENTER;
  text += 'XARIDINGIZ UCHUN RAHMAT\n';
  text += '\n';

  /* ================= ORDER NUMBER ================= */
  text += CENTER;
  text += SIZE_HUGE;
  text += `#${displayId}\n`;
  text += SIZE_NORMAL;
  text += '\n\n';

  /* ================= CUT ================= */
  text += CUT;

  return text;
}
