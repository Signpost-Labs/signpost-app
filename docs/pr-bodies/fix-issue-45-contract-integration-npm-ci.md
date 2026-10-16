<!-- Branch: fix/issue-45-contract-integration-npm-ci -->
<!-- Title: ci: use npm ci --no-audit --no-fund in contract-integration.yml (#45) -->

## Summary

Fixes #45. Replaces `npm install` with `npm ci --no-audit --no-fund` in `.github/workflows/contract-integration.yml` so the contract integration job honors `package-lock.json` deterministically, fails fast on lockfile drift, and aligns with `ci.yml` and `visual-regression.yml`.

## Validation

- Added Jest test suite `__tests__/scripts/contract-integration-workflow.test.js` verifying `contract-integration.yml` runs `npm ci` and never `npm install`.
- Verified `node scripts/validate-pr-bodies.js` and Prettier formatting pass with zero violations.
- Base Mainnet USDC Payout Wallet: `0x3806cd592a508d1992Ed007C2F53de251C2E7452`
