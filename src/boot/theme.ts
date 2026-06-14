// src/boot/theme.ts
//
// Bundles the app fonts (offline-safe — no Google CDN dependency on a kiosk)
// and restores the saved light/dark theme. Runs after the axios boot, which
// hydrates the kv cache, so initTheme() can read synchronously.

import { boot } from 'quasar/wrappers';

// UI font — Hanken Grotesk
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';

// Numbers — JetBrains Mono (tabular)
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

import { initTheme } from 'src/composables/useTheme';

export default boot(() => {
  initTheme();
});
