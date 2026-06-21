// src/composables/useTweaks.ts
//
// Renderer side of the scope-aware tweak store (main process = tweaks-handler).
// `useTweak(key, default, defaultScope)` gives a writable value + a scope
// ('this-pc' | 'global'). Reading resolves per scope; writing routes to the
// right store (local file, or the main PC's LAN settings server for globals).
// Writes update the reactive state OPTIMISTICALLY so controls never snap back
// when the main PC is briefly unreachable; the next broadcast reconciles.

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

// Merge a (possibly malformed / partial) state payload from main, always
// keeping local.values / global.{scopes,values} as real objects so reads can't
// hit `undefined[key]`.
function applyState(s: Partial<TweaksState> | null | undefined): void {
  if (!s || typeof s !== 'object') return;
  if (s.local && typeof s.local === 'object') {
    state.local = { values: s.local.values ?? {} };
  }
  if (s.global && typeof s.global === 'object') {
    state.global = {
      version: s.global.version ?? 0,
      scopes: s.global.scopes ?? {},
      values: s.global.values ?? {},
    };
  }
  if (typeof s.isMainPc === 'boolean') state.isMainPc = s.isMainPc;
}

let initialized = false;
function init(): void {
  if (initialized) return;
  initialized = true;
  const t = bridge();
  if (!t) return;
  t.onChanged((s) => applyState(s as Partial<TweaksState>));
  void t.get().then((s) => applyState(s as Partial<TweaksState>));
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

  const scope = computed<TweakScope>(() => state.global.scopes?.[key] ?? defaultScope);

  const value = computed<T>({
    get() {
      const store = scope.value === 'global' ? state.global.values : state.local.values;
      const v = store?.[key];
      return v === undefined ? defaultValue : (v as T);
    },
    set(v: T) {
      // Optimistic — update the reactive store now so the control sticks even if
      // the main PC is momentarily unreachable; a later broadcast reconciles.
      if (scope.value === 'global') {
        state.global.values[key] = v;
        void bridge()?.setGlobal(key, v);
      } else {
        state.local.values[key] = v;
        void bridge()?.setLocal(key, v);
      }
    },
  });

  // Switch a tweak between per-PC and global, seeding the destination store with
  // the current effective value so nothing jumps.
  function setScope(s: TweakScope): void {
    const current = value.value;
    state.global.scopes[key] = s; // optimistic scope decision
    if (s === 'global') {
      state.global.values[key] = current;
      void bridge()?.setGlobal(key, current as unknown, 'global');
    } else {
      state.local.values[key] = current;
      void bridge()?.setLocal(key, current as unknown);
      void bridge()?.setGlobal(key, undefined, 'this-pc'); // record the scope decision globally
    }
  }

  return { value, scope, setScope };
}

// Non-reactive one-shot read — for imperative checks (e.g. the print path).
export function readTweak<T>(key: string, defaultValue: T, defaultScope: TweakScope = 'this-pc'): T {
  init();
  const scope = state.global.scopes?.[key] ?? defaultScope;
  const store = scope === 'global' ? state.global.values : state.local.values;
  const v = store?.[key];
  return v === undefined ? defaultValue : (v as T);
}

export function useTweaksMeta() {
  init();
  return {
    isMainPc: computed(() => state.isMainPc),
    exportTweaks: () => bridge()?.export(),
    importTweaks: () => bridge()?.import(),
  };
}
