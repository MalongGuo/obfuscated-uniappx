import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { createDefaultConfig } from '../src/config/defaults.js';
import {
  applyDirRenameMap,
  renameStaticImages,
} from '../src/transforms/rename-images.js';

describe('renameStaticImages', () => {
  it('static 子目录与文件名均加 token', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-img-'));
    await fs.ensureDir(path.join(root, 'static/test-image'));
    await fs.writeFile(path.join(root, 'static/test-image/logo.png'), 'fake-png');

    const config = createDefaultConfig();
    config.seed = 'static-rename-test';

    const { renameLog, imageCount, dirCount } = await renameStaticImages(root, config);
    expect(dirCount).toBeGreaterThan(0);
    expect(imageCount).toBe(1);

    const dirRename = renameLog.find((r) => r.from === 'static/test-image');
    expect(dirRename).toBeTruthy();

    const fileRename = renameLog.find((r) => r.from === 'static/test-image/logo.png');
    expect(fileRename).toBeTruthy();
    expect(fileRename!.to).toMatch(/^static\/[A-Za-z0-9]+test-image\/[A-Za-z0-9]+logo\.png$/);

    expect(await fs.pathExists(path.join(root, fileRename!.to))).toBe(true);
  });

  it('以图片路径输出进度，不含引用阶段', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-img-'));
    await fs.ensureDir(path.join(root, 'static'));
    await fs.ensureDir(path.join(root, 'pages'));
    await fs.writeFile(path.join(root, 'static/a.png'), '1');
    await fs.writeFile(path.join(root, 'pages/x.uvue'), '<image src="/static/a.png" />');

    const config = createDefaultConfig();
    config.seed = 'progress-test';
    const lines: string[] = [];

    await renameStaticImages(root, config, {
      onImageProgress: (_i, _t, detail) => lines.push(detail),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^static\/a\.png → static\/[A-Za-z0-9]+a\.png$/);
    expect(lines[0]).not.toContain('pages/');
  });

  it('skipReferenceSync 时不单独同步源码引用', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-img-'));
    await fs.ensureDir(path.join(root, 'static'));
    await fs.ensureDir(path.join(root, 'pages'));
    await fs.writeFile(path.join(root, 'static/a.png'), '1');
    await fs.writeFile(path.join(root, 'pages/x.uvue'), '<image src="/static/a.png" />');

    const config = createDefaultConfig();
    config.seed = 'skip-sync-test';

    const { replacedFiles } = await renameStaticImages(root, config, { skipReferenceSync: true });
    expect(replacedFiles).toBe(0);

    const content = await fs.readFile(path.join(root, 'pages/x.uvue'), 'utf-8');
    expect(content).toContain('/static/a.png');
  });
});

describe('applyDirRenameMap', () => {
  it('映射 static 子目录下的文件路径', () => {
    const mapped = applyDirRenameMap('static/test-image/logo.png', [
      { from: 'static/test-image', to: 'static/TOKENtest-image' },
    ]);
    expect(mapped).toBe('static/TOKENtest-image/logo.png');
  });
});
