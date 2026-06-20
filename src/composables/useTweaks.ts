// src/composables/useTweaks.ts
//
// Renderer side of the scope-aware tweak store (main process = tweaks-handler).
// `useTweak(key, default, defaultScope)` gives a writable value + a scope
// ('this-pc' | 'global'). Reading resolves per scope; writing routes to the
// right store (local file, or the main PC's LAN settings server for globals).
// One shared reactive state, wired to the main process once.

import { reactive, computed, type WritableComputedRef, type ComputedRef } from 'vue';

export type TweakScope = 'this-pc' | 'global';

interface TweaksState {
  local: { values: Record<string, unknown> };
  global: { version: number; scopes: Record<string, TweakScope>; values: Record<string, unknown> };
  isMainPc: boolean;
}

const state = reactive<TweaksState>({
  local: { values: {} },
  global: { version: 0, scopes: {}, values: {} },
  isMainPc: false,
});

function bridge() {
  return typeof window !== 'undefined' ? window.tweaks : undefined;
}

let initialized = false;
function init(): void {
  if (initialized) return;
  initialized = true;
  const t = bridge();
  if (!t) return;
  t.onChanged((s) => {
    if (s) Object.assign(state, s);
  });
  void t.get().then((s) => {
    if (s) Object.assign(state, s);
  });
}

interface UseTweak<T> {
  value: WritableComputedRef<T>;
  scope: ComputedRef<TweakScope>;
  setScope: (s: TweakScope) => void;
}

export function useTweak<T>(
  key: string,
  defaultValue: T,
  defaultScope: TweakScope = 'this-pc',
): UseTweak<T> {
  init();

  const scope = computed<TweakScope>(() => state.global.scopes[key] ?? defaultScope);

  const value = computed<T>({
    get() {
      const store = scope.value === 'global' ? state.global.values : state.local.values;
      const v = store[key];
      return v === undefined ? defaultValue : (v as T);
    },
    set(v: T) {
      if (scope.value === 'global') void bridge()?.setGlobal(key, v);
      else void bridge()?.setLocal(key, v);
    },
  });

  // Switch a tweak between per-PC and global, seeding the destination store with
  // the current effective value so nothing jumps.
  function setScope(s: TweakScope): void {
    const current = value.value;
    if (s === 'global') {
      void bridge()?.setGlobal(key, current as unknown, 'global');
    } else {
      void bridge()?.setLocal(key, current as unknown);
      void bridge()?.setGlobal(key, undefined, 'this-pc'); // record the scope decision globally
    }
  }

  return { value, scope, setScope };
}

export function useTweaksMeta() {
  init();
  return {
    isMainPc: computed(() => state.isMainPc),
    exportTweaks: () => bridge()?.export(),
    importTweaks: () => bridge()?.import(),
  };
}
