import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// Smoke: the kiosk boots and lands on the user-picker (IndexPage). We don't
// drive PIN -> Orders here because that path requires a reachable backend
// (local backend is mandatory, there is no offline login); a backend-stubbed
// flow is tracked separately as the E2E expansion. This verifies the Electron
// main process starts, the preload bridge loads, and the SPA renders.

// Launch the UnPackaged build directory directly — Electron reads its
// package.json "main", so we don't hard-code the compiled entry filename.
const APP_DIR = path.resolve(process.cwd(), 'dist/electron/UnPackaged');

let app: ElectronApplication;

test.beforeAll(() => {
  if (!fs.existsSync(APP_DIR)) {
    throw new Error(
      `Built Electron app not found at ${APP_DIR}. Run "quasar build -m electron" first.`,
    );
  }
});

test.afterAll(async () => {
  await app?.close();
});

test('boots to the user-picker screen', async () => {
  app = await electron.launch({ args: [APP_DIR, '--no-sandbox'] });

  const window = await app.firstWindow();
  // The picker wrapper renders even when the network-diagnostics overlay is on
  // top (no backend in CI), so it's a stable signal that the renderer mounted.
  await expect(window.locator('.users-wrapper')).toBeVisible({ timeout: 30_000 });
});
