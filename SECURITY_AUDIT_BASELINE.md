# Security Audit Baseline

Last updated: 2026-04-18
Source command:

```powershell
npm audit --json
```

## Summary

- Total vulnerabilities: 3
- Critical: 0
- High: 1
- Moderate: 0
- Low: 2

## Findings by priority

### P0 - High

1. `electron` (direct dependency)
   - Severity: high (plus multiple moderate/low advisories bundled)
   - Current range affected: `<=39.8.4`
   - Current installed: `^35.7.5` (affected)
   - `npm audit` fix suggestion: `electron@41.2.1` (semver-major)
   - Action:
     - Plan a controlled Electron major upgrade track.
     - Run full desktop regression (startup/flow/renderer/ui) after upgrade.
     - Rebuild native module ABI (`npm run rebuild:electron`) and re-verify runtime sqlite startup checks.

### P2 - Low

1. `@eslint/plugin-kit` ReDoS advisory (transitive)
2. `eslint` affected via `@eslint/plugin-kit`
   - Severity: low
   - Action:
     - Accept short-term as low-risk developer-tooling issue.
     - Resolve during routine lint stack upgrade window.

## Risk notes

- The only production-runtime relevant item in this baseline is Electron.
- Low findings are in lint/tooling path and do not directly change runtime behavior.

## Next review trigger

Re-run and refresh this baseline when any of the following happens:

- Electron major/minor upgrade is planned.
- Security incident requires forced dependency review.
- Monthly dependency maintenance window.

