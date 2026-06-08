import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { parseScript } from '../src/parser/babel.js';
import { buildSymbolTable } from '../src/symbols/table.js';
import { makeSymbolKey } from '../src/symbols/keys.js';
import {
  buildSymbolWhitelistOptions,
  formatWhitelistLoadSummary,
  loadProjectWhitelist,
  mergePathWhitelistPatterns,
  printWhitelistLoadSummary,
} from '../src/whitelist/project-whitelist.js';
import { ensureWhitelistJson } from '../src/whitelist/generator.js';
import { loadPreloadProjectContext } from '../src/whitelist/project-whitelist.js';
import { createDefaultConfig } from '../src/config/defaults.js';

describe('loadProjectWhitelist', () => {
  it('首次生成 whitelist.json 时 symbols 与 pathPatterns 为空', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-gen-'));
    await fs.writeJson(path.join(root, 'pages.json'), {
      pages: [],
      tabBar: { list: [{ pagePath: 'pages/tabBar/API' }] },
    });
    await fs.ensureDir(path.join(root, 'pages', 'tabBar'));

    const created = await ensureWhitelistJson(root);
    expect(created).not.toBeNull();

    const raw = await fs.readFile(path.join(root, 'obfuscated', 'config', 'whitelist.json'), 'utf-8');
    expect(raw.trimStart().startsWith('{')).toBe(true);
    expect(raw.indexOf('"generatedAt"')).toBeLessThan(raw.indexOf('"note"'));

    const data = JSON.parse(raw);
    expect(data.symbols).toEqual([]);
    expect(data.pathPatterns).toEqual([]);
    expect(data.frameworkPrefixes).toBeUndefined();
  });

  it('根目录 legacy whitelist.json 复制时迁移为新格式（空 symbols/pathPatterns）', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-legacy-'));
    await fs.writeJson(path.join(root, 'whitelist.json'), {
      generatedAt: '2026-01-01T00:00:00.000Z',
      symbols: ['onLoad', 'goPage'],
      frameworkPrefixes: ['uni.'],
      pathPatterns: ['pages/tabBar/API'],
      note: '旧版',
    });

    const created = await ensureWhitelistJson(root);
    expect(created).not.toBeNull();

    const data = await fs.readJson(path.join(root, 'obfuscated', 'config', 'whitelist.json'));
    expect(data.symbols).toEqual([]);
    expect(data.pathPatterns).toEqual([]);
    expect(data.frameworkPrefixes).toBeUndefined();
  });

  it('obfuscated/config 内旧格式 whitelist 会被就地迁移', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-migrate-'));
    const outPath = path.join(root, 'obfuscated', 'config', 'whitelist.json');
    await fs.ensureDir(path.dirname(outPath));
    await fs.writeJson(outPath, {
      generatedAt: '2026-01-01T00:00:00.000Z',
      symbols: ['onLoad'],
      frameworkPrefixes: ['uni.'],
      pathPatterns: ['pages/tabBar/API'],
      note: '旧版',
    });

    const migrated = await ensureWhitelistJson(root);
    expect(migrated).not.toBeNull();

    const data = await fs.readJson(outPath);
    expect(data.symbols).toEqual([]);
    expect(data.pathPatterns).toEqual([]);
    expect(data.frameworkPrefixes).toBeUndefined();
  });

  it('loadPreloadProjectContext 不生成 whitelist.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-preload-'));
    await fs.writeJson(path.join(root, 'obfuscator.config.json'), createDefaultConfig());

    const ctx = await loadPreloadProjectContext(root);
    expect(ctx.whitelist).toBeNull();
    expect(await fs.pathExists(path.join(root, 'obfuscated', 'config', 'whitelist.json'))).toBe(false);
  });

  it('从 obfuscated/config/whitelist.json 加载', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-proj-'));
    await ensureWhitelistJson(root);

    const customPath = path.join(root, 'obfuscated', 'config', 'whitelist.json');
    const custom = {
      generatedAt: new Date().toISOString(),
      note: 'test',
      symbols: ['myKeepFn', 'goPage'],
      pathPatterns: ['pages/tabBar'],
    };
    await fs.writeJson(customPath, custom);

    const loaded = await loadProjectWhitelist(root);
    expect(loaded).not.toBeNull();
    expect(loaded!.whitelist.symbols).toContain('goPage');
    expect(loaded!.whitelist.pathPatterns).toContain('pages/tabBar');
  });

  it('clone 输出目录回退到源项目 whitelist', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-wl-parent-'));
    const source = path.join(parent, 'uni-test');
    const cloneOut = path.join(parent, 'uni-test_20260607_120000_testToken');
    await fs.ensureDir(source);
    await fs.ensureDir(cloneOut);

    const customPath = path.join(source, 'obfuscated', 'config', 'whitelist.json');
    await fs.ensureDir(path.dirname(customPath));
    await fs.writeJson(customPath, {
      generatedAt: new Date().toISOString(),
      note: 'source',
      symbols: ['tabHelper'],
      pathPatterns: ['pages/guide'],
    });

    const loaded = await loadProjectWhitelist(cloneOut);
    expect(loaded?.whitelist.symbols).toContain('tabHelper');
  });
});

describe('buildSymbolWhitelistOptions', () => {
  it('合并 sensitiveStrings 与项目 symbols', () => {
    const config = createDefaultConfig();
    const opts = buildSymbolWhitelistOptions(
      {
        generatedAt: '',
        note: '',
        symbols: ['goPage'],
        pathPatterns: [],
      },
      config.sensitiveStrings,
    );
    expect(opts.customWhitelist).toContain('goPage');
    expect(opts.customWhitelist).toContain('apiKey');
  });

  it('白名单符号不可重命名', async () => {
    const ast = parseScript('function goPage() {} function obfuscateMe() {}', 'uts').ast!;
    const table = buildSymbolTable(
      [{ kind: 'module', relativePath: 'pages/a.uts', lang: 'uts', ast }],
      {
        customWhitelist: ['goPage'],
        keepExports: false,
      },
    );
    expect(table.symbols.get(makeSymbolKey('pages/a.uts', 'goPage'))?.renameable).toBe(false);
    expect(table.symbols.get(makeSymbolKey('pages/a.uts', 'obfuscateMe'))?.renameable).toBe(true);
  });
});

describe('mergePathWhitelistPatterns', () => {
  it('合并 pathPatterns 到 config.pathWhitelist', () => {
    const merged = mergePathWhitelistPatterns(['pages', 'common'], {
      generatedAt: '',
      note: '',
      symbols: [],
      pathPatterns: ['pages/tabBar', 'pages'],
    });
    expect(merged).toContain('pages/tabBar');
    expect(merged.filter((p) => p === 'pages')).toHaveLength(1);
  });
});

describe('formatWhitelistLoadSummary', () => {
  it('每个配置文件单独一行', () => {
    const config = createDefaultConfig();
    config.pathWhitelist = ['pages', 'common'];
    config.sensitiveStrings = ['apiKey'];
    const lines = formatWhitelistLoadSummary(config, {
      generatedAt: '',
      note: '',
      symbols: ['goPage'],
      pathPatterns: ['pages/tabBar'],
    });
    expect(lines).toEqual([
      'obfuscator.config.json  sensitiveStrings 1 个, pathWhitelist 2 条',
      'whitelist.json          symbols 1 个, pathPatterns 1 条',
      '路径白名单合并 3 条',
    ]);
  });

  it('项目 pathPatterns 为空时不输出合并行', () => {
    const config = createDefaultConfig();
    config.sensitiveStrings = ['apiKey'];
    const lines = formatWhitelistLoadSummary(config, {
      generatedAt: '',
      note: '',
      symbols: [],
      pathPatterns: [],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('obfuscator.config.json');
    expect(lines[1]).toContain('whitelist.json');
  });
});

describe('printWhitelistLoadSummary', () => {
  it('输出标题与缩进', () => {
    const config = createDefaultConfig();
    const emitted: string[] = [];
    printWhitelistLoadSummary((message) => emitted.push(message), config, null);
    expect(emitted[0]).toBe('  加载配置:');
    expect(emitted[1]).toMatch(/^    obfuscator\.config\.json/);
    expect(emitted[2]).toMatch(/^    whitelist\.json\s+/);
  });
});
