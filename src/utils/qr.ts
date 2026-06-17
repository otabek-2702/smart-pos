// src/utils/qr.ts
//
// Renderer-side QR generation. The user types a link/text in Settings → we render
// it to a PNG data URL here and persist it in ReceiptSettings.qrImageBase64. Both
// print paths (network raster + USB/Chromium) then embed that image straight from
// settings, so the main process never needs a QR encoder.

import QRCode from 'qrcode';

// Pure black on white for maximum thermal scannability; `scale` gives a crisp
// ~250–300px PNG that the receipt CSS scales down to ~26mm.
export async function generateQrDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 8,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
}
