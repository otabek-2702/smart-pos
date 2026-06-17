// src-electron/operator-handler.ts
//
// CTI "operator mode" — this app is the WebSocket SERVER on the LAN. The
// operator's phone scans a QR (ws://<lan-ip>:8765?token=<token>) and streams
// caller numbers here. Each message is forwarded to the renderer as
// 'operator:call-event'. Connections without the matching ?token are rejected.

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { WebSocketServer, type RawData } from 'ws';
import os from 'os';
import crypto from 'crypto';

const PORT = 8765;

let wss: WebSocketServer | null = null;
let token: string | null = null;

// First non-internal IPv4 — the address the phone connects to over the LAN.
function lanIpv4(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

export function registerOperatorHandler(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('operator:start', (): { url: string } => {
    if (!wss) {
      token = crypto.randomBytes(16).toString('hex');
      wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

      wss.on('connection', (socket, req) => {
        // Reject any client whose ?token doesn't match the current token.
        let qToken: string | null = null;
        try {
          qToken = new URL(req.url ?? '', 'ws://localhost').searchParams.get('token');
        } catch {
          qToken = null;
        }
        if (!token || qToken !== token) {
          socket.close(1008, 'invalid token');
          return;
        }

        socket.on('message', (raw: RawData) => {
          const text = Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString('utf8')
              : Buffer.from(raw).toString('utf8');
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            return; // ignore non-JSON frames
          }
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('operator:call-event', parsed);
          }
        });
      });

      wss.on('error', (e) => {
        console.error('[operator] WebSocket server error:', e);
      });
    }

    return { url: `ws://${lanIpv4()}:${PORT}?token=${token}` };
  });

  ipcMain.handle('operator:stop', (): void => {
    if (wss) {
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
      wss.close();
      wss = null;
    }
    token = null;
  });
}
