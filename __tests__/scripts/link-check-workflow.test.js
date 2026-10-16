const fs = require('fs');
const path = require('path');

describe('link-check.yml workflow configuration', () => {
  const repoRoot = path.join(__dirname, '../..');
  const workflowPath = path.join(repoRoot, '.github/workflows/link-check.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  it('scans README.md, CONTRIBUTING.md, SECURITY.md, docs/**/*.md, and .github/**/*.md', () => {
    expect(content).toContain('README.md');
    expect(content).toContain('CONTRIBUTING.md');
    expect(content).toContain('SECURITY.md');
    expect(content).toContain("'docs/**/*.md'");
    expect(content).toContain("'.github/**/*.md'");
  });

  it('enforces fail: true so broken links fail the job', () => {
    expect(content).toMatch(/^\s*fail:\s*true\s*$/m);
  });

  it('has valid relative links in .github markdown docs', () => {
    const prDoc = fs.readFileSync(
      path.join(repoRoot, '.github/PR_DOCUMENTATION.md'),
      'utf8',
    );
    const prTpl = fs.readFileSync(
      path.join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md'),
      'utf8',
    );
    expect(prDoc).not.toContain('(../components/');
    expect(prTpl).toContain('(../docs/pr-bodies/README.md)');
  });
});
