# Desktop Milestone (Freeze Draft)

This file freezes the current desktop automation baseline and defines next-step execution checkpoints.

## Scope snapshot

- Runtime state machine persistence (SQLite) is in place.
- Multi-session behavior is in place (`sessionId`, `wc-*` lifecycle cleanup).
- Runtime SQLite encryption MVP is in place (startup encryption, migration, rekey).
- Desktop E2E has 4 slices:
  - `test:desktop-e2e` (startup)
  - `test:desktop-e2e:flow` (main-process runtime flow)
  - `test:desktop-e2e:renderer` (renderer preload/IPC flow)
  - `test:desktop-e2e:ui` (real click/type UI actions)
- CI has desktop E2E job on `workflow_dispatch` + nightly schedule.

## Acceptance commands

Run in `project/apps/desktop`:

```powershell
npm run lint
npm test
```

Encrypted runtime path checks:

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm run verify:encrypted-start
```

Desktop E2E checks:

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm run test:desktop-e2e
npm run test:desktop-e2e:flow
npm run test:desktop-e2e:renderer
npm run test:desktop-e2e:ui
```

## Stable failure signals

- Runtime SQLite init failure:
  - main log event: `runtime-sqlite-init-failed`
  - message prefix should stay stable: `runtime sqlite init failed:`
- Desktop E2E flow failure:
  - `desktop-e2e-flow-fail`
  - `desktop-e2e-renderer-flow-fail`
  - `desktop-e2e-ui-fail`
- Wrong-key verification success criterion:
  - verify script returns PASS after seeing `runtime-sqlite-init-failed` with stable prefix

## Rollback playbook (minimal)

If a new change breaks runtime startup or E2E:

1. Revert to previous known-good tag.
2. Re-run:
   - `npm ci`
   - `npm run rebuild:electron` (if running Electron runtime)
3. Validate with:
   - `npm run verify:encrypted-start`
   - `npm run test:desktop-e2e:ui`
4. For encryption migration/rotation incident handling, follow:
   - `RUNTIME_SQLITE_KEY_RUNBOOK.md`

## Week-by-week execution checklist

### Week A (stability hardening)

- [x] Add CI artifact upload for desktop logs on E2E failure.
- [x] Add retry policy for flaky desktop E2E steps (bounded retries).
- [x] Add a short troubleshooting section for CI-only failures.

### Week B (security and key governance)

- [x] Define production key source policy (secret manager target).
- [x] Document rotation cadence and ownership.
- [x] Add explicit "do not use plain env in production" note to runbook.

### Week C (developer workflow)

- [x] Triage `npm audit` findings by severity.
- [x] Decide on `husky` / `lint-staged` adoption.
- [x] Add contribution guideline snippet for new script architecture (`scripts/lib/*` reuse).

### Week D (release channel)

- [ ] Define installer strategy (`electron-builder` etc.).
- [ ] Define signing requirements and release channel policy.
- [ ] Add pre-release gate checklist (lint/test/e2e/verify).

## Ownership and updates

- Update this file when a milestone gate changes from "planned" to "done".
- Keep command examples copy/paste ready.
- Keep failure signal names exactly aligned with code and logs.

