const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/link-check.yml');

describe('link-check.yml workflow configuration', () => {
  it('workflow file exists and defines linkcheck job', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('name: Link Checker');
    expect(content).toContain('linkcheck:');
    expect(content).toContain('lycheeverse/lychee-action');
  });

  it('preserves weekly schedule and workflow_dispatch triggers', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain("schedule:");
    expect(content).toContain("- cron: '0 0 * * 0'");
    expect(content).toContain("workflow_dispatch:");
  });

  it('includes SECURITY.md, docs/**/*.md, and .github/**/*.md in arguments', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('SECURITY.md');
    expect(content).toContain("'docs/**/*.md'");
    expect(content).toContain("'.github/**/*.md'");
  });

  it('retains exclusion list with documented anchor rationale', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain("--exclude 'mailto|github.com/.*#'");
    expect(content).toContain('heading anchors');
  });

  it('enforces failure propagation with fail: true', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('fail: true');
  });

  it('ensures all relative links in .github and docs Markdown files resolve to existing files', () => {
    const targetDirs = [path.join(repoRoot, '.github'), path.join(repoRoot, 'docs')];
    const mdFiles = [];

    function findMd(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          findMd(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          mdFiles.push(fullPath);
        }
      }
    }

    targetDirs.forEach((dir) => findMd(dir));
    expect(mdFiles.length).toBeGreaterThan(0);

    const brokenLinks = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    for (const file of mdFiles) {
      const text = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        const target = match[2].trim();
        if (
          target.startsWith('http://') ||
          target.startsWith('https://') ||
          target.startsWith('mailto:') ||
          target.startsWith('#')
        ) {
          continue;
        }
        const cleanTarget = target.split('#')[0].split('?')[0];
        if (!cleanTarget) continue;
        const resolved = path.resolve(path.dirname(file), cleanTarget);
        if (!fs.existsSync(resolved)) {
          brokenLinks.push({
            file: path.relative(repoRoot, file),
            link: target,
            resolved,
          });
        }
      }
    }

    expect(brokenLinks).toEqual([]);
  });
});
