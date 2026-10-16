const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/visual-regression.yml',
);
const snapshotsDir = path.join(
  repoRoot,
  'e2e/visual/storybook.visual.spec.ts-snapshots',
);

describe('visual-regression.yml workflow configuration (#43)', () => {
  it('runs npm run test:visual and does not run test:visual:update', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('run: npm run test:visual');
    expect(content).not.toContain('npm run test:visual:update');
    expect(content).not.toMatch(/TEMP/i);
  });

  it('uploads failure diff artifacts when visual drift is detected', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('if: failure()');
    expect(content).toContain('uses: actions/upload-artifact@');
    expect(content).toContain('test-results/');
    expect(content).toContain('playwright-report/');
  });

  it('commits all 140 Storybook baseline PNG snapshots for container comparison', () => {
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    const pngs = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(140);
    for (const file of pngs) {
      expect(file).toMatch(/^[a-z0-9_-]+-chromium-linux\.png$/);
    }
  });
});
