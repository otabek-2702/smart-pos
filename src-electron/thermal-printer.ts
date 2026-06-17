// src-electron/thermal-printer.ts
import Jimp from 'jimp';
import net from 'net';

export class ThermalPrinter {
  private ip: string;
  private port: number;

  constructor(ip: string, port: number = 9100) {
    this.ip = ip;
    this.port = port;
  }

  private async imageToEscPos(imageBuffer: Buffer): Promise<Buffer> {
    const image = await Jimp.read(imageBuffer);

    image.resize(576, Jimp.AUTO);
    image.grayscale();

    const width = image.getWidth();
    const height = image.getHeight();

    // HARD THRESHOLD → 1-bit. The receipt is pure black-on-white, so dithering
    // only adds speckle and renders the logo's baked-grey wordmark as a muddy
    // dot pattern. A threshold instead snaps anything that isn't near-white to
    // solid black (crisp text, solid logo) and keeps the background clean white.
    // Tune MONO_THRESHOLD (0–255): higher = more pixels forced black.
    const MONO_THRESHOLD = 200;
    const monoPixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // grayscale() made r=g=b, so r is the luma.
        const luma = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
        monoPixels[y * width + x] = luma < MONO_THRESHOLD ? 1 : 0; // 1 = black dot
      }
    }

    const widthBytes = Math.ceil(width / 8);
    const commands: number[] = [];

    // Initialize
    commands.push(0x1b, 0x40);

    // Center
    commands.push(0x1b, 0x61, 0x01);

    // GS v 0
    commands.push(
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff
    );

    // Pixel data
    for (let y = 0; y < height; y++) {
      for (let xByte = 0; xByte < widthBytes; xByte++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          if (x < width) {
            const pixelIndex = y * width + x;
            if (monoPixels[pixelIndex] === 1) {
              byte |= (0x80 >> bit);
            }
          }
        }
        commands.push(byte);
      }
    }

    // Feed and cut
    commands.push(0x1b, 0x64, 0x05);
    commands.push(0x1d, 0x56, 0x00);

    return Buffer.from(commands);
  }

  async printImage(imageBuffer: Buffer): Promise<void> {
    const escposData = await this.imageToEscPos(imageBuffer);

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.setTimeout(10000);

      client.connect(this.port, this.ip, () => {
        client.write(escposData, () => {
          client.end();
          resolve();
        });
      });

      client.on('error', (err: Error) => reject(err));
      client.on('timeout', () => {
        client.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }
}