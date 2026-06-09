import { describe, expect, it } from 'vitest';
import {
  isImmutableConfigFile,
  isRootAnchorDir,
  isRootAnchorFile,
  rootAnchorBasenames,
  topLevelDirsFromExclude,
} from '../src/path/anchors.js';
import {
  isProtectedDirName,
  isProtectedName,
  isProtectedPath,
  isUtsPluginPath,
} from '../src/path/protected-names.js';

describe('topLevelDirsFromExclude', () => {
  it('does not exclude entire uni_modules for nested uni_modules/uni-* pattern', () => {
    const dirs = topLevelDirsFromExclude([
      'uni_modules/uni-*',
      'node_modules/**',
      'unpackage/**',
      'dist/**',
    ]);
    expect(dirs.has('uni_modules')).toBe(false);
    expect(dirs.has('node_modules')).toBe(true);
    expect(dirs.has('unpackage')).toBe(true);
  });
});

describe('isRootAnchorDir', () => {
  const anchors = ['pages', 'static', 'uni_modules', 'components', 'uniCloud-*'];

  it('matches root-level anchor dirs only', () => {
    expect(isRootAnchorDir('pages', 'pages', anchors)).toBe(true);
    expect(isRootAnchorDir('uniCloud-alipay', 'uniCloud-alipay', anchors)).toBe(true);
    expect(isRootAnchorDir('pages/home', 'home', anchors)).toBe(false);
    expect(isRootAnchorDir('service', 'service', anchors)).toBe(false);
  });

  it('supports wildcard prefix patterns', () => {
    expect(isRootAnchorDir('uniCloud-tcb', 'uniCloud-tcb', ['uniCloud-*'])).toBe(true);
    expect(isRootAnchorDir('utils', 'utils', ['uniCloud-*'])).toBe(false);
  });
});

describe('isRootAnchorFile', () => {
  const files = ['main.uts', 'App.uvue', 'pages.json', 'package.json'];

  it('matches root-level files only', () => {
    expect(isRootAnchorFile('main.uts', files)).toBe(true);
    expect(isRootAnchorFile('pages.json', files)).toBe(true);
    expect(isRootAnchorFile('package.json', files)).toBe(true);
    expect(isRootAnchorFile('pages/home/home.uvue', files)).toBe(false);
    expect(isRootAnchorFile('uni_modules/foo/package.json', files)).toBe(false);
  });

  it('extracts protected basenames for content replacement', () => {
    expect(rootAnchorBasenames(['main.uts', 'App.uvue', 'pages.json', 'package.json'])).toEqual(
      new Set(['main', 'App', 'pages']),
    );
  });
});

describe('isImmutableConfigFile', () => {
  it('protects package.json at any path', () => {
    expect(isImmutableConfigFile('package.json')).toBe(true);
    expect(isImmutableConfigFile('uni_modules/uni-icons/package.json')).toBe(true);
    expect(isImmutableConfigFile('pages/index/index.uvue')).toBe(false);
  });
});

describe('isProtectedDirName', () => {
  it('protects uni-*, uts-*, and xsd-request directory names', () => {
    expect(isProtectedDirName('uni-id')).toBe(true);
    expect(isProtectedDirName('uni-icons')).toBe(true);
    expect(isProtectedDirName('uts-runtime')).toBe(true);
    expect(isProtectedDirName('xsd-request')).toBe(true);
    expect(isProtectedDirName('bottom-wrap')).toBe(false);
    expect(isProtectedDirName('my-plugin')).toBe(false);
  });
});

describe('isProtectedName', () => {
  it('aliases isProtectedDirName', () => {
    expect(isProtectedName('uni-id')).toBe(true);
    expect(isProtectedName('uts-runtime')).toBe(true);
  });
});

describe('isProtectedPath', () => {
  it('protects uni_modules/uni-*, uts-*, and xsd-request trees', () => {
    expect(isProtectedPath('uni_modules/uni-icons')).toBe(true);
    expect(isProtectedPath('uni_modules/uni-icons/components/icon.uvue')).toBe(true);
    expect(isProtectedPath('uni_modules/uts-openSchema')).toBe(true);
    expect(isProtectedPath('uni_modules/uts-openSchema/index.uts')).toBe(true);
    expect(isProtectedPath('uni_modules/xsd-request')).toBe(true);
    expect(isProtectedPath('uni_modules/xsd-request/utssdk/index.uts')).toBe(true);
  });

  it('does not protect other uni_modules or business paths', () => {
    expect(isProtectedPath('uni_modules')).toBe(false);
    expect(isProtectedPath('uni_modules/my-plugin')).toBe(false);
    expect(isProtectedPath('uni_modules/my-plugin/widget')).toBe(false);
    expect(isProtectedPath('pages/component/uni-badge')).toBe(false);
    expect(isProtectedPath('components/uni-card')).toBe(false);
    expect(isProtectedPath('pages/component/view')).toBe(false);
  });
});

describe('isUtsPluginPath', () => {
  it('matches uni_modules/uts-* and xsd-request plugin trees', () => {
    expect(isUtsPluginPath('uni_modules/uts-openSchema')).toBe(true);
    expect(isUtsPluginPath('uni_modules/uts-openSchema/utssdk/interface.uts')).toBe(true);
    expect(isUtsPluginPath('uni_modules/uts-openSystemSettings/utssdk/app-ios/index.uts')).toBe(true);
    expect(isUtsPluginPath('uni_modules/xsd-request/utssdk/interface.uts')).toBe(true);
    expect(isUtsPluginPath('uni_modules/uni-icons/components/icon.uvue')).toBe(false);
    expect(isUtsPluginPath('components/demo.uvue')).toBe(false);
  });
});
