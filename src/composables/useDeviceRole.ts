// src/composables/useDeviceRole.ts
//
// Tiny reactive helper that tells the UI whether THIS PC is the "main
// computer" (running the local backend) or a secondary terminal.
//
// The signal is dead simple: if the configured server IP is loopback
// (127.0.0.1 or localhost), this PC is its own server — it's the main.
// Any other IP means we're a secondary terminal pointing at someone else.
//
// The role drives whether to show the launch-time internet warning (main
// only) or just the inline status chips (secondary), among other things.

import { computed, type ComputedRef } from 'vue';
import { read } from 'src/utils/storage';

const BASE_URL_KEY = 'pos:IpAdress';
const LOOPBACK_IPS = new Set(['127.0.0.1', 'localhost', '::1']);

export interface DeviceRole {
  isMainPc: ComputedRef<boolean>;
  configuredIp: ComputedRef<string>;
}

export function useDeviceRole(): DeviceRole {
  const configuredIp = computed<string>(() => {
    const ip = read<string>(BASE_URL_KEY) ?? '127.0.0.1';
    return ip.trim();
  });

  const isMainPc = computed<boolean>(() => LOOPBACK_IPS.has(configuredIp.value));

  return { isMainPc, configuredIp };
}
