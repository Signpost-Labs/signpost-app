const fs = require('fs');
const path = require('path');

describe('visual-regression.yml workflow configuration (#43)', () => {
  const repoRoot = path.join(__dirname, '../..');
  const workflowPath = path.join(repoRoot, '.github/workflows/visual-regression.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  it('runs npm run test:visual without --update-snapshots', () => {
    expect(content).toContain('run: npm run test:visual');
    expect(content).not.toContain('test:visual:update');
    expect(content).not.toContain('--update-snapshots');
  });

  it('uploads visual-regression-report on failure()', () => {
    expect(content).toContain('if: failure()');
    expect(content).toContain('name: visual-regression-report');
  });

  it('has committed baseline snapshots under e2e/visual/storybook.visual.spec.ts-snapshots/', () => {
    const snapshotsDir = path.join(
      repoRoot,
      'e2e/visual/storybook.visual.spec.ts-snapshots',
    );
    const pngs = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(140);
  });
});
