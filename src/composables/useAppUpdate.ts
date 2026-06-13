// src/composables/useAppUpdate.ts
//
// Renderer-side mirror of the main-process update state (electron-updater). A
// single shared reactive object wired to the `updater:state` IPC stream once,
// so the OrdersPage footer badge and the Update page read the same source.
// Safe in a plain browser (no `window.electron`): everything no-ops and no
// update ever appears.

import { reactive, readonly, computed, type ComputedRef, type DeepReadonly } from 'vue';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  version: string | null;
  releaseNotes: string | null;
  percent: number;
  error: string | null;
}

const state = reactive<UpdateState>({
  status: 'idle',
  currentVersion: '',
  version: null,
  releaseNotes: null,
  percent: 0,
  error: null,
});

function bridge() {
  return typeof window !== 'undefined' ? window.electron?.updater : undefined;
}

let initialized = false;
function init(): void {
  if (initialized) return;
  initialized = true;
  const u = bridge();
  if (!u) return;
  // Live pushes from main.
  u.onState((s) => Object.assign(state, s));
  // Seed with the current snapshot (covers a page mounted after the last push).
  void u.get().then((s) => {
    if (s) Object.assign(state, s);
  });
}

interface UseAppUpdate {
  state: DeepReadonly<UpdateState>;
  /** An update exists (available, downloading, or ready to install). */
  hasUpdate: ComputedRef<boolean>;
  /** The download has finished and the app can be relaunched into it. */
  isDownloaded: ComputedRef<boolean>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

export function useAppUpdate(): UseAppUpdate {
  init();

  return {
    state: readonly(state),
    hasUpdate: computed(() =>
      ['available', 'downloading', 'downloaded'].includes(state.status),
    ),
    isDownloaded: computed(() => state.status === 'downloaded'),
    check: async () => {
      await bridge()?.check();
    },
    download: async () => {
      await bridge()?.download();
    },
    install: async () => {
      await bridge()?.install();
    },
  };
}
