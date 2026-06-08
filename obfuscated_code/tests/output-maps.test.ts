import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  writeResourcesMapArtifact,
} from '../src/path/artifacts.js';
import { writeSymbolsMapArtifact } from '../src/code/artifacts.js';
import { ARTIFACT_JSON, modeArtifactName } from '../src/output/artifact-names.js';
import { resolveArtifactFile } from '../src/output/artifact-resolve.js';
import { analyzeCoverage } from '../src/code/coverage.js';
import { checkRouteConsistency } from '../src/path/route-check.js';
import { checkPresetWarnings } from '../src/config/preset-warnings.js';
import { createDefaultConfig } from '../src/config/defaults.js';

const MODE = 'full' as const;

describe('writeSymbolsMapArtifact', () => {
  it('写出 mode 前缀的 functions / properties / symbols JSON', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-maps-'));

    await writeSymbolsMapArtifact(root, MODE, {
      functions: { goPage: 'AbCdEf' },
      properties: { menuList: 'XyZ123' },
      classes: {},
      locals: {},
      totalMappings: 2,
      renamedFileCount: 3,
    });

    const configDir = path.join(root, 'obfuscated', 'config');
    const fnPath = path.join(configDir, modeArtifactName(MODE, ARTIFACT_JSON.mapFunctions));
    const propPath = path.join(configDir, modeArtifactName(MODE, ARTIFACT_JSON.mapProperties));
    const allPath = path.join(configDir, modeArtifactName(MODE, ARTIFACT_JSON.mapSymbols));

    expect(await fs.pathExists(fnPath)).toBe(true);
    expect(await fs.pathExists(propPath)).toBe(true);
    expect(await fs.pathExists(allPath)).toBe(true);

    const fnData = await fs.readJson(fnPath);
    expect(fnData.mappings.goPage).toBe('AbCdEf');
  });
});

describe('writeResourcesMapArtifact', () => {
  it('从路径映射提取 static 资源', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-res-'));

    await writeResourcesMapArtifact(root, 'clone', {
      mappings: [
        { from: 'static/logo.png', to: 'static/eYjC8DPlogo.png' },
        { from: 'pages/index.uvue', to: 'pages/x/index.uvue' },
      ],
    });

    const resPath = path.join(root, 'obfuscated', 'config', modeArtifactName('clone', ARTIFACT_JSON.mapResources));
    expect(await fs.pathExists(resPath)).toBe(true);
    const data = await fs.readJson(resPath);
    expect(data.mappings['static/logo.png']).toBe('static/eYjC8DPlogo.png');
  });
});

describe('resolveArtifactFile mode 前缀', () => {
  it('优先解析 mode 前缀文件，回退旧文件名', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-resolve-'));
    const configDir = path.join(root, 'obfuscated', 'config');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, modeArtifactName('code', ARTIFACT_JSON.mapFunctions)), {
      count: 1,
      mappings: { fn: 'x' },
    });

    const found = await resolveArtifactFile(root, ARTIFACT_JSON.mapFunctions, 'code');
    expect(found).toContain('code-obfuscation-map-functions.json');
  });
});

describe('analyzeCoverage 兼容拆分映射', () => {
  it('从 mode 前缀 functions/properties JSON 读取计数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-cov-'));
    const configDir = path.join(root, 'obfuscated', 'config');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, modeArtifactName('code', ARTIFACT_JSON.mapFunctions)), {
      count: 2,
      mappings: { a: 'b', c: 'd' },
    });
    await fs.writeJson(path.join(configDir, modeArtifactName('code', ARTIFACT_JSON.mapProperties)), {
      count: 1,
      mappings: { foo: 'bar' },
    });

    const report = await analyzeCoverage(root, [], 'code');
    expect(report.functions).toBe(2);
    expect(report.properties).toBe(1);
    expect(report.symbolMappings).toBe(3);
  });
});

describe('check helpers', () => {
  it('checkRouteConsistency 检测缺失页面', () => {
    const root = path.join(os.tmpdir(), 'nonexistent-check-root');
    const raw = JSON.stringify({
      pages: [{ path: 'pages/missing/page' }],
    });
    const issues = checkRouteConsistency(root, raw);
    expect(issues.some((i) => i.type === 'missing-file')).toBe(true);
  });

  it('checkPresetWarnings iOS light 告警', () => {
    const config = createDefaultConfig();
    config.platform = 'app-ios';
    config.preset = 'light';
    config.features.encryptAllStrings = true;
    const warnings = checkPresetWarnings(config);
    expect(warnings.some((w) => w.message.includes('字符串加密'))).toBe(true);
  });
});
