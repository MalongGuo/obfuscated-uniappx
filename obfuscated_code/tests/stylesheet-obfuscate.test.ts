import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  applyStylesheetClassRenames,
  buildGlobalStylesheetClassMap,
  runEnhancedStylesheetObfuscation,
  scanStylesheetFiles,
} from '../src/transforms/stylesheet-obfuscate.js';
import { obfuscateColorValuesDetailed } from '../src/transforms/color-obfuscate.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { Logger } from '../src/logger/index.js';

describe('buildGlobalStylesheetClassMap', () => {
  it('多文件共用 class 在同一次映射中使用相同随机 token', () => {
    const scans = [
      {
        relPath: 'common/a.scss',
        absPath: '',
        content: '',
        classes: new Set(['shared', 'only-a']),
      },
      {
        relPath: 'pages/b.scss',
        absPath: '',
        content: '',
        classes: new Set(['shared', 'only-b']),
      },
    ];
    const map = buildGlobalStylesheetClassMap(scans);
    expect(map.get('shared')).toMatch(/^c[a-f0-9]{10}$/);
    expect(map.get('only-a')).toMatch(/^c[a-f0-9]{10}$/);
    expect(map.get('only-b')).toMatch(/^c[a-f0-9]{10}$/);
    expect(map.get('only-a')).not.toBe(map.get('only-b'));
  });
});

describe('runEnhancedStylesheetObfuscation', () => {
  it('扫描 css/scss 并统一重命名，且可与颜色扰动并存', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sheet-'));
    await fs.writeFile(
      path.join(root, 'common.scss'),
      '.shared { color: #111111; }\n.local-a { padding: 1px; }',
      'utf-8',
    );
    await fs.writeFile(
      path.join(root, 'pages.scss'),
      '@import "./common.scss";\n.shared { margin: 0; }\n.local-b { margin: 1px; }',
      'utf-8',
    );

    const config = createDefaultConfig();
    config.seed = 'css-global';
    const logger = new Logger({ verbose: false });
    const result = await runEnhancedStylesheetObfuscation(root, config, logger);

    expect(result.filesScanned).toBe(2);
    expect(result.filesChanged).toBe(2);
    expect(result.classRenameCount).toBeGreaterThanOrEqual(3);

    const common = await fs.readFile(path.join(root, 'common.scss'), 'utf-8');
    const pages = await fs.readFile(path.join(root, 'pages.scss'), 'utf-8');
    expect(common).not.toContain('.shared');
    expect(pages).not.toContain('.shared');
    const sharedRenamed = common.match(/\.(c[a-f0-9]{10})\s*\{/)?.[1];
    expect(sharedRenamed).toBeTruthy();
    expect(pages).toContain(`.${sharedRenamed}`);

    const colorResult = obfuscateColorValuesDetailed(common);
    expect(colorResult.content).toContain('#');
    expect(colorResult.content).not.toBe(common);
  });

  it('uni.css / uni.scss 中 uni- 前缀 class 不参与重命名', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sheet-uni-'));
    await fs.writeFile(path.join(root, 'uni.scss'), '.uni-padding-wrap { padding: 0; }', 'utf-8');
    await fs.ensureDir(path.join(root, 'common'));
    await fs.writeFile(path.join(root, 'common', 'uni.css'), '.uni-title { color: red; }', 'utf-8');

    const config = createDefaultConfig();
    config.seed = 'css-uni';
    const logger = new Logger({ verbose: false });
    const result = await runEnhancedStylesheetObfuscation(root, config, logger);

    expect(result.filesScanned).toBe(2);
    expect(result.classRenameMap.has('uni-padding-wrap')).toBe(false);
    expect(result.classRenameMap.has('uni-title')).toBe(false);
    const css = await fs.readFile(path.join(root, 'common', 'uni.css'), 'utf-8');
    expect(css).toContain('.uni-title');
  });

  it('uxui.scss 全量扫描：uni- 保留且 ux- 统一混淆', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sheet-uxui-'));
    await fs.ensureDir(path.join(root, 'uni_modules', 'unix-ui'));
    await fs.writeFile(
      path.join(root, 'uni_modules', 'unix-ui', 'uxui.scss'),
      [
        'uni-app.uni-app--showtabbar uni-page-body::after { height: 0; }',
        '.uni-picker-view-wrapper { width: 100%; }',
        '.ux-body { padding: 0; }',
      ].join('\n'),
      'utf-8',
    );
    await fs.writeFile(
      path.join(root, 'uxui.scss'),
      [
        '.ux-checkbox-round .uni-checkbox-input { width: 36rpx; }',
        '.uni-input-placeholder { overflow: hidden; }',
      ].join('\n'),
      'utf-8',
    );

    const config = createDefaultConfig();
    config.seed = 'css-uxui';
    const logger = new Logger({ verbose: false });
    const result = await runEnhancedStylesheetObfuscation(root, config, logger);

    expect(result.classRenameMap.has('uni-app--showtabbar')).toBe(false);
    expect(result.classRenameMap.has('uni-picker-view-wrapper')).toBe(false);
    expect(result.classRenameMap.has('uni-checkbox-input')).toBe(false);
    expect(result.classRenameMap.has('uni-input-placeholder')).toBe(false);
    expect(result.classRenameMap.has('ux-body')).toBe(true);
    expect(result.classRenameMap.has('ux-checkbox-round')).toBe(true);

    const unixUi = await fs.readFile(path.join(root, 'uni_modules', 'unix-ui', 'uxui.scss'), 'utf-8');
    const projectUi = await fs.readFile(path.join(root, 'uxui.scss'), 'utf-8');
    expect(unixUi).toContain('uni-app.uni-app--showtabbar');
    expect(unixUi).toContain('.uni-picker-view-wrapper');
    expect(unixUi).not.toContain('.ux-body');
    expect(projectUi).toContain('.uni-checkbox-input');
    expect(projectUi).toContain('.uni-input-placeholder');
    expect(projectUi).not.toContain('.ux-checkbox-round');
  });

  it('vk-uview common.scss 全部 @for 循环混淆展开', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sheet-uview-loop-'));
    await fs.ensureDir(path.join(root, 'uni_modules', 'vk-uview-ui', 'libs', 'css'));
    const source = await fs.readFile(
      path.resolve('../uni-starter-x/uni_modules/vk-uview-ui/libs/css/common.scss'),
      'utf-8',
    );
    await fs.writeFile(path.join(root, 'uni_modules', 'vk-uview-ui', 'libs', 'css', 'common.scss'), source, 'utf-8');

    const config = createDefaultConfig();
    const logger = new Logger({ verbose: false });
    const result = await runEnhancedStylesheetObfuscation(root, config, logger);

    const css = await fs.readFile(
      path.join(root, 'uni_modules', 'vk-uview-ui', 'libs', 'css', 'common.scss'),
      'utf-8',
    );
    expect(result.classRenameMap.has('u-flex-1')).toBe(true);
    expect(result.classRenameMap.has('u-font-28')).toBe(true);
    expect(result.classRenameMap.has('u-p-l-30')).toBe(true);
    expect(css).not.toContain('@for $i');
    expect(css).not.toContain('#{$');
    expect(css).toContain(`.${result.classRenameMap.get('u-flex-1')}`);
    expect(css).toContain(`.${result.classRenameMap.get('u-p-l-30')}`);
    expect(css).not.toContain('.u-flex-1');
  });
});

describe('applyStylesheetClassRenames', () => {
  it('重命名选择器 class', () => {
    const map = new Map([['foo', 'cabcabcabc']]);
    expect(applyStylesheetClassRenames('.foo { }', map)).toBe('.cabcabcabc { }');
  });

  it('不修改 @import 路径中的文件名', () => {
    const map = new Map([['h5', 'c63e83a37b9']]);
    const input = '@import "./libs/css/style.h5.scss";\n.panel { color: red; }';
    const output = applyStylesheetClassRenames(input, map);
    expect(output).toContain('@import "./libs/css/style.h5.scss"');
    expect(output).not.toContain('style.c63e83a37b9.scss');
  });

  it('@extend 引用随 class 定义一起重命名', () => {
    const map = new Map([['safe-area-vars', 'c46904a0ec7']]);
    const input = [
      '.safe-area-vars { color: red; }',
      '.theme-blue {',
      '  @extend .safe-area-vars;',
      '}',
    ].join('\n');
    const output = applyStylesheetClassRenames(input, map);
    expect(output).toContain('.c46904a0ec7 { color: red; }');
    expect(output).toContain('@extend .c46904a0ec7;');
    expect(output).not.toContain('.safe-area-vars');
  });

  it('$theme-list map 裸 token 值同步为混淆 class 名', () => {
    const map = new Map([
      ['safe-area-vars', 'c46904a0ec7'],
      ['theme-ls-user', 'c454a888462'],
      ['theme-blue', 'cb9e65b63ff'],
    ]);
    const input = [
      '.safe-area-vars { --theme-color-white: #fff; }',
      '.theme-ls-user { --theme-type-primary: #46b4b1; }',
      '$theme-list: (',
      '  "theme-blue": theme-blue,',
      '  "theme-ls-user": theme-ls-user',
      ');',
      '@each $theme-name, $theme-class in $theme-list {',
      '  .#{$theme-class} {',
      '    @extend .safe-area-vars;',
      '  }',
      '}',
    ].join('\n');
    const output = applyStylesheetClassRenames(input, map);
    expect(output).toContain('"theme-blue": cb9e65b63ff,');
    expect(output).toContain('"theme-ls-user": c454a888462');
    expect(output).not.toMatch(/"theme-ls-user": theme-ls-user/);
  });

  it('扫描时不会把文件名中的片段当成 class', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sheet-import-'));
    await fs.writeFile(
      path.join(root, 'index.scss'),
      '@import "./libs/css/style.h5.scss";\n.panel { margin: 0; }',
      'utf-8',
    );
    const scans = await scanStylesheetFiles(root);
    expect(scans[0]?.classes.has('h5')).toBe(false);
    expect(scans[0]?.classes.has('panel')).toBe(true);
  });
});
