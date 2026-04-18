# Desktop release channel (minimal)

This document defines the **minimum viable** packaging/release strategy for `project/apps/desktop`.

## Installer strategy

- **Packaging tool**: `electron-builder`
- **Windows target**: **NSIS** installer (`.exe`)
- **Output folder**: `project/apps/desktop/dist/`

Local commands (PowerShell):

```powershell
cd F:\AI\project\apps\desktop
npm run pack       # unpacked app (dir)
npm run dist:win   # Windows installer (NSIS)
```

Notes:

- `pack` / `dist` / `dist:win` use **`--publish never`** so artifact-only builds (including GitHub Actions) do not require `GH_TOKEN`. To upload to GitHub Releases, run `electron-builder` with an explicit `--publish` mode and provide `GH_TOKEN` (see electron-builder docs).
- Cross-building (e.g. building macOS from Windows) is not supported by default; build on the target OS.
- If you hit native module ABI issues during packaging, run:

```powershell
npm run rebuild:electron
```

## Signing requirements (policy)

Release channels:

- **nightly / internal**: allow unsigned builds (for fast feedback, no trust guarantees).
- **stable**: must be signed.

Signing expectations by OS:

- **Windows**: Authenticode code signing certificate recommended for stable installer; unsigned stable releases are discouraged.
- **macOS**: Developer ID signing + notarization required for stable distribution to avoid Gatekeeper blocks.
- **Linux**: signing is optional; prefer checksums and provenance (CI artifacts, release notes).

This repo does **not** store signing keys/certs. Use a secret manager / CI secrets.

## Pre-release gate checklist

Run in `project/apps/desktop`:

```powershell
npm run lint
npm test
```

Encrypted runtime verification (when encryption is enabled for the target environment):

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm run verify:encrypted-start
```

Desktop E2E (recommended before stable cut; nightly should run at least `test:desktop-e2e:ui`):

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm run test:desktop-e2e
npm run test:desktop-e2e:flow
npm run test:desktop-e2e:renderer
npm run test:desktop-e2e:ui
```

Packaging sanity (Windows):

```powershell
npm run dist:win
```

