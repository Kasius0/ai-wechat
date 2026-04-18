# Developer Gates Decision (husky / lint-staged)

Last updated: 2026-04-18

This document records the decision framework for enabling local pre-commit gates.

## Decision summary (current)

- Status: **Adopt in phased rollout**
- Scope now: documentation and default template only
- Implementation timing: next maintenance sprint (no immediate enforcement)

## Why this approach

- Current CI already enforces `lint + test`; hard local gates are optional.
- Team velocity should not be blocked by abrupt hook rollout.
- A phased rollout reduces friction and allows quick rollback.

## Recommended default policy

If enabled, use this baseline:

- husky hook: `pre-commit`
- lint-staged targets:
  - `*.{js,cjs,mjs}` -> `eslint --fix`
  - `*.{md,yml,yaml}` -> `prettier --write` (optional if formatter is adopted)
- keep hook runtime under 20s on typical commits
- skip heavy test suites in pre-commit (keep full tests in CI)

## Rollout plan

1. **Week 1 (observe)**
   - Add config in a feature branch
   - Ask 1-2 contributors to trial
2. **Week 2 (opt-in)**
   - Keep hooks optional but documented
   - Collect false-positive and latency feedback
3. **Week 3 (default-on)**
   - Enable by default if no major friction
   - Keep a short rollback procedure

## Go / no-go checklist

- [ ] Hook runtime is acceptable (<20s median)
- [ ] No frequent false positives
- [ ] CI and local lint behavior are aligned
- [ ] Team owners approved rollout

## Rollback

If developer friction is high:

- Temporarily disable hook install step
- Keep CI as the source of truth
- Revisit pattern list and command latency

