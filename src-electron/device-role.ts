// One authoritative definition of the "main PC" for Electron main-process
// services. The main computer runs the restaurant backend on loopback; every
// secondary terminal points at that computer's LAN address.

import { kvGet } from './kv-store';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function getConfiguredBackendHost(): string {
  const configured = String(kvGet<string>('pos:IpAdress', '') || '').trim().toLowerCase();
  // Axios already uses loopback on a fresh install. Main-process services must
  // use the same default or the renderer and Electron disagree about the role.
  return configured || '127.0.0.1';
}

export function isMainPc(): boolean {
  return LOOPBACK_HOSTS.has(getConfiguredBackendHost());
}

export function localBackendBaseUrl(): string {
  const host = getConfiguredBackendHost();
  const bracketed = host === '::1' ? `[${host}]` : host;
  return `http://${bracketed}:8000`;
}
