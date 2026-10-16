<!-- Branch: fix/issue-43-visual-regression-baselines -->
<!-- Title: ci(visual): compare Storybook visual baselines instead of regenerating (#43) -->

## Summary

Fixes #43. Commits the complete set of 140 Storybook visual baseline PNG snapshots under `e2e/visual/storybook.visual.spec.ts-snapshots/` (rendered inside `mcr.microsoft.com/playwright:v1.61.1-noble`), updates `.github/workflows/visual-regression.yml` to run `npm run test:visual` instead of `npm run test:visual:update`, removes the stale temporary comment, and uploads failure diff images (`test-results/` and `playwright-report/`) on `if: failure()`.

## Validation

- Added Jest test suite `__tests__/scripts/visual-regression-workflow.test.js` verifying `visual-regression.yml` runs `npm run test:visual`, removes the temporary regeneration comment, uploads diff artifacts on failure, and has all 140 baseline PNGs committed.
- Verified `node scripts/validate-pr-bodies.js` and Prettier formatting pass with 0 violations.
- Base Mainnet USDC Payout Wallet: `0x3806cd592a508d1992Ed007C2F53de251C2E7452`
