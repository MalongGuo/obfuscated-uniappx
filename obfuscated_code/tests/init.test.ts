import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { initCommand, ensureProjectInit } from '../src/commands/init.js';
import { ALL_FEATURES_TRUE } from '../src/config/defaults.js';
import { loadConfig } from '../src/config/loader.js';
import {
  obfuscatorConfigLabel,
  resolveObfuscatorConfigPath,
} from '../src/output/obfuscated-config.js';

describe('initCommand', () => {
  it('在 obfuscated/ 下生成 features 全开的 obfuscator.config.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-init-'));
    await initCommand(root);

    const configPath = resolveObfuscatorConfigPath(root);
    expect(await fs.pathExists(configPath)).toBe(true);
    expect(obfuscatorConfigLabel()).toBe('obfuscated/obfuscator.config.json');

    const written = await fs.readJson(configPath);
    expect(written.preset).toBe('heavy');
    for (const [key, value] of Object.entries(ALL_FEATURES_TRUE)) {
      expect(written.features[key]).toBe(value);
    }

    const loaded = await loadConfig(root, {});
    for (const [key, value] of Object.entries(ALL_FEATURES_TRUE)) {
      expect(loaded.features[key as keyof typeof ALL_FEATURES_TRUE]).toBe(value);
    }

    const whitelistPath = path.join(root, 'obfuscated', 'config', 'whitelist.json');
    expect(await fs.pathExists(whitelistPath)).toBe(true);
    const whitelist = await fs.readJson(whitelistPath);
    expect(whitelist.symbols).toEqual([]);
    expect(whitelist.pathPatterns).toEqual([]);
    expect(whitelist.frameworkPrefixes).toBeUndefined();
  });

  it('配置已存在时 warn 并继续，仍会补全 whitelist.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-init-wl-'));
    await initCommand(root);
    const second = await ensureProjectInit(root);
    expect(second.configCreated).toBe(false);

    const whitelistPath = path.join(root, 'obfuscated', 'config', 'whitelist.json');
    expect(await fs.pathExists(whitelistPath)).toBe(true);
  });

  it('混淆输出目录作为项目路径时 init 回退到源项目', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-init-artifact-'));
    const source = path.join(root, 'uni-test');
    const obfuscatedOut = path.join(root, 'uni-test_1749275827000_tok123');
    await fs.ensureDir(source);
    await fs.ensureDir(obfuscatedOut);

    const result = await ensureProjectInit(obfuscatedOut);
    expect(result.initRoot).toBe(source);
    expect(result.configCreated).toBe(true);
    expect(await fs.pathExists(path.join(source, 'obfuscated', 'obfuscator.config.json'))).toBe(true);
  });
});
