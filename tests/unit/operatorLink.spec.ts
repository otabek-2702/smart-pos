import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import dgram from 'node:dgram';
import { WebSocket } from 'ws';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => {
  const electron = {
    app: { getPath: () => process.env.TEMP, getVersion: () => '1.0.0' },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
  };
  return { ...electron, default: electron };
});
vi.mock('../../src-electron/persist-path', () => ({
  getPersistDir: () => {
    throw new Error('Test must supply a temp directory');
  },
}));

import { OperatorLinkService } from '../../src-electron/operator-handler';
import { OperatorCallArchive } from '../../src-electron/operator-call-archive';

const roots: string[] = [];
const services: OperatorLinkService[] = [];
const clients: WebSocket[] = [];

async function ports(): Promise<{ port: number; discoveryPort: number }> {
  const tcp = net.createServer();
  await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', resolve));
  const port = (tcp.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => tcp.close(() => resolve()));
  const udp = dgram.createSocket('udp4');
  await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));
  const discoveryPort = udp.address().port;
  await new Promise<void>((resolve) => udp.close(resolve));
  return { port, discoveryPort };
}

async function setup() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'alphapos-operator-test-'));
  roots.push(cwd);
  const options = { cwd, ...(await ports()) };
  const send = vi.fn();
  const win = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow;
  const service = new OperatorLinkService(() => win, options);
  services.push(service);
  return { service, options, send, win };
}

async function connect(service: OperatorLinkService): Promise<WebSocket> {
  const url = new URL(service.pairing().url);
  url.hostname = '127.0.0.1';
  const socket = new WebSocket(url);
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function receive(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No websocket response')), 1500);
    socket.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  for (const service of services.splice(0)) await service.shutdown();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('alphapos-operator-test-')
    ) {
      throw new Error('Unexpected test cleanup path');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('persistent operator LAN link', () => {
  it('retains the same credential and device across toggles and a new process, restoring saved enabled state', async () => {
    const { service, options, win } = await setup();
    const pairing = service.pairing();
    expect(pairing).toMatchObject({ version: 2, discoveryPort: options.discoveryPort });
    expect(service.status().enabled).toBe(false);
    expect(await service.setEnabled(true)).toMatchObject({
      enabled: true,
      running: true,
      error: null,
    });
    await service.setEnabled(false);
    expect(service.pairing()).toEqual(pairing);
    await service.setEnabled(true);
    await service.shutdown();
    const restarted = new OperatorLinkService(() => win, options);
    services.push(restarted);
    expect(restarted.pairing()).toEqual(pairing);
    expect(await restarted.restore()).toMatchObject({ enabled: true, running: true });
    await restarted.setEnabled(false);
    const next = new OperatorLinkService(() => win, options);
    services.push(next);
    expect(await next.restore()).toMatchObject({ enabled: false, running: false });
    expect(next.pairing()).toEqual(pairing);
  });

  it('authenticates unchanged legacy URLs and forwards only valid caller events', async () => {
    const { service, send } = await setup();
    await service.setEnabled(true);
    const socket = await connect(service);
    socket.send(JSON.stringify({ type: 'call_start', phone: '+998901234567', direction: 'in' }));
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('operator:call-event', {
        type: 'call_start',
        source: expect.any(String),
        phone: '+998901234567',
        direction: 'in',
      }),
    );
    send.mockClear();
    socket.send('broken JSON');
    socket.send(JSON.stringify({ type: 'call_start', phone: {}, direction: 'in' }));
    socket.send(JSON.stringify({ type: 'arbitrary-IPC', phone: '+998901234567' }));
    const reply = receive(socket);
    service.customerName('+998901234567', 'Aziza');
    expect(await reply).toEqual({ type: 'customer_name', phone: '+998901234567', name: 'Aziza' });
    expect(send).not.toHaveBeenCalled();
    const badUrl = new URL(service.pairing().url);
    badUrl.hostname = '127.0.0.1';
    badUrl.searchParams.set('token', 'incorrect');
    const bad = new WebSocket(badUrl);
    clients.push(bad);
    await expect(
      new Promise((resolve, reject) => {
        bad.once('open', resolve);
        bad.once('error', reject);
      }),
    ).rejects.toThrow('401');
  });

  it('tracks the protocol 3 role per phone, forwards call_state and ignores its legacy duplicates', async () => {
    const { service, send } = await setup();
    await service.setEnabled(true);
    service.customerName('+998901234567', 'Aziza');
    const phone = await connect(service);
    const legacy = await connect(service);
    const events = () =>
      send.mock.calls
        .filter(([channel]) => channel === 'operator:call-event')
        .map(([, event]) => event as Record<string, unknown>);

    phone.send(
      JSON.stringify({ type: 'operator_hello', protocol: 3, role: 'cashier', app: '2.2.0' }),
    );
    await vi.waitFor(() => expect(events()).toHaveLength(1));
    const hello = events()[0]!;
    expect(hello).toEqual({ type: 'phone_role', source: expect.any(String), role: 'cashier' });
    const source = hello.source;

    const call = { id: 'c1', phone: '+998901234567', direction: 'in', state: 'ringing', since: 1 };
    const named = receive(phone);
    phone.send(JSON.stringify({ type: 'call_state', calls: [{ ...call, junk: true }] }));
    // The cached name is sent once per call, without waiting for a lookup.
    expect(await named).toEqual({ type: 'customer_name', phone: call.phone, name: 'Aziza' });
    await vi.waitFor(() =>
      expect(events()).toContainEqual({
        type: 'call_state',
        source,
        role: 'cashier',
        calls: [call],
      }),
    );

    send.mockClear();
    phone.send(JSON.stringify({ type: 'call_state', calls: [{ ...call, state: 'active' }] }));
    phone.send(JSON.stringify({ type: 'call_start', phone: call.phone, direction: 'in' }));
    const ack = receive(phone);
    phone.send(
      JSON.stringify({
        type: 'call_end',
        phone: call.phone,
        record: { id: 'c1', phone: call.phone, direction: 'in', startedAt: 1, endedAt: 2 },
      }),
    );
    // No second customer_name arrives first; the record is still stored.
    expect(await ack).toEqual({ type: 'call_record_ack', id: 'c1' });
    expect(events().map((event) => event.type)).toEqual(['call_state']);

    // A phone without hello stays on protocol 2 with its own source.
    legacy.send(JSON.stringify({ type: 'call_start', phone: '+998931112233', direction: 'out' }));
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    const legacyStart = events()[1]!;
    expect(legacyStart).toEqual({
      type: 'call_start',
      source: expect.any(String),
      phone: '+998931112233',
      direction: 'out',
    });
    expect(legacyStart.source).not.toBe(source);

    const toPhone = receive(phone);
    const toLegacy = receive(legacy);
    expect(service.orderCreated('998901234567', 42)).toBe(true);
    for (const message of await Promise.all([toPhone, toLegacy])) {
      expect(message).toEqual({
        type: 'order_created',
        phone: '998901234567',
        orderId: 42,
        at: expect.any(Number),
      });
    }
    expect(service.orderCreated('998901234567', 0)).toBe(false);
    expect(service.orderCreated('<img>', 42)).toBe(false);

    phone.close();
    await vi.waitFor(() => expect(events()).toContainEqual({ type: 'phone_gone', source }));
  });

  it('discovers only the requested machine, echoing nonce without disclosing its credential', async () => {
    const { service, options } = await setup();
    await service.setEnabled(true);
    const socket = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    try {
      const messages: Record<string, unknown>[] = [];
      socket.on('message', (raw) =>
        messages.push(JSON.parse(raw.toString()) as Record<string, unknown>),
      );
      socket.send(
        JSON.stringify({ type: 'operator_discover', id: 'another-machine', nonce: 'wrong' }),
        options.discoveryPort,
        '127.0.0.1',
      );
      socket.send(
        JSON.stringify({
          type: 'operator_discover',
          id: service.pairing().id,
          nonce: 'phone-nonce',
        }),
        options.discoveryPort,
        '127.0.0.1',
      );
      await vi.waitFor(() => expect(messages).toHaveLength(1));
      expect(messages[0]).toEqual({
        type: 'operator_discovered',
        id: service.pairing().id,
        nonce: 'phone-nonce',
        port: options.port,
      });
    } finally {
      socket.close();
    }
  });

  it('acknowledges durable records, preserves latest callback revision and enriches with customer names', async () => {
    const { service, options } = await setup();
    await service.setEnabled(true);
    const socket = await connect(service);
    service.customerName('+998901234567', 'Aziza');
    // Wait for the unsolicited name message before expecting a record ACK.
    await receive(socket);
    const record = {
      id: 'call-1',
      phone: '+998901234567',
      direction: 'in',
      startedAt: 1000,
      endedAt: 4000,
      answeredAt: null,
      ringSeconds: 3,
      talkSeconds: 0,
      outcome: 'missed',
      missedWhileBusy: true,
      revision: 1,
    };
    let reply = receive(socket);
    socket.send(JSON.stringify({ type: 'call_record', record }));
    expect(await reply).toEqual({ type: 'call_record_ack', id: 'call-1', revision: 1 });
    const archive = new OperatorCallArchive(options.cwd);
    expect(archive.get('call-1')).toMatchObject({ ...record, customerName: 'Aziza' });
    reply = receive(socket);
    socket.send(
      JSON.stringify({
        type: 'call_record',
        record: { ...record, revision: 2, callbackAttemptAt: 10000, callbackConnectedAt: null },
      }),
    );
    expect(await reply).toMatchObject({ revision: 2 });
    reply = receive(socket);
    socket.send(JSON.stringify({ type: 'call_record', record }));
    expect(await reply).toMatchObject({ revision: 2 });
    expect(archive.get('call-1')).toMatchObject({
      revision: 2,
      callbackAttemptAt: 10000,
      callbackConnectedAt: null,
    });
    expect(fs.readdirSync(path.join(options.cwd, 'operator-calls', 'records'))).toHaveLength(1);
    reply = receive(socket);
    socket.send(
      JSON.stringify({
        type: 'call_record',
        record: {
          ...record,
          id: 'hidden-call',
          phone: '',
          endedAt: null,
          answeredAt: null,
          ringSeconds: null,
          source: 'call_log',
          timingSource: 'unknown',
        },
      }),
    );
    expect(await reply).toMatchObject({ id: 'hidden-call', revision: 1 });
    expect(archive.get('hidden-call')).toMatchObject({
      phone: '',
      endedAt: null,
      ringSeconds: null,
      timingSource: 'unknown',
    });
  });
});
