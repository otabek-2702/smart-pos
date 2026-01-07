// src-electron/html-to-image.ts
import { BrowserWindow } from 'electron';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function htmlToImage(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    width: 576,
    height: 800,
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for content to render
    await delay(500);

    // Get content height
    const height = await win.webContents.executeJavaScript(
      'document.body.scrollHeight'
    ) as number;

    // Resize to content
    win.setSize(576, Math.ceil(height) + 20);

    // Wait for resize
    await delay(200);

    // Capture
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();

    win.close();
    return buffer;
  } catch (err: unknown) {
    win.close();
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(String(err));
  }
}