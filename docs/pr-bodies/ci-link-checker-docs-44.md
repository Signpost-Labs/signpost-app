<!-- Branch: ci/link-checker-docs-44 -->
<!-- Title: ci: point link checker at SECURITY.md, docs/**, and .github/** (#44) -->

## Summary

Closes #44. Extends `.github/workflows/link-check.yml` so `lychee-action` checks `SECURITY.md`, `'docs/**/*.md'`, and `'.github/**/*.md'`, documents the `--exclude 'mailto|github.com/.*#'` anchor rationale, sets `fail: true`, and fixes the relative links to `../docs/pr-bodies/README.md` in `.github/PR_DOCUMENTATION.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

## Validation

| Check | Result |
| --- | --- |
| `node scripts/validate-pr-bodies.js` | Passes with 0 violations |
| `__tests__/scripts/link-check-workflow.test.js` | Verifies `SECURITY.md`, `docs/**/*.md`, `.github/**/*.md`, and `fail: true` |
