import { describe, expect, it } from 'vitest';
import {
  buildOutputFolderName,
  buildSeedStableOutputFolderName,
  extractTokenFromOutputDir,
  formatOutputTimestamp,
  isObfuscatedOutputDirFormat,
  parseObfuscatedOutputDirName,
  resolveOutputPath,
  resolvePathToken,
  resolveRunOutputPlan,
  shouldUseSeedStableOutputNaming,
} from '../src/output/resolve.js';
import { generateToken } from '../src/path/token.js';
import { createDefaultConfig } from '../src/config/defaults.js';

describe('formatOutputTimestamp', () => {
  it('returns Unix milliseconds', () => {
    const at = new Date(2026, 5, 6, 11, 46, 23);
    expect(formatOutputTimestamp(at)).toBe(String(at.getTime()));
  });
});

describe('buildOutputFolderName', () => {
  it('formats project_unixMs_token', () => {
    const at = new Date(2026, 5, 6, 11, 46, 23);
    expect(buildOutputFolderName('/tmp/uni-starter-x', 'abcToken123', at)).toBe(
      `uni-starter-x_${at.getTime()}_abcToken123`,
    );
  });

  it('seed-stable 时省略 unixMs', () => {
    const at = new Date(2026, 5, 6, 11, 46, 23);
    expect(buildOutputFolderName('/tmp/uni-starter-x', 'abcToken123', at, true)).toBe(
      'uni-starter-x_abcToken123',
    );
  });
});

describe('shouldUseSeedStableOutputNaming', () => {
  it('seed-stable + seed 且无 forceNew 时启用', () => {
    const config = createDefaultConfig();
    config.outputDirNaming = 'seed-stable';
    config.seed = 'layer1';
    expect(shouldUseSeedStableOutputNaming(config)).toBe(true);
  });

  it('无 seed 或自定义 outputDir 时不启用', () => {
    const config = createDefaultConfig();
    config.outputDirNaming = 'seed-stable';
    expect(shouldUseSeedStableOutputNaming(config)).toBe(false);
    config.seed = 'layer1';
    expect(shouldUseSeedStableOutputNaming(config)).toBe(true);
    config.outputDir = 'my-fixed-out';
    expect(shouldUseSeedStableOutputNaming(config)).toBe(false);
  });
});

describe('extractTokenFromOutputDir', () => {
  it('parses token from new and legacy output folder names', () => {
    expect(extractTokenFromOutputDir('uni-test_1749275827000_ieEHURxm5uhQOEcy')).toBe(
      'ieEHURxm5uhQOEcy',
    );
    expect(extractTokenFromOutputDir('uni-test_20260606_150442_ieEHURxm5uhQOEcy')).toBe(
      'ieEHURxm5uhQOEcy',
    );
    expect(extractTokenFromOutputDir('uni-test')).toBe('');
  });
});

describe('resolveRunOutputPlan', () => {
  const at = new Date(2026, 5, 7, 12, 30, 45);

  it('源项目自动生成 {项目}_{unixMs}_{token}', () => {
    const config = createDefaultConfig();
    config.seed = null;
    const plan = resolveRunOutputPlan('/workspace/uni-test', config, at);
    expect(plan.sourceIsObfuscatedOutputDir).toBe(false);
    expect(plan.seedFromSourceDir).toBeNull();
    expect(plan.outputPath).toBe(
      `/workspace/uni-test_${at.getTime()}_${plan.token}`,
    );
    expect(plan.token).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('混淆输出目录作为源时，目标为 {源目录名}_{unixMs}，token 取自源目录名', () => {
    const config = createDefaultConfig();
    config.seed = null;
    const source = '/workspace/uni-test_20260606_150442_ieEHURxm5uhQOEcy';
    const plan = resolveRunOutputPlan(source, config, at);
    expect(plan.sourceIsObfuscatedOutputDir).toBe(true);
    expect(plan.seedFromSourceDir).toBe('ieEHURxm5uhQOEcy');
    expect(plan.token).toBe('ieEHURxm5uhQOEcy');
    expect(plan.tokenAuto).toBe(false);
    expect(plan.outputPath).toBe(
      `/workspace/uni-test_20260606_150442_ieEHURxm5uhQOEcy_${at.getTime()}`,
    );
  });

  it('新格式混淆目录再次 run 时追加 unixMs', () => {
    const config = createDefaultConfig();
    const ts = 1749275827000;
    const source = `/workspace/uni-test_${ts}_ieEHURxm5uhQOEcy`;
    const plan = resolveRunOutputPlan(source, config, at);
    expect(plan.outputPath).toBe(`${source}_${at.getTime()}`);
  });

  it('CLI --seed 优先于源目录 token', () => {
    const config = createDefaultConfig();
    config.seed = 'my-cli-seed';
    const source = '/workspace/uni-test_20260606_150442_oldToken123456';
    const plan = resolveRunOutputPlan(source, config, at);
    expect(plan.token).toBe(generateToken('my-cli-seed', 16));
    expect(plan.tokenAuto).toBe(true);
  });

  it('outputDirNaming=seed-stable 且指定 seed 时目录为 {项目}_{token}', () => {
    const config = createDefaultConfig();
    config.outputDirNaming = 'seed-stable';
    config.seed = 'layer1';
    const plan = resolveRunOutputPlan('/workspace/uni-starter-x', config, at);
    expect(plan.outputPath).toBe(
      `/workspace/${buildSeedStableOutputFolderName('uni-starter-x', generateToken('layer1', 16))}`,
    );
  });

  it('seed-stable 再次混淆时归一化为 {原始项目}_{token}', () => {
    const config = createDefaultConfig();
    config.outputDirNaming = 'seed-stable';
    config.seed = 'layer1';
    const source = `/workspace/uni-starter-x_${at.getTime()}_oldToken1234567890`;
    const plan = resolveRunOutputPlan(source, config, at);
    expect(plan.outputPath).toBe(
      `/workspace/${buildSeedStableOutputFolderName('uni-starter-x', generateToken('layer1', 16))}`,
    );
  });

  it('seed-stable + forceNew 仍使用固定目录', () => {
    const config = createDefaultConfig();
    config.outputDirNaming = 'seed-stable';
    config.seed = 'layer1';
    config.forceNew = true;
    const plan = resolveRunOutputPlan('/workspace/uni-starter-x', config, at);
    expect(plan.outputPath).toBe(
      `/workspace/${buildSeedStableOutputFolderName('uni-starter-x', generateToken('layer1', 16))}`,
    );
  });
});

describe('parseObfuscatedOutputDirName', () => {
  it('识别新格式混淆输出目录名', () => {
    expect(isObfuscatedOutputDirFormat('uni-test_1749275827000_tok')).toBe(true);
    expect(parseObfuscatedOutputDirName('uni-test_1749275827000_tok')).toEqual({
      projectName: 'uni-test',
      timestampMs: '1749275827000',
      token: 'tok',
    });
  });

  it('识别旧格式混淆输出目录名', () => {
    expect(isObfuscatedOutputDirFormat('uni-test_20260606_150442_tok')).toBe(true);
    expect(parseObfuscatedOutputDirName('uni-test_20260606_150442_tok')).toEqual({
      projectName: 'uni-test',
      date: '20260606',
      time: '150442',
      token: 'tok',
    });
  });

  it('识别追加 unixMs 后缀的链式目录', () => {
    expect(extractTokenFromOutputDir('uni-test_20260606_150442_tok_1749280000000')).toBe('tok');
  });
});

describe('resolveOutputPath', () => {
  it('places default output as sibling with full folder name', () => {
    const project = '/workspace/samples/uniappx-minimal';
    const output = resolveOutputPath(project, 'dist-obfuscated', 'tok');
    expect(output).toMatch(/\/samples\/uniappx-minimal_\d{10,13}_tok$/);
  });

  it('uses explicit output dir when specified', () => {
    const project = '/workspace/samples/uniappx-minimal';
    expect(resolveOutputPath(project, 'my-output', 'tok')).toBe('/workspace/samples/my-output');
  });

  it('uses absolute output dir when specified', () => {
    const project = '/workspace/samples/uniappx-minimal';
    expect(resolveOutputPath(project, '/tmp/out', 'tok')).toBe('/tmp/out');
  });
});

describe('resolvePathToken', () => {
  it('generates fixed 16-char token from seed in auto mode', () => {
    const config = { ...createDefaultConfig(), pathPrefix: 'auto', seed: 'uni-test-clone' };
    const a = resolvePathToken(config);
    const b = resolvePathToken(config);
    expect(a.auto).toBe(true);
    expect(a.token).toHaveLength(16);
    expect(a.token).toBe(b.token);
  });

  it('generates random token when seed is absent in auto mode', () => {
    const config = { ...createDefaultConfig(), pathPrefix: 'auto', seed: null };
    const { token, auto } = resolvePathToken(config);
    expect(auto).toBe(true);
    expect(token).toHaveLength(16);
  });

  it('uses explicit pathPrefix when not auto', () => {
    const config = { ...createDefaultConfig(), pathPrefix: 'MyFixedToken1234', seed: 'ignored' };
    const { token, auto } = resolvePathToken(config);
    expect(auto).toBe(false);
    expect(token).toBe('MyFixedToken1234');
  });
});

describe('generateToken', () => {
  it('always returns 16 characters', () => {
    expect(generateToken('uni-test-clone', 16)).toHaveLength(16);
    expect(generateToken(null, 16)).toHaveLength(16);
  });
});
