// src-electron/system-handler.ts
//
// Thin wrappers around Electron's `shell` API so the renderer can deep-link
// into OS settings panels (WiFi, network, printers, sound, date/time...).
// Plus LAN auto-discovery (Node TCP socket probes) used by the diagnostic
// to find the kitchen "main computer" running the backend.

import { ipcMain, shell } from 'electron';
import { exec } from 'child_process';
import { networkInterfaces } from 'os';
import { Socket } from 'net';

const platform = process.platform;

function openWifiPanel(): { success: boolean; error?: string } {
  try {
    if (platform === 'win32') {
      // ms-availablenetworks: opens the small WiFi flyout on the right side
      // of the taskbar — exactly what the user described.
      void shell.openExternal('ms-availablenetworks:');
      return { success: true };
    }
    if (platform === 'darwin') {
      // macOS: open Network preferences
      exec('open /System/Library/PreferencePanes/Network.prefPane');
      return { success: true };
    }
    // Linux fallback — try gnome-control-center
    exec('gnome-control-center wifi');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function openNetworkSettings(): { success: boolean; error?: string } {
  try {
    if (platform === 'win32') {
      // Full Network & Internet settings page
      void shell.openExternal('ms-settings:network-status');
      return { success: true };
    }
    if (platform === 'darwin') {
      exec('open /System/Library/PreferencePanes/Network.prefPane');
      return { success: true };
    }
    exec('gnome-control-center network');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function openPrinterSettings(): { success: boolean; error?: string } {
  try {
    if (platform === 'win32') {
      void shell.openExternal('ms-settings:printers');
      return { success: true };
    }
    if (platform === 'darwin') {
      exec('open /System/Library/PreferencePanes/PrintAndScan.prefPane');
      return { success: true };
    }
    exec('gnome-control-center printers');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ============================================================
   AUTO-DISCOVERY: find the backend on the LAN
   ============================================================
   The diagnostic uses these to help non-technical workers locate the
   kitchen "main computer" without typing an IP. We hand back this PC's
   own IPv4s, then the renderer asks us to scan the /24 around each one
   for an open backend port. */

interface LocalIp {
  /** "192.168.123.45" */
  address: string;
  /** Best-guess subnet base, e.g. "192.168.123" — used by the scanner. */
  subnet: string;
  /** Adapter friendly name (e.g. "Ethernet", "Wi-Fi") so the UI can label. */
  iface: string;
}

function getLocalIPv4s(): LocalIp[] {
  const out: LocalIp[] = [];
  const ifs = networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4') continue;
      if (a.internal) continue; // skip 127.0.0.1
      // Skip APIPA (169.254.x.x) — means DHCP failed
      if (a.address.startsWith('169.254.')) continue;
      const parts = a.address.split('.');
      if (parts.length !== 4) continue;
      out.push({
        address: a.address,
        subnet: `${parts[0]}.${parts[1]}.${parts[2]}`,
        iface: name,
      });
    }
  }
  return out;
}

/**
 * Probe a single TCP host:port. Connect-only, no HTTP — much faster than
 * fetch (no headers, no body, no TLS). Resolves to {ok, ms} where ok=true
 * means the TCP handshake completed (the port is accepting connections).
 */
function probeTcp(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new Socket();
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* noop */ }
      resolve({ ok, ms: ok ? Date.now() - start : null });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    try {
      sock.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

interface FoundServer {
  ip: string;
  ms: number;
}

/**
 * Scan a /24 subnet for hosts with the given TCP port open. Runs probes in
 * parallel batches so the full 254-host scan completes in a few seconds.
 *
 * Concurrency is deliberately moderate (32) — too high and Windows will
 * start dropping outbound TCP attempts. Per-probe timeout is short (800ms)
 * so dead hosts don't slow down the scan.
 */
async function scanSubnet(subnet: string, port: number, signal?: { canceled: boolean }): Promise<FoundServer[]> {
  const found: FoundServer[] = [];
  const concurrency = 32;
  const timeoutMs = 800;

  // Build list of all .1 to .254 IPs in the subnet (skip .0 broadcast and
  // .255 broadcast).
  const targets: string[] = [];
  for (let i = 1; i <= 254; i++) targets.push(`${subnet}.${i}`);

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      if (signal?.canceled) return;
      const ip = targets[cursor++]!;
      const res = await probeTcp(ip, port, timeoutMs);
      if (res.ok) found.push({ ip, ms: res.ms ?? 0 });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  // Sort by latency so the closest server appears first
  found.sort((a, b) => a.ms - b.ms);
  return found;
}

// Active scan token — supports cancel from the renderer
let activeScanToken: { canceled: boolean } | null = null;

export function registerSystemHandler(): void {
  ipcMain.handle('system:openWifi', openWifiPanel);
  ipcMain.handle('system:openNetwork', openNetworkSettings);
  ipcMain.handle('system:openPrinters', openPrinterSettings);

  // Local IPs of THIS computer — used by the renderer to figure out which
  // /24 subnets to scan for the backend.
  ipcMain.handle('system:getLocalIps', (): LocalIp[] => getLocalIPv4s());

  // Probe a single host:port from main process (bypasses CORS / browser
  // limits). Used when the user wants to test a specific IP they typed.
  ipcMain.handle(
    'system:probeTcp',
    (_event, host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms: number | null }> => {
      return probeTcp(host, port, Math.min(Math.max(timeoutMs, 100), 10000));
    },
  );

  // Scan the configured /24 subnet for hosts with the given TCP port open.
  // Returns once all 254 hosts have been probed (or the scan is canceled).
  // Total time is ~3-5s with the current concurrency.
  ipcMain.handle(
    'system:scanForServers',
    async (_event, subnet: string, port: number): Promise<FoundServer[]> => {
      // Cancel any previous scan still running
      if (activeScanToken) activeScanToken.canceled = true;
      const token = { canceled: false };
      activeScanToken = token;
      try {
        return await scanSubnet(subnet, port, token);
      } finally {
        if (activeScanToken === token) activeScanToken = null;
      }
    },
  );

  ipcMain.handle('system:cancelScan', (): boolean => {
    if (activeScanToken) {
      activeScanToken.canceled = true;
      return true;
    }
    return false;
  });
}
