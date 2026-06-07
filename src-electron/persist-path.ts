// src-electron/persist-path.ts
//
// Where per-PC config lives. We deliberately store it MACHINE-WIDE under
// ProgramData (not the per-user Roaming/userData, and never the install dir)
// so it:
//   - is one config per physical PC (not per Windows user), and
//   - survives an app uninstall/reinstall (uninstallers don't touch ProgramData).
//
// Falls back to userData on non-Windows or if ProgramData is unavailable.

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

let cached: string | null = null;

export function getPersistDir(): string {
  if (cached) return cached;
  const base = process.env.PROGRAMDATA || app.getPath('userData');
  const dir = path.join(base, 'AlphaPOS');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cached = dir;
  } catch {
    // ProgramData not writable (locked-down box) → fall back to userData.
    cached = app.getPath('userData');
  }
  return cached;
}
