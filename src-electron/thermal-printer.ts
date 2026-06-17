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

    // Floyd–Steinberg dithering → 1-bit. The new receipt design leans on mid-grey
    // text and hairlines for hierarchy; a hard threshold would drop everything
    // lighter than 50% to white. Diffusing the error renders those greys as fine
    // dot patterns (readable, faithful to the mock) while pure black/white areas
    // — logo edges, the QR — stay crisp. monoPixels[i] = 1 → black dot.
    const gray = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // grayscale() made r=g=b, so r is the luma.
        gray[y * width + x] = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
      }
    }

    const monoPixels = new Uint8Array(width * height);
    const diffuse = (j: number, v: number): void => {
      gray[j] = (gray[j] ?? 0) + v;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const old = gray[i] ?? 0;
        const nv = old < 128 ? 0 : 255;
        monoPixels[i] = nv === 0 ? 1 : 0;
        const err = old - nv;
        if (x + 1 < width) diffuse(i + 1, (err * 7) / 16);
        if (y + 1 < height) {
          if (x > 0) diffuse(i + width - 1, (err * 3) / 16);
          diffuse(i + width, (err * 5) / 16);
          if (x + 1 < width) diffuse(i + width + 1, (err * 1) / 16);
        }
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