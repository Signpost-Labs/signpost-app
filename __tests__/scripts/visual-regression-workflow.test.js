const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/visual-regression.yml');
const snapshotsDir = path.join(repoRoot, 'e2e/visual/storybook.visual.spec.ts-snapshots');

describe('visual-regression.yml workflow configuration', () => {
  it('workflow file exists and defines visual-regression job', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('name: Visual Regression');
    expect(content).toContain('visual-regression:');
    expect(content).toContain('mcr.microsoft.com/playwright:v1.61.1-noble');
  });

  it('runs on push and pull_request against main branch', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('branches:\n    - main');
  });

  it('executes npm run test:visual and avoids test:visual:update', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('run: npm run test:visual');
    expect(content).not.toContain('npm run test:visual:update');
  });

  it('uploads visual-regression-report failure diffs when regression occurs', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('if: failure()');
    expect(content).toContain('name: visual-regression-report');
    expect(content).toContain('test-results/');
    expect(content).toContain('playwright-report/');
  });

  it('contains committed baseline PNG snapshots for all Storybook stories', () => {
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.png'));
    expect(files.length).toBeGreaterThanOrEqual(140);

    // Verify all baseline snapshots follow the playwright naming convention: <story-id>-chromium-linux.png
    for (const file of files) {
      expect(file).toMatch(/^[a-z0-9_-]+-chromium-linux\.png$/);
    }
  });
});
