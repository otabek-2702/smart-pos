import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { WebSocket, WebSocketServer } from 'ws';
import os from 'node:os';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import type { IncomingMessage } from 'node:http';
import { getPersistDir } from './persist-path';
import type {
  OperatorCallEvent,
  OperatorLiveCall,
  OperatorPairing,
  OperatorRole,
  OperatorStatus,
} from '../src/types/operator';
import { OperatorCallArchive } from './operator-call-archive';
import {
  parseOperatorMessage,
  parseOrderCreated,
  type OperatorPhoneMessage,
} from './operator-protocol';

const PORT = 8765;
const DISCOVERY_PORT = 8766;

interface OperatorSettings {
  id: string;
  token: string;
  enabled: boolean;
}

function lanIpv4(): string {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const address of entries ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

interface PhoneSession {
  /** Short per-connection ID the renderer uses to keep each phone's calls apart. */
  source: string;
  role: OperatorRole;
  protocol: number;
  /** Call IDs whose cached customer name was already sent on this connection. */
  named: Set<string>;
}

/** Machine settings are separate from auth/session storage and its clear operation. */
export class OperatorLinkService {
  private readonly config: Store<OperatorSettings>;
  private readonly archive: OperatorCallArchive;
  private server: WebSocketServer | null = null;
  private discovery: dgram.Socket | null = null;
  private error: string | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private operations: Promise<unknown> = Promise.resolve();
  private closing = false;
  private connections = 0;
  private readonly port: number;
  private readonly discoveryPort: number;

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    options: { cwd?: string; port?: number; discoveryPort?: number } = {},
  ) {
    this.port = options.port ?? PORT;
    this.discoveryPort = options.discoveryPort ?? DISCOVERY_PORT;
    const cwd = options.cwd ?? getPersistDir();
    this.archive = new OperatorCallArchive(cwd);
    this.config = new Store<OperatorSettings>({
      name: 'operator-link',
      cwd,
      defaults: { id: '', token: '', enabled: false },
    });
    const saved = this.config.store;
    if (!saved.id || !saved.token) {
      // Save the identity and credential together, before exposing a QR.
      this.config.store = {
        id: saved.id || crypto.randomUUID(),
        token: saved.token || crypto.randomBytes(32).toString('hex'),
        enabled: saved.enabled === true,
      };
    }
  }

  status(): OperatorStatus {
    return {
      enabled: this.config.get('enabled'),
      running: !!this.server?.address(),
      id: this.config.get('id'),
      name: os.hostname(),
      error: this.error,
    };
  }

  pairing(): OperatorPairing {
    return {
      version: 2,
      id: this.config.get('id'),
      name: os.hostname(),
      url: `ws://${lanIpv4()}:${this.port}?token=${this.config.get('token')}`,
      discoveryPort: this.discoveryPort,
    };
  }

  customerName(phone: string, name: string): void {
    if (!phone || phone.length > 80 || !name.trim() || name.length > 240) return;
    this.archive.setCustomerName(phone, name);
    this.sendToPhones({ type: 'customer_name', phone, name: name.trim() });
  }

  /** Tells every connected phone that an order was saved for this number. */
  orderCreated(phone: unknown, orderId: unknown): boolean {
    const message = parseOrderCreated(phone, orderId);
    if (!message) return false;
    this.sendToPhones(message);
    return true;
  }

  private sendToPhones(message: object): void {
    const text = JSON.stringify(message);
    for (const socket of this.server?.clients ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
    }
  }

  private toRenderer(event: OperatorCallEvent): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('operator:call-event', event);
  }

  private sendCachedNames(socket: WebSocket, session: PhoneSession, calls: OperatorLiveCall[]) {
    for (const call of calls) {
      if (call.state === 'ended' || !call.phone || call.customerName) continue;
      if (session.named.has(call.id)) continue;
      const name = this.archive.customerName(call.phone);
      if (!name) continue;
      if (session.named.size >= 200) session.named.clear();
      session.named.add(call.id);
      socket.send(JSON.stringify({ type: 'customer_name', phone: call.phone, name }));
    }
  }

  private onPhoneMessage(
    socket: WebSocket,
    session: PhoneSession,
    event: OperatorPhoneMessage,
  ): void {
    const record = event.type === 'call_record' || event.type === 'call_end' ? event.record : null;
    if (record) {
      try {
        const saved = this.archive.save(record);
        socket.send(
          JSON.stringify({
            type: 'call_record_ack',
            id: saved.id,
            ...(saved.revision === undefined ? {} : { revision: saved.revision }),
          }),
        );
      } catch (error) {
        // Leave the record unacknowledged so the phone retries it.
        console.error('[operator] failed to save call record:', error);
      }
    }
    const { source } = session;
    switch (event.type) {
      case 'call_record':
        return;
      case 'operator_hello':
        session.role = event.role;
        session.protocol = event.protocol;
        this.toRenderer({ type: 'phone_role', source, role: event.role });
        return;
      case 'call_state':
        this.sendCachedNames(socket, session, event.calls);
        this.toRenderer({ type: 'call_state', source, role: session.role, calls: event.calls });
        return;
      case 'call_start':
      case 'call_end':
        // Protocol 3 phones also send the legacy frames for older desktops;
        // their call_state snapshot already describes the same calls.
        if (session.protocol >= 3) return;
        if (event.type === 'call_start') {
          const name = this.archive.customerName(event.phone);
          if (name)
            socket.send(JSON.stringify({ type: 'customer_name', phone: event.phone, name }));
          this.toRenderer({
            type: 'call_start',
            source,
            phone: event.phone,
            direction: event.direction,
          });
        } else {
          this.toRenderer({ type: 'call_end', source, phone: event.phone });
        }
    }
  }

  private broadcast(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('operator:state', this.status());
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.operations.then(work);
    this.operations = result.catch(() => undefined);
    return result;
  }

  restore(): Promise<OperatorStatus> {
    return this.enqueue(async () => {
      if (this.config.get('enabled')) await this.start();
      return this.status();
    });
  }

  setEnabled(enabled: boolean): Promise<OperatorStatus> {
    return this.enqueue(async () => {
      // electron-store completes an atomic disk write before IPC acknowledges it.
      // A shutdown closes sockets without changing this preference.
      this.config.set('enabled', enabled);
      if (enabled) await this.start();
      else {
        await this.closeSockets();
        this.error = null;
      }
      this.broadcast();
      return this.status();
    });
  }

  shutdown(): Promise<void> {
    this.closing = true;
    return this.enqueue(() => this.closeSockets());
  }

  private retryLater(): void {
    if (this.retry || this.closing || !this.config.get('enabled')) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.restore();
    }, 5000);
    this.retry.unref();
  }

  private async start(): Promise<void> {
    if (this.closing) return;
    try {
      if (!this.server) {
        const server = new WebSocketServer({
          port: this.port,
          host: '0.0.0.0',
          maxPayload: 65536,
          verifyClient: ({ req }: { req: IncomingMessage }) => {
            try {
              return (
                new URL(req.url ?? '', 'ws://localhost').searchParams.get('token') ===
                this.config.get('token')
              );
            } catch {
              return false;
            }
          },
        });
        this.server = server;
        server.on('connection', (socket) => {
          // A phone that never says hello is a protocol 2 operator phone.
          const session: PhoneSession = {
            source: `p${++this.connections}`,
            role: 'operator',
            protocol: 2,
            named: new Set(),
          };
          socket.on('error', () => undefined);
          socket.on('close', () => this.toRenderer({ type: 'phone_gone', source: session.source }));
          socket.on('message', (raw) => {
            if (!this.config.get('enabled')) return;
            const event = parseOperatorMessage(raw);
            if (event) this.onPhoneMessage(socket, session, event);
          });
        });
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error) => {
            server.off('listening', listening);
            reject(error);
          };
          const listening = () => {
            server.off('error', failed);
            resolve();
          };
          server.once('error', failed);
          server.once('listening', listening);
        });
        server.on('error', (error) => {
          this.error = error.message;
          this.broadcast();
        });
      }
      if (!this.discovery) await this.startDiscovery();
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Operator connection unavailable';
      if (this.server && !this.server.address()) {
        this.server.close();
        this.server = null;
      }
      this.retryLater();
    }
    this.broadcast();
  }

  private async startDiscovery(): Promise<void> {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (raw, sender) => {
      if (raw.length > 1024 || !this.config.get('enabled') || !this.server?.address()) return;
      try {
        const request = JSON.parse(raw.toString('utf8')) as Record<string, unknown> | null;
        if (
          !request ||
          request.type !== 'operator_discover' ||
          request.id !== this.config.get('id') ||
          typeof request.nonce !== 'string' ||
          !request.nonce ||
          request.nonce.length > 128
        )
          return;
        const response = Buffer.from(
          JSON.stringify({
            type: 'operator_discovered',
            id: this.config.get('id'),
            nonce: request.nonce,
            port: this.port,
          }),
        );
        socket.send(response, sender.port, sender.address, () => undefined);
      } catch {
        // Ignore malformed or unrelated LAN discovery packets.
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => {
          socket.off('listening', listening);
          reject(error);
        };
        const listening = () => {
          socket.off('error', failed);
          resolve();
        };
        socket.once('error', failed);
        socket.once('listening', listening);
        socket.bind(this.discoveryPort, '0.0.0.0');
      });
      this.discovery = socket;
      socket.on('error', (error) => {
        this.error = error.message;
        if (this.discovery === socket) this.discovery = null;
        socket.close();
        this.retryLater();
        this.broadcast();
      });
    } catch (error) {
      socket.close();
      throw error;
    }
  }

  private async closeSockets(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.discovery) {
      const socket = this.discovery;
      this.discovery = null;
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
    if (this.server) {
      const server = this.server;
      this.server = null;
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

export function registerOperatorHandler(getMainWindow: () => BrowserWindow | null): void {
  const service = new OperatorLinkService(getMainWindow);
  const ready = app.whenReady().then(() => service.restore());
  ipcMain.handle('operator:status', async () => {
    await ready;
    return service.status();
  });
  ipcMain.handle('operator:pairing', () => service.pairing());
  ipcMain.handle('operator:customer-name', (_event, phone: unknown, name: unknown) => {
    if (typeof phone === 'string' && typeof name === 'string') service.customerName(phone, name);
  });
  ipcMain.handle('operator:order-created', (_event, phone: unknown, orderId: unknown) =>
    service.orderCreated(phone, orderId),
  );
  ipcMain.handle('operator:start', async () => {
    await ready;
    await service.setEnabled(true);
    return { ...service.status(), ...service.pairing() };
  });
  ipcMain.handle('operator:stop', async () => {
    await ready;
    return service.setEnabled(false);
  });
  app.on('before-quit', () => {
    void service.shutdown();
  });
}
