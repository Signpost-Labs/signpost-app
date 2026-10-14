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

describe('visual-regression.yml workflow contract', () => {
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  it('runs npm run test:visual to compare against committed baselines instead of regenerating them', () => {
    expect(workflowContent).toMatch(/run:\s*npm run test:visual(\s|$)/m);
    expect(workflowContent).not.toContain('npm run test:visual:update');
    expect(workflowContent).not.toMatch(/^\s*#\s*TEMP:/m);
  });

  it('uploads failure diff artifacts under visual-regression-report when a visual regression occurs', () => {
    expect(workflowContent).toContain('if: failure()');
    expect(workflowContent).toContain('name: visual-regression-report');
    expect(workflowContent).toContain('test-results/');
    expect(workflowContent).toContain('playwright-report/');
  });

  it('commits Linux Chromium baseline snapshots for Storybook stories including newly covered components', () => {
    const files = fs
      .readdirSync(snapshotsDir)
      .filter((file) => file.endsWith('-chromium-linux.png'));

    expect(files.length).toBeGreaterThanOrEqual(140);
    expect(files).toEqual(
      expect.arrayContaining([
        'components-activesessions--empty-chromium-linux.png',
        'components-notificationbell--zero-unread-chromium-linux.png',
        'components-offlinebanner--offline-chromium-linux.png',
        'components-playercompareview--two-players-chromium-linux.png',
        'components-redirectreasonbanner--wallet-required-chromium-linux.png',
        'components-scrolltotop--visible-after-scrolling-chromium-linux.png',
        'components-sessionexpirywarning--near-expiry-chromium-linux.png',
        'components-sessionmismatchwarning--default-chromium-linux.png',
        'components-themetoggle--dark-theme-active-chromium-linux.png',
        'components-turnstile--widget-rendered-chromium-linux.png',
        'components-walletbutton--connected-chromium-linux.png',
        'ui-legalpagelayout--short-content-chromium-linux.png',
        'ui-xlmfiatdisplay--xlm-primary-chromium-linux.png',
      ]),
    );
  });
});
