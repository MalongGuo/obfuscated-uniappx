import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import {
  applyPagesJsonFixes,
  collectPagesJsonFixes,
  findSubPackageRelOnDisk,
} from '../src/fix/pages-json-fix.js';

describe('pages-json-fix', () => {
  it('根据磁盘文件修复 subPackage 多段相对路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-json-fix-'));
    const pkgRoot = path.join(root, 'pages', 'TOKENCSS', 'TOKENtext');
    await fs.ensureDir(pkgRoot);
    await fs.writeFile(path.join(pkgRoot, 'TOKENfont-family-icon.uvue'), '<template></template>');

    const rel = findSubPackageRelOnDisk(
      path.join(root, 'pages', 'TOKENCSS'),
      'TOKENtext/font-family-icon',
      'TOKEN',
    );
    expect(rel).toBe('TOKENtext/TOKENfont-family-icon');

    const pagesJson = [
      '{',
      '  "subPackages": [{',
      '    "root": "pages/TOKENCSS",',
      '    "pages": [{ "path": "TOKENtext/font-family-icon" }]',
      '  }]',
      '}',
    ].join('\n');

    const fixes = collectPagesJsonFixes(root, pagesJson, 'TOKEN');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.newValue).toBe('TOKENtext/TOKENfont-family-icon');

    const updated = applyPagesJsonFixes(pagesJson, fixes);
    expect(updated).toContain('"path": "TOKENtext/TOKENfont-family-icon"');
    await fs.remove(root);
  });

  it('兼容 dynamic-border 误混淆为 dynamic-TOKENborder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-json-fix-dynamic-'));
    const pkgRoot = path.join(root, 'pages', 'TOKENCSS', 'TOKENborder');
    await fs.ensureDir(pkgRoot);
    await fs.writeFile(path.join(pkgRoot, 'dynamic-TOKENborder.uvue'), '<template></template>');

    const pagesJson = [
      '{',
      '  "subPackages": [{',
      '    "root": "pages/TOKENCSS",',
      '    "pages": [{ "path": "TOKENborder/dynamic-border" }]',
      '  }]',
      '}',
    ].join('\n');

    const fixes = collectPagesJsonFixes(root, pagesJson, 'TOKEN');
    expect(fixes[0]?.newValue).toBe('TOKENborder/dynamic-TOKENborder');
    await fs.remove(root);
  });

  it('已正确的路径不产生修复', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-json-fix-ok-'));
    const pkgRoot = path.join(root, 'pages', 'TOKENtabBar');
    await fs.ensureDir(pkgRoot);
    await fs.writeFile(path.join(pkgRoot, 'TOKENtab-bar.uvue'), '<template></template>');

    const pagesJson = [
      '{',
      '  "pages": [{ "path": "pages/TOKENtabBar/TOKENtab-bar" }],',
      '  "subPackages": []',
      '}',
    ].join('\n');

    const fixes = collectPagesJsonFixes(root, pagesJson, 'TOKEN');
    expect(fixes).toHaveLength(0);
    await fs.remove(root);
  });
});
