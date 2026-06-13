# Releasing & auto-update

The app auto-updates from a **public** GitHub repo so the installer can be read
without shipping a token (the source repo stays private). Mechanism:
`electron-updater` (main process) + GitHub Releases.

## One-time setup
1. **Create a public repo** `otabek-2702/smart-pos-releases` (empty is fine). This
   only holds release assets — no source.
2. **Create a token** with write access to that repo:
   - Fine-grained PAT → Repository access = `smart-pos-releases` → Permissions:
     **Contents: Read and write**.
3. In the **source** repo (`smart-pos`) → Settings → Secrets → Actions, add
   `RELEASES_TOKEN` = that token.

The publish target (owner/repo) is already wired in
[`quasar.config.ts`](../quasar.config.ts) → `electron.builder.publish`.

## Cut a release
```bash
npm version patch     # or minor / major — bumps package.json and tags vX.Y.Z
git push --follow-tags
```
The tag push triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):
it builds the NSIS installer and publishes the installer + `latest.yml` to a
release on `smart-pos-releases`.

> Publish locally instead of via CI:
> `set GH_TOKEN=<token>` then `npx quasar build -m electron --publish always`.

## What the app does
- Main process (`src-electron/update-handler.ts`) checks `smart-pos-releases`
  ~8s after launch and every 6h, comparing `latest.yml` to the installed
  version. `autoDownload`/`autoInstallOnAppQuit` are **off** — nothing happens
  silently.
- When a newer version exists, the **OrdersPage footer** shows a pulsing
  “Yangilanish mavjud” badge.
- Tapping it opens **`/update`**, gated behind a **manager PIN** (verified via
  `/auth-login`, role MANAGER/ADMIN, cashier session untouched) **or a
  tech-support code**. Only after unlocking can someone download + install.
- Install = `quitAndInstall` (runs the NSIS installer, relaunches the POS).

## Tech-support code
Default `RF-UPDATE-2026` (in `src/pages/UpdatePage.vue`). Override per install by
setting the kv key `pos:techSupportCode`. The manager-PIN path is the strong,
backend-verified gate; the code is a phone-support convenience.

## Notes
- Auto-update only runs in the **packaged** app. In dev it's a no-op (the footer
  badge never appears).
- The NSIS installer is unsigned, so Windows SmartScreen may warn on first run;
  electron-updater still updates. Code-signing later removes the warning.
