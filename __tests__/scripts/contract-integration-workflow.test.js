/**
 * Unit tests for .github/workflows/contract-integration.yml (#45)
 *
 * Ensures the Contract Integration workflow installs dependencies from the
 * pinned package-lock.json via `npm ci --no-audit --no-fund` while preserving
 * the setup-node npm cache and workspace installation behavior.
 */

const fs = require('fs');
const path = require('path');

describe('contract-integration.yml dependency installation (#45)', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'contract-integration.yml',
  );
  const pkgJsonPath = path.join(repoRoot, 'package.json');

  it('runs npm ci --no-audit --no-fund instead of npm install', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain(
      '- name: Install dependencies\n        run: npm ci --no-audit --no-fund',
    );
    expect(workflow).not.toMatch(/^\s*run:\s*npm install\s*$/m);
  });

  it('preserves the setup-node npm cache configuration', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('cache: npm');
  });

  it('installs root workspace packages including packages/indexer and packages/contract-events', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    expect(pkg.workspaces).toContain('packages/*');
    expect(
      fs.existsSync(path.join(repoRoot, 'packages', 'indexer', 'package.json')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, 'packages', 'contract-events', 'package.json'),
      ),
    ).toBe(true);
  });
});
