/**
 * Unit tests for .github/workflows/link-check.yml (#44)
 */

const fs = require('fs');
const path = require('path');

describe('link-check.yml workflow configuration (#44)', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    'link-check.yml',
  );

  it('passes SECURITY.md, docs/**/*.md, and .github/**/*.md to lychee', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('SECURITY.md');
    expect(workflow).toContain("'docs/**/*.md'");
    expect(workflow).toContain("'.github/**/*.md'");
    expect(workflow).toContain('fail: true');
  });

  it('preserves weekly schedule and workflow_dispatch triggers', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain("- cron: '0 0 * * 0'");
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('documents the rationale for retaining the github.com/.*# anchor exclusion', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain("--exclude 'mailto|github.com/.*#'");
    expect(workflow).toMatch(/heading anchors/i);
  });

  it('verifies relative links across SECURITY.md, docs/**/*.md, and .github/**/*.md resolve on disk', () => {
    const mdFiles = [path.join(repoRoot, 'SECURITY.md')];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          mdFiles.push(full);
        }
      }
    };
    walk(path.join(repoRoot, 'docs'));
    walk(path.join(repoRoot, '.github'));

    const linkRx = /\[[^\]]+\]\(([^)]+)\)/g;
    const broken = [];

    for (const file of mdFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = linkRx.exec(content)) !== null) {
        const rawTarget = match[1].trim();
        if (
          rawTarget.startsWith('http://') ||
          rawTarget.startsWith('https://') ||
          rawTarget.startsWith('mailto:') ||
          rawTarget.startsWith('#')
        ) {
          continue;
        }
        const relPath = rawTarget.split('#')[0].split('?')[0];
        if (!relPath) continue;
        const resolved = path.resolve(path.dirname(file), relPath);
        if (!fs.existsSync(resolved)) {
          broken.push(`${path.relative(repoRoot, file)} -> ${rawTarget}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
