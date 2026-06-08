import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { buildCopyIgnoreSet } from '../src/path/anchors.js';
import { copyProjectToOutput } from '../src/code/copy.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import {
  isPreloadRuleFilename,
  listPreloadRuleFilenames,
} from '../src/output/sync-preload-rules.js';
import {
  getFrameworkCopyExcludeTopLevelDirs,
  getFrameworkPathPatterns,
  loadFrameworkWhitelistConfig,
  resetFrameworkWhitelistConfigCache,
} from '../src/whitelist/load-framework.js';
import { getPackageConfigPath } from '../src/config/package-paths.js';
import { mergePathWhitelistPatterns } from '../src/whitelist/project-whitelist.js';

describe('whitelist-framework.json', () => {
  it('路径白名单包含 obfuscated，复制时不排除 obfuscated', () => {
    resetFrameworkWhitelistConfigCache();
    expect(fs.existsSync(getPackageConfigPath('whitelist-framework.json'))).toBe(true);
    const config = loadFrameworkWhitelistConfig();
    expect(config.copyExcludeTopLevelDirs).not.toContain('obfuscated');
    expect(config.pathPatterns.some((p) => p.startsWith('obfuscated'))).toBe(true);
  });

  it('buildCopyIgnoreSet 保留 obfuscated（扫描 exclude 不影响复制）', () => {
    resetFrameworkWhitelistConfigCache();
    const config = createDefaultConfig();
    const dirs = buildCopyIgnoreSet(config.exclude, getFrameworkCopyExcludeTopLevelDirs());
    expect(dirs.has('obfuscated')).toBe(false);
    expect(dirs.has('node_modules')).toBe(true);
  });

  it('路径白名单合并 framework pathPatterns', () => {
    resetFrameworkWhitelistConfigCache();
    const merged = mergePathWhitelistPatterns(['pages'], null, getFrameworkPathPatterns());
    expect(merged).toContain('obfuscated/**');
  });
});

describe('copyProjectToOutput', () => {
  it('复制项目时包含 obfuscated/ 目录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-copy-obf-'));
    await fs.writeFile(path.join(root, 'pages.json'), '{}');
    await fs.ensureDir(path.join(root, 'obfuscated', 'config'));
    await fs.writeJson(path.join(root, 'obfuscated', 'obfuscator.config.json'), { mode: 'full' });
    await fs.writeJson(path.join(root, 'obfuscated', 'config', 'whitelist.json'), { symbols: [] });

    const out = path.join(root, 'uni-test_out');
    const config = createDefaultConfig();
    await copyProjectToOutput(root, config, out);

    expect(await fs.pathExists(path.join(out, 'obfuscated', 'obfuscator.config.json'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'obfuscated', 'config', 'whitelist.json'))).toBe(true);
  });
});

describe('copyObfuscatedConfigToOutput', () => {
  it('run 前将 obfuscator.config.json 与 obfuscated/config/ 全量同步到输出', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sync-config-'));
    const out = path.join(root, 'uni-test_out');
    await fs.ensureDir(out);

    await fs.ensureDir(path.join(root, 'obfuscated', 'config'));
    await fs.writeJson(path.join(root, 'obfuscated', 'obfuscator.config.json'), { mode: 'full' });
    await fs.writeJson(path.join(root, 'obfuscated', 'config', 'whitelist.json'), {
      symbols: [],
      pathPatterns: [],
    });
    await fs.writeJson(path.join(root, 'obfuscated', 'config', 'code-vocab.json'), { mode: 'code' });

    const { copyObfuscatedConfigToOutput } = await import('../src/output/sync-preload-rules.js');
    const copied = await copyObfuscatedConfigToOutput(root, out);
    expect(copied).toEqual(['config/code-vocab.json', 'config/whitelist.json', 'obfuscator.config.json']);
    expect(await fs.pathExists(path.join(out, 'obfuscated', 'obfuscator.config.json'))).toBe(true);
  });

  it('混淆输出目录作为源时，从同级原始项目同步 obfuscated 配置', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-sync-config-src-'));
    const source = path.join(root, 'uni-test');
    const obfuscatedOut = path.join(root, 'uni-test_1749275827000_tok123');
    const target = path.join(root, 'uni-test_out');
    await fs.ensureDir(source);
    await fs.ensureDir(obfuscatedOut);
    await fs.ensureDir(target);
    await fs.ensureDir(path.join(source, 'obfuscated', 'config'));
    await fs.writeJson(path.join(source, 'obfuscated', 'obfuscator.config.json'), { mode: 'code' });
    await fs.writeJson(path.join(source, 'obfuscated', 'config', 'whitelist.json'), { symbols: ['Foo'] });

    const { copyObfuscatedConfigToOutput } = await import('../src/output/sync-preload-rules.js');
    const copied = await copyObfuscatedConfigToOutput(obfuscatedOut, target);
    expect(copied).toEqual(['config/whitelist.json', 'obfuscator.config.json']);
    const data = await fs.readJson(path.join(target, 'obfuscated', 'config', 'whitelist.json'));
    expect(data.symbols).toEqual(['Foo']);
  });
});

describe('isPreloadRuleFilename', () => {
  it('识别 preload 规则文件名', () => {
    expect(isPreloadRuleFilename('whitelist.json')).toBe(true);
    expect(isPreloadRuleFilename('code-vocab.json')).toBe(true);
    expect(isPreloadRuleFilename('code-uts-parse.json')).toBe(false);
    expect(listPreloadRuleFilenames('clone')).toContain('clone-paths.json');
    expect(listPreloadRuleFilenames('full')).toContain('clone-paths.json');
    expect(listPreloadRuleFilenames('full')).toContain('code-vocab.json');
    expect(listPreloadRuleFilenames('full')).not.toContain('full-vocab.json');
  });
});
