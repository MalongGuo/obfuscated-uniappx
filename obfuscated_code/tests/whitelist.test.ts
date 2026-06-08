import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { matchesIncludeScope } from '../src/path/whitelist.js';
import { getPackageConfigPath, getPackageRoot } from '../src/config/package-paths.js';
import {
  getApiLiteralKeys,
  getLifecycleHooks,
  loadSymbolWhitelistConfig,
  resetWhitelistConfigCache,
} from '../src/whitelist/load-config.js';
import { shouldKeepSymbol } from '../src/whitelist/builtin.js';
import { API_LITERAL_KEYS } from '../src/transforms/rename-map.js';

const UNI_TEST_INCLUDE = [
  'pages/**',
  'components/**',
  'common/**',
  'store/**',
  'static/**',
  'uni_modules/**',
  'hybrid/**',
  'wxcomponents/**',
  'nativeResources/**',
  'uniCloud-aliyun/**',
  'workers/**',
];

describe('package config directory', () => {
  it('config 文件位于 obfuscated_code/config/', () => {
    expect(getPackageRoot()).toMatch(/obfuscated_code$/);
    expect(fs.existsSync(getPackageConfigPath('whitelist-symbols-uniappx.json'))).toBe(true);
    expect(fs.existsSync(getPackageConfigPath('api-literal-keys.json'))).toBe(true);
  });
});

describe('symbol whitelist config', () => {
  it('加载 lifecycle 与 reserved 词表', () => {
    resetWhitelistConfigCache();
    const config = loadSymbolWhitelistConfig();
    expect(config.lifecycleHooks).toContain('onLoad');
    expect(config.reservedWords).toContain('function');
    expect(config.frameworkPrefixes).toContain('uni.');
  });

  it('shouldKeepSymbol 识别生命周期与框架 API', () => {
    expect(shouldKeepSymbol('onLoad')).toBe(true);
    expect(shouldKeepSymbol('uni.request')).toBe(true);
    expect(shouldKeepSymbol('myBusinessFn')).toBe(false);
  });

  it('shouldKeepSymbol 保留全局内置对象 Math / uni', () => {
    expect(shouldKeepSymbol('Math')).toBe(true);
    expect(shouldKeepSymbol('Array')).toBe(true);
    expect(shouldKeepSymbol('uni')).toBe(true);
  });

  it('api literal keys 从 config 加载', () => {
    resetWhitelistConfigCache();
    expect(getApiLiteralKeys().has('url')).toBe(true);
    expect(API_LITERAL_KEYS.has('success')).toBe(true);
    expect(getLifecycleHooks().has('onShow')).toBe(true);
  });
});

describe('matchesIncludeScope', () => {
  it('includes business dirs and nested paths', () => {
    expect(matchesIncludeScope('pages', UNI_TEST_INCLUDE)).toBe(true);
    expect(matchesIncludeScope('pages/API', UNI_TEST_INCLUDE)).toBe(true);
    expect(matchesIncludeScope('workers/helloWorkerTask.uts', UNI_TEST_INCLUDE)).toBe(true);
  });

  it('excludes non-business top-level dirs', () => {
    expect(matchesIncludeScope('code-review', UNI_TEST_INCLUDE)).toBe(false);
    expect(matchesIncludeScope('code-review/__tests__', UNI_TEST_INCLUDE)).toBe(false);
    expect(matchesIncludeScope('git-hooks', UNI_TEST_INCLUDE)).toBe(false);
    expect(matchesIncludeScope('harmony-configs', UNI_TEST_INCLUDE)).toBe(false);
    expect(matchesIncludeScope('package', UNI_TEST_INCLUDE)).toBe(false);
    expect(matchesIncludeScope('windows', UNI_TEST_INCLUDE)).toBe(false);
  });
});
