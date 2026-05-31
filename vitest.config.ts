import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest is intentionally narrow: pure-logic unit tests for composables /
// utils, no Vue component mounting (the Electron-39 + Playwright launch
// incompatibility blocks a real boot test — see project_ci_setup memory).
// CI runs `npm run test:unit` after lint and type-check.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    reporters: 'verbose',
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
});
