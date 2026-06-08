import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { normalizeCliSeed, applyCliSeedOverride } from '../src/config/seed-cli.js';
import { loadConfig } from '../src/config/loader.js';

describe('normalizeCliSeed', () => {
  it('空串、null、none 清除 seed', () => {
    expect(normalizeCliSeed('')).toBeNull();
    expect(normalizeCliSeed('  ')).toBeNull();
    expect(normalizeCliSeed('null')).toBeNull();
    expect(normalizeCliSeed('NULL')).toBeNull();
    expect(normalizeCliSeed('none')).toBeNull();
    expect(normalizeCliSeed('NONE')).toBeNull();
  });

  it('非空字符串保留', () => {
    expect(normalizeCliSeed('layer1')).toBe('layer1');
    expect(normalizeCliSeed('  layer1  ')).toBe('layer1');
  });
});

describe('applyCliSeedOverride', () => {
  it('--no-seed 优先于配置文件 seed', () => {
    expect(applyCliSeedOverride('layer1', { noSeed: true })).toBeNull();
  });

  it('--seed 覆盖配置文件', () => {
    expect(applyCliSeedOverride('layer1', { seed: 'other' })).toBe('other');
    expect(applyCliSeedOverride('layer1', { seed: '' })).toBeNull();
    expect(applyCliSeedOverride('layer1', { seed: 'none' })).toBeNull();
    expect(applyCliSeedOverride('layer1', { seed: true })).toBeNull();
  });

  it('未传 CLI seed 时保留配置', () => {
    expect(applyCliSeedOverride('layer1', {})).toBe('layer1');
    expect(applyCliSeedOverride(null, {})).toBeNull();
  });
});

describe('loadConfig seed CLI override', () => {
  it('--seed "" 清除 layer1.json 中的 seed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-seed-'));
    const configDir = path.join(root, 'obfuscated');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, 'obfuscator.config.json'), {
      seed: 'layer1',
      outputDirNaming: 'seed-stable',
    });

    const config = await loadConfig(root, { seed: '' });
    expect(config.seed).toBeNull();
  });

  it('--no-seed 清除配置文件 seed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-seed-'));
    const configDir = path.join(root, 'obfuscated');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, 'obfuscator.config.json'), {
      seed: 'layer1',
    });

    const config = await loadConfig(root, { noSeed: true });
    expect(config.seed).toBeNull();
  });
});
