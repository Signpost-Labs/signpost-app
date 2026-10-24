<!-- Branch: fix/visual-regression-baselines -->
<!-- Title: ci: enforce Storybook visual regression testing against committed baselines (#43) -->

## Summary

Resolves #43. Restores enforced Storybook visual regression testing by committing the missing and updated baseline snapshots generated inside the official pinned Playwright container (`mcr.microsoft.com/playwright:v1.61.1-noble`), switching the CI step from baseline regeneration (`npm run test:visual:update`) to baseline comparison (`npm run test:visual`), and configuring failure diff artifacts (`test-results/` and `playwright-report/`) under `visual-regression-report` matching `docs/visual-regression.md`.

## What's changed

- **`e2e/visual/storybook.visual.spec.ts-snapshots/`**:
  - Added 40 missing story baseline snapshots for components (`ActiveSessions`, `NotificationBell`, `OfflineBanner`, `PlayerCompareView`, `RedirectReasonBanner`, `ScrollToTop`, `SessionExpiryWarning`, `SessionMismatchWarning`, `ThemeToggle`, `Turnstile`, `WalletButton`, `LegalPageLayout`, `XlmFiatDisplay`).
  - Updated 6 baselines to match current Storybook stories (`Navbar` seeded session states, `QrModal`).
  - All 140 baseline PNGs now committed, matching the full Storybook component suite rendered in the container.
- **`.github/workflows/visual-regression.yml`**:
  - Replaced `npm run test:visual:update` with `npm run test:visual`.
  - Added step to upload failure diffs and Playwright reports as artifact `visual-regression-report` on `if: failure()`.
  - Removed stale TEMP comment and updated documentation to reflect enforced visual regression comparison.
- **`__tests__/scripts/visual-regression-workflow.test.js`**:
  - Added test suite validating `visual-regression.yml` job definition, triggers, enforced execution command, failure artifact upload configuration, and committed snapshot baseline coverage.

## Validation

- Verified all 140 Storybook baseline PNG files exist and conform to naming convention (`<story-id>-chromium-linux.png`).
- Validated `visual-regression.yml` workflow contract via test suite.
- Verified `node scripts/validate-pr-bodies.js` passes with 0 violations.
