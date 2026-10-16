const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflowPath = path.join(root, '.github/workflows/link-check.yml');
const workflow = () => fs.readFileSync(workflowPath, 'utf8');

describe('Issue #44: link checker documentation coverage', () => {
  test('keeps the weekly schedule and manual dispatch unchanged', () => {
    const text = workflow();
    expect(text).toMatch(/schedule:\s*\n\s*- cron: '0 0 \* \* 0'/);
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/pull_request:/);
  });

  test('continues using the existing pinned lychee action', () => {
    expect(workflow()).toContain(
      'lycheeverse/lychee-action@2b973e86fc7b1f6b36a93795fe2c9c6ae1118621',
    );
  });

  test('preserves the original markdown file coverage', () => {
    const text = workflow();
    for (const file of [
      'README.md',
      'DEVELOPMENT.md',
      'DEPLOYMENT.md',
      'CONTRIBUTING.md',
      'packages/indexer/README.md',
    ]) {
      expect(text).toContain(file);
    }
  });

  test('passes SECURITY.md and recursive docs and GitHub markdown globs to lychee', () => {
    const text = workflow();
    expect(text).toContain('SECURITY.md');
    expect(text).toContain("'docs/**/*.md'");
    expect(text).toContain("'.github/**/*.md'");
    expect(text).toContain('args:');
  });

  test('makes lychee errors fail its workflow step', () => {
    expect(workflow()).toMatch(/\n\s+fail: true(?:\n|$)/);
  });

  test('documents the reasons for keeping the mailto and GitHub-fragment exclusions', () => {
    const text = workflow();
    expect(text).toContain("--exclude 'mailto|github.com/.*#'");
    expect(text).toMatch(/GitHub fragment anchors/);
    expect(text).toMatch(/Ignore mailto:/);
  });

  test('fixes links from both .github documentation files to docs/pr-bodies', () => {
    for (const file of [
      '.github/PR_DOCUMENTATION.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ]) {
      const documentPath = path.join(root, file);
      const text = fs.readFileSync(documentPath, 'utf8');
      const relativeTarget = '../docs/pr-bodies/README.md';
      expect(text).toContain('](' + relativeTarget + ')');
      expect(fs.existsSync(path.resolve(path.dirname(documentPath), relativeTarget))).toBe(true);
    }
  });
});
