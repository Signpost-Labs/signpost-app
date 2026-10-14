const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/link-check.yml');

function collectMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function findBrokenRelativeLinks(markdownFiles) {
  const linkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const broken = [];

  for (const file of markdownFiles) {
    const raw = fs.readFileSync(file, 'utf8');
    const stripped = raw.replace(/```[\s\S]*?```/g, '');
    let match;
    while ((match = linkRegex.exec(stripped)) !== null) {
      const targetRaw = match[1].trim().split(/\s+/)[0];
      if (
        !targetRaw ||
        targetRaw.startsWith('#') ||
        targetRaw.startsWith('mailto:') ||
        /^https?:\/\//i.test(targetRaw)
      ) {
        continue;
      }
      const cleanTarget = targetRaw.split('#')[0].split('?')[0];
      if (!cleanTarget) continue;
      const resolved = cleanTarget.startsWith('/')
        ? path.join(repoRoot, cleanTarget)
        : path.resolve(path.dirname(file), cleanTarget);
      if (!fs.existsSync(resolved)) {
        broken.push({
          file: path.relative(repoRoot, file).replace(/\\/g, '/'),
          target: targetRaw,
        });
      }
    }
  }

  return broken;
}

describe('link-check.yml workflow contract', () => {
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  it('preserves the weekly schedule and workflow_dispatch triggers', () => {
    expect(workflowContent).toMatch(
      /schedule:\s*\n\s*-\s*cron:\s*'0 0 \* \* 0'/,
    );
    expect(workflowContent).toMatch(/workflow_dispatch:/);
  });

  it('passes SECURITY.md, docs/**/*.md, and .github/**/*.md to lychee', () => {
    const argsLine = workflowContent
      .split('\n')
      .find((line) => line.trim().startsWith('args:'));

    expect(argsLine).toBeDefined();
    expect(argsLine).toContain('README.md');
    expect(argsLine).toContain('DEVELOPMENT.md');
    expect(argsLine).toContain('DEPLOYMENT.md');
    expect(argsLine).toContain('CONTRIBUTING.md');
    expect(argsLine).toContain('SECURITY.md');
    expect(argsLine).toContain('packages/indexer/README.md');
    expect(argsLine).toContain('docs/**/*.md');
    expect(argsLine).toContain('.github/**/*.md');
  });

  it('documents the rationale for retaining the github.com anchor exclusion', () => {
    expect(workflowContent).toContain("--exclude 'mailto|github.com/.*#'");
    expect(workflowContent).toMatch(
      /# Retain `github\.com\/\.\*#` in `--exclude`[\s\S]*anchors client-side/,
    );
  });

  it('validates that all checked-in relative links across covered markdown files resolve and detects a broken link in docs/', () => {
    const coveredFiles = [
      path.join(repoRoot, 'README.md'),
      path.join(repoRoot, 'DEVELOPMENT.md'),
      path.join(repoRoot, 'DEPLOYMENT.md'),
      path.join(repoRoot, 'CONTRIBUTING.md'),
      path.join(repoRoot, 'SECURITY.md'),
      path.join(repoRoot, 'packages/indexer/README.md'),
      ...collectMarkdownFiles(path.join(repoRoot, 'docs')),
      ...collectMarkdownFiles(path.join(repoRoot, '.github')),
    ];

    expect(findBrokenRelativeLinks(coveredFiles)).toEqual([]);

    const tempBrokenDoc = path.join(
      repoRoot,
      'docs',
      'tmp-broken-link-check.md',
    );
    fs.writeFileSync(
      tempBrokenDoc,
      '# Temp Broken Link Doc\n\nSee [missing doc](./does-not-exist-404.md).\n',
      'utf8',
    );

    try {
      const filesWithBrokenDoc = [...coveredFiles, tempBrokenDoc];
      expect(findBrokenRelativeLinks(filesWithBrokenDoc)).toEqual([
        {
          file: 'docs/tmp-broken-link-check.md',
          target: './does-not-exist-404.md',
        },
      ]);
    } finally {
      if (fs.existsSync(tempBrokenDoc)) {
        fs.unlinkSync(tempBrokenDoc);
      }
    }
  });
});
