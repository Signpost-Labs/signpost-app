<!-- Branch: ci/visual-regression-baselines-43 -->
<!-- Title: ci: compare visual regression baselines instead of regenerating them (#43) -->

## Summary

Closes #43. Commits the 140 container-rendered Storybook baseline snapshots (`mcr.microsoft.com/playwright:v1.58.2-noble`) under `e2e/visual/storybook.visual.spec.ts-snapshots/` and updates `.github/workflows/visual-regression.yml` to run `npm run test:visual` instead of `npm run test:visual:update`, uploading `visual-regression-report` on `if: failure()`.

## Validation

| Check | Result |
| --- | --- |
| `node scripts/validate-pr-bodies.js` | Passes with 0 violations |
| `__tests__/scripts/visual-regression-workflow.test.js` | Verifies `npm run test:visual`, `if: failure()`, and 140 committed PNG snapshots |
