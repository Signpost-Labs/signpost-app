<!-- Branch: fix/issue-44-link-checker-docs -->
<!-- Title: ci: point link checker at SECURITY.md, docs/**, and .github/** (#44) -->

## Summary

Fixes #44. Extends `.github/workflows/link-check.yml` so `lychee-action` scans `SECURITY.md`, `'docs/**/*.md'`, and `'.github/**/*.md'` in addition to `README.md` and `CONTRIBUTING.md`, and fixes broken relative links in `.github/PR_DOCUMENTATION.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

## Validation

- Added Jest test suite `__tests__/scripts/link-check-workflow.test.js` verifying `link-check.yml` target paths, `fail: true`, and relative link integrity in `.github/*.md`.
- Verified `node scripts/validate-pr-bodies.js` and Prettier formatting pass with zero violations.
- Base Mainnet USDC Payout Wallet: `0x3806cd592a508d1992Ed007C2F53de251C2E7452`
