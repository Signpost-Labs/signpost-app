const fs = require('fs');
const path = require('path');

describe('contract-integration.yml workflow', () => {
  const workflowPath = path.join(
    __dirname,
    '../../.github/workflows/contract-integration.yml',
  );
  const content = fs.readFileSync(workflowPath, 'utf8');

  it('uses npm ci instead of npm install for reproducible dependency installation', () => {
    expect(content).toMatch(/^\s*-\s*run:\s*npm ci\b/m);
    expect(content).not.toMatch(/^\s*-\s*run:\s*npm install\b/m);
  });

  it('keeps actions/setup-node npm cache configured against package-lock.json', () => {
    expect(content).toContain('uses: actions/setup-node@');
    expect(content).toContain('cache: npm');
  });
});
