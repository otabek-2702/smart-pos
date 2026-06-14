// src/composables/useTheme.ts
//
// App-wide light/dark theme. Sets [data-theme] on <html>; the design tokens in
// app.scss react to it. Persisted per-PC via the kv store. Singleton ref so the
// toggle button and any reader share one source.

import { ref } from 'vue';
import { read, write } from 'src/utils/storage';

export type AppTheme = 'light' | 'dark';

const THEME_KEY = 'pos:appTheme';
const theme = ref<AppTheme>('light');

function apply(t: AppTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t);
  }
}

/** Call once at boot (after initStorage) to restore the saved theme. */
export function initTheme(): void {
  theme.value = read<AppTheme>(THEME_KEY) === 'dark' ? 'dark' : 'light';
  apply(theme.value);
}

export function useTheme() {
  function setTheme(t: AppTheme): void {
    theme.value = t;
    apply(t);
    void write(THEME_KEY, t);
  }
  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }
  return { theme, setTheme, toggleTheme };
}
