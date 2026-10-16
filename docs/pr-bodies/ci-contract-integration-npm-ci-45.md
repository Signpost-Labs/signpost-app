<!-- Branch: ci/contract-integration-npm-ci-45 -->
<!-- Title: ci: use npm ci --no-audit --no-fund in contract-integration.yml (#45) -->

## Summary

Closes #45. Replaces `npm install` with `npm ci --no-audit --no-fund` in the `Install dependencies` step of `.github/workflows/contract-integration.yml` so the contract integration suite installs strictly from `package-lock.json` without mutating it, matching `ci.yml` and `visual-regression.yml`.

## Validation

| Check | Result |
| --- | --- |
| `node scripts/validate-pr-bodies.js` | Passes with 0 violations |
| `__tests__/scripts/contract-integration-workflow.test.js` | Verifies `npm ci --no-audit --no-fund` and `cache: npm` |
