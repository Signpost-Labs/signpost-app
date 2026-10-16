const fs = require('fs');
const path = require('path');

describe('contract-integration.yml workflow (#45)', () => {
  const workflowPath = path.join(
    __dirname,
    '../../.github/workflows/contract-integration.yml',
  );
  const content = fs.readFileSync(workflowPath, 'utf8');

  it('installs dependencies deterministically with npm ci --no-audit --no-fund', () => {
    expect(content).toContain('run: npm ci --no-audit --no-fund');
    expect(content).not.toMatch(/^\s*run:\s*npm install\b/m);
  });

  it('retains actions/setup-node npm caching', () => {
    expect(content).toContain('uses: actions/setup-node@');
    expect(content).toContain('cache: npm');
  });
});
