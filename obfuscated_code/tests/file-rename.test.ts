import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import {
  buildDirSyncedFilename,
  buildRenamedFilename,
  containsDirNameSegment,
  isBarrelEntryFilename,
  matchesDirFilename,
  obfuscateOrdinaryFilename,
  replaceDirNameInFilename,
  syncMatchingFilenames,
  syncMatchingFilenamesForDir,
} from '../src/path/file-rename.js';
import { Logger } from '../src/logger/index.js';

describe('buildRenamedFilename', () => {
  it('supports dir/dir.ext and dir/dir.test.js', () => {
    expect(buildRenamedFilename('choose-image.test.js', 'choose-image', 'TOKENchoose-image')).toBe(
      'TOKENchoose-image.test.js',
    );
  });

  it('replaces embedded dir name in filename', () => {
    expect(buildRenamedFilename('wrap-picker-view.test.js', 'picker-view', 'TOKENpicker-view')).toBe(
      'wrap-TOKENpicker-view.test.js',
    );
    expect(replaceDirNameInFilename('wrap-picker-view.uvue', 'picker-view', 'TOKENpicker-view')).toBe(
      'wrap-TOKENpicker-view.uvue',
    );
  });

  it('obfuscates ordinary multi-dot filenames with token prefix', () => {
    expect(obfuscateOrdinaryFilename('a.b.c.d.js', 'TOKEN')).toBe('TOKENa.b.c.d.js');
    expect(buildRenamedFilename('helper.js', 'picker-view', 'TOKENpicker-view')).toBe('TOKENhelper.js');
  });

  it('preserves index.* barrel entry files for directory imports', () => {
    expect(isBarrelEntryFilename('index.uts')).toBe(true);
    expect(isBarrelEntryFilename('index.ts')).toBe(true);
    expect(buildRenamedFilename('index.uts', 'types', 'TOKENtypes')).toBeNull();
    expect(buildRenamedFilename('index.uts', 'utssdk', 'TOKENutssdk')).toBeNull();
    expect(buildRenamedFilename('ai-base.uts', 'types', 'TOKENtypes')).toBe('TOKENai-base.uts');
  });

  it('detects dir name segments', () => {
    expect(containsDirNameSegment('wrap-picker-view.test.js', 'picker-view')).toBe(true);
    expect(containsDirNameSegment('uni-widget.vue', 'widget')).toBe(false);
    expect(containsDirNameSegment('dynamic-border.uvue', 'border')).toBe(false);
    expect(buildRenamedFilename('dynamic-border.uvue', 'border', 'TOKENborder')).toBe('TOKENdynamic-border.uvue');
    expect(matchesDirFilename('choose-image.uvue', 'choose-image')).toBe(true);
    expect(buildDirSyncedFilename('choose-image.test.js', 'choose-image', 'TOKENchoose-image')).toBe(
      'TOKENchoose-image.test.js',
    );
  });
});

describe('syncMatchingFilenames', () => {
  it('renames files that match parent directory name and ordinary files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-'));
    const dirAbs = path.join(root, 'components', 'TOKENbottom-wrap');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'bottom-wrap.uvue'), '<template></template>');
    await fs.writeFile(path.join(dirAbs, 'other.uts'), 'export const x = 1');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenames(
      root,
      [{ from: 'components/bottom-wrap', to: 'components/TOKENbottom-wrap' }],
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'components/TOKENbottom-wrap/bottom-wrap.uvue',
          to: 'components/TOKENbottom-wrap/TOKENbottom-wrap.uvue',
        },
        {
          from: 'components/TOKENbottom-wrap/other.uts',
          to: 'components/TOKENbottom-wrap/TOKENother.uts',
        },
        {
          from: 'components/bottom-wrap/other',
          to: 'components/TOKENbottom-wrap/TOKENother',
        },
      ]),
    );
    expect(await fs.pathExists(path.join(root, 'components/TOKENbottom-wrap/TOKENbottom-wrap.uvue'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'components/TOKENbottom-wrap/TOKENother.uts'))).toBe(true);
    await fs.remove(root);
  });

  it('renames matching files under pages like components', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-pages-'));
    const dirAbs = path.join(root, 'pages', 'TOKENhome');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'home.uvue'), '<template></template>');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenames(
      root,
      [{ from: 'pages/home', to: 'pages/TOKENhome' }],
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        { from: 'pages/TOKENhome/home.uvue', to: 'pages/TOKENhome/TOKENhome.uvue' },
      ]),
    );
    await fs.remove(root);
  });

  it('renames config/config.uts pattern', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-config-'));
    const dirAbs = path.join(root, 'pages', 's', 'TOKENconfig');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'config.uts'), 'export const appConfig = {}');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'pages/s/config',
      'pages/s/TOKENconfig',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        { from: 'pages/s/TOKENconfig/config.uts', to: 'pages/s/TOKENconfig/TOKENconfig.uts' },
      ]),
    );
    await fs.remove(root);
  });

  it('renames dir/dir.test.js like dir/dir.uvue', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-testjs-'));
    const dirAbs = path.join(root, 'pages', 'API', 'TOKENchoose-image');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'choose-image.uvue'), '<template></template>');
    await fs.writeFile(path.join(dirAbs, 'choose-image.test.js'), 'describe("x", () => {})');
    await fs.writeFile(path.join(dirAbs, 'helper.js'), 'export const x = 1');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'pages/API/choose-image',
      'pages/API/TOKENchoose-image',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'pages/API/TOKENchoose-image/choose-image.uvue',
          to: 'pages/API/TOKENchoose-image/TOKENchoose-image.uvue',
        },
        {
          from: 'pages/API/TOKENchoose-image/choose-image.test.js',
          to: 'pages/API/TOKENchoose-image/TOKENchoose-image.test.js',
        },
        {
          from: 'pages/API/TOKENchoose-image/helper.js',
          to: 'pages/API/TOKENchoose-image/TOKENhelper.js',
        },
        {
          from: 'pages/API/choose-image/helper',
          to: 'pages/API/TOKENchoose-image/TOKENhelper',
        },
      ]),
    );
    expect(await fs.pathExists(path.join(dirAbs, 'TOKENchoose-image.test.js'))).toBe(true);
    expect(await fs.pathExists(path.join(dirAbs, 'TOKENhelper.js'))).toBe(true);
    await fs.remove(root);
  });

  it('renames wrap-picker-view files when directory is picker-view', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-picker-'));
    const dirAbs = path.join(root, 'pages', 'component', 'TOKENpicker-view');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'picker-view.uvue'), '<template></template>');
    await fs.writeFile(path.join(dirAbs, 'picker-view.test.js'), 'describe("x", () => {})');
    await fs.writeFile(path.join(dirAbs, 'wrap-picker-view.uvue'), '<template></template>');
    await fs.writeFile(path.join(dirAbs, 'wrap-picker-view.test.js'), 'describe("x", () => {})');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'pages/component/picker-view',
      'pages/component/TOKENpicker-view',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'pages/component/TOKENpicker-view/picker-view.uvue',
          to: 'pages/component/TOKENpicker-view/TOKENpicker-view.uvue',
        },
        {
          from: 'pages/component/TOKENpicker-view/picker-view.test.js',
          to: 'pages/component/TOKENpicker-view/TOKENpicker-view.test.js',
        },
        {
          from: 'pages/component/TOKENpicker-view/wrap-picker-view.uvue',
          to: 'pages/component/TOKENpicker-view/wrap-TOKENpicker-view.uvue',
        },
        {
          from: 'pages/component/TOKENpicker-view/wrap-picker-view.test.js',
          to: 'pages/component/TOKENpicker-view/wrap-TOKENpicker-view.test.js',
        },
      ]),
    );
    expect(await fs.pathExists(path.join(dirAbs, 'wrap-TOKENpicker-view.test.js'))).toBe(true);
    await fs.remove(root);
  });

  it('skips uni_modules/uni-* official plugin paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-uni-'));
    const dirAbs = path.join(root, 'uni_modules', 'TOKENuni-icons');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'uni-icons.vue'), '<template></template>');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenames(
      root,
      [{ from: 'uni_modules/uni-icons', to: 'uni_modules/TOKENuni-icons' }],
      logger,
    );

    expect(fileRenames).toEqual([]);
    expect(await fs.pathExists(path.join(dirAbs, 'uni-icons.vue'))).toBe(true);
    await fs.remove(root);
  });

  it('skips uni_modules/uts-* plugin paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-uts-'));
    const dirAbs = path.join(root, 'uni_modules', 'uts-openSchema');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'index.uts'), 'export const openSchema = () => {}');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'uni_modules/uts-openSchema',
      'uni_modules/TOKENuts-openSchema',
      logger,
    );

    expect(fileRenames).toEqual([]);
    expect(await fs.pathExists(path.join(dirAbs, 'index.uts'))).toBe(true);
    await fs.remove(root);
  });

  it('preserves service/uts/types/index.uts when types dir is renamed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-barrel-'));
    const dirAbs = path.join(root, 'service', 'uts', 'TOKENtypes');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'index.uts'), 'export type Foo = {}');
    await fs.writeFile(path.join(dirAbs, 'ai-base.uts'), 'export type Bar = {}');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'service/uts/types',
      'service/uts/TOKENtypes',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'service/uts/TOKENtypes/ai-base.uts',
          to: 'service/uts/TOKENtypes/TOKENai-base.uts',
        },
      ]),
    );
    expect(await fs.pathExists(path.join(dirAbs, 'index.uts'))).toBe(true);
    expect(await fs.pathExists(path.join(dirAbs, 'TOKENai-base.uts'))).toBe(true);
    await fs.remove(root);
  });

  it('skips uni_modules/xsd-request plugin paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-xsd-'));
    const dirAbs = path.join(root, 'uni_modules', 'xsd-request', 'utssdk');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'index.uts'), 'export const createXRequest = () => {}');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'uni_modules/xsd-request',
      'uni_modules/TOKENxsd-request',
      logger,
    );

    expect(fileRenames).toEqual([]);
    expect(await fs.pathExists(path.join(dirAbs, 'index.uts'))).toBe(true);
    await fs.remove(root);
  });

  it('records route renames for ordinary files like tab-bar', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-tabbar-'));
    const dirAbs = path.join(root, 'pages', 'TOKENtabBar');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'tab-bar.uvue'), '<template></template>');
    await fs.writeFile(path.join(dirAbs, 'generateMenu.uts'), 'export const menu = []');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'pages/tabBar',
      'pages/TOKENtabBar',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'pages/TOKENtabBar/tab-bar.uvue',
          to: 'pages/TOKENtabBar/TOKENtab-bar.uvue',
        },
        {
          from: 'pages/tabBar/tab-bar',
          to: 'pages/TOKENtabBar/TOKENtab-bar',
        },
        {
          from: 'pages/TOKENtabBar/generateMenu.uts',
          to: 'pages/TOKENtabBar/TOKENgenerateMenu.uts',
        },
        {
          from: 'pages/tabBar/generateMenu',
          to: 'pages/TOKENtabBar/TOKENgenerateMenu',
        },
      ]),
    );
    await fs.remove(root);
  });

  it('renames files under uni_modules third-party plugin paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-rename-uni-outside-'));
    const dirAbs = path.join(root, 'uni_modules', 'my-plugin', 'TOKENwidget');
    await fs.ensureDir(dirAbs);
    await fs.writeFile(path.join(dirAbs, 'uni-widget.vue'), '<template></template>');

    const logger = new Logger();
    const fileRenames = await syncMatchingFilenamesForDir(
      root,
      'uni_modules/my-plugin/widget',
      'uni_modules/my-plugin/TOKENwidget',
      logger,
    );

    expect(fileRenames).toEqual(
      expect.arrayContaining([
        {
          from: 'uni_modules/my-plugin/TOKENwidget/uni-widget.vue',
          to: 'uni_modules/my-plugin/TOKENwidget/TOKENuni-widget.vue',
        },
      ]),
    );
    await fs.remove(root);
  });
});
