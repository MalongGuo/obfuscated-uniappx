import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { runModePreloadPipeline } from '../src/preload/index.js';
import { preloadLogFilename } from '../src/preload/logs.js';
import { loadConfig } from '../src/config/loader.js';
import { Logger } from '../src/logger/index.js';
import { runPreloadPhase } from '../src/pipeline/analyze.js';
import { resolvePreloadMode } from '../src/commands/preload.js';

describe('resolvePreloadMode', () => {
  it('CLI --mode 优先', () => {
    expect(resolvePreloadMode('code')).toBe('code');
  });

  it('未传 CLI mode 时默认 full', () => {
    expect(resolvePreloadMode()).toBe('full');
    expect(resolvePreloadMode(undefined)).toBe('full');
  });
});

describe('preload pipeline', () => {
  it('preload --mode code 写出 code-*.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-preload-'));
    await fs.writeFile(
      path.join(root, 'main.uts'),
      'function goPage() { const url = "https://example.com"; }',
      'utf-8',
    );
    await fs.writeJson(path.join(root, 'pages.json'), { pages: [] });

    const config = await loadConfig(root, { mode: 'code' });
    const logger = new Logger({ verbose: false });

    await runModePreloadPipeline(root, config, logger);

    const configDir = path.join(root, 'obfuscated', 'config');
    for (const task of ['vocab', 'symbols', 'sensitive'] as const) {
      const filePath = path.join(configDir, preloadLogFilename('code', task));
      expect(await fs.pathExists(filePath)).toBe(true);
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      expect(data.timestamp).toBeTruthy();
      expect(data.mode).toBe('code');
      expect(data.task).toBe(task);
    }

    const vocab = JSON.parse(
      await fs.readFile(path.join(configDir, preloadLogFilename('code', 'vocab')), 'utf-8'),
    );
    expect(vocab.functions).toContain('goPage');

    const sensitive = JSON.parse(
      await fs.readFile(path.join(configDir, preloadLogFilename('code', 'sensitive')), 'utf-8'),
    );
    expect(sensitive.count).toBeGreaterThan(0);
  });

  it('preload --mode clone 写出 paths + sensitive，不含 vocab', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-preload-clone-'));
    await fs.writeJson(path.join(root, 'pages.json'), { pages: [], tabBar: { list: [] } });

    const config = await loadConfig(root, { mode: 'clone' });
    const logger = new Logger({ verbose: false });
    const result = await runModePreloadPipeline(root, config, logger);

    const configDir = path.join(root, 'obfuscated', 'config');
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('clone', 'paths')))).toBe(true);
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('clone', 'sensitive')))).toBe(true);
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('clone', 'vocab')))).toBe(false);
    expect(result.vocab).toBeUndefined();
    expect(result.paths).toBeDefined();
  });

  it('preload --mode full 依次执行 clone + code，写出 clone-* 与 code-*', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-preload-full-'));
    await fs.writeFile(path.join(root, 'main.uts'), 'function goPage() {}', 'utf-8');
    await fs.writeJson(path.join(root, 'pages.json'), { pages: [], tabBar: { list: [] } });

    const config = await loadConfig(root, { mode: 'full' });
    const logger = new Logger({ verbose: false });
    const result = await runModePreloadPipeline(root, config, logger);

    const configDir = path.join(root, 'obfuscated', 'config');
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('clone', 'paths')))).toBe(true);
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('clone', 'sensitive')))).toBe(true);
    for (const task of ['vocab', 'symbols', 'sensitive'] as const) {
      expect(await fs.pathExists(path.join(configDir, preloadLogFilename('code', task)))).toBe(true);
    }
    expect(await fs.pathExists(path.join(configDir, preloadLogFilename('full', 'vocab')))).toBe(false);
    expect(result.vocab).toBeDefined();
    expect(result.symbols).toBeDefined();
    expect(result.paths).toBeDefined();
  });
});

describe('run preload phase', () => {
  it('run --mode clone 的 Preload 阶段写出 clone-other-parse.json 等', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-preload-analyze-'));
    await fs.writeFile(path.join(root, 'main.uts'), 'function goPage() {}', 'utf-8');
    await fs.writeJson(path.join(root, 'pages.json'), { pages: [] });

    const config = await loadConfig(root, { mode: 'clone' });
    config.generateLog = true;
    const logger = new Logger({ verbose: false });
    await runPreloadPhase(root, config, logger);

    const configDir = path.join(root, 'obfuscated', 'config');
    expect(await fs.pathExists(path.join(configDir, 'clone-other-parse.json'))).toBe(true);
    expect(await fs.pathExists(path.join(configDir, 'clone-uts-parse.json'))).toBe(true);
    expect(await fs.pathExists(path.join(configDir, 'clone-symbols-collect.json'))).toBe(true);
  });
});
