import { defineConfig } from '@playwright/test';

// E2E runs against the built Electron app (see e2e/smoke.spec.ts). One worker,
// no parallelism — a single Electron instance at a time.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
