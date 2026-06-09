import type { FeatureFlags, ObfuscatorConfig } from '../types/config.js';
import { DEFAULT_ROOT_ANCHOR_DIRS, DEFAULT_ROOT_ANCHOR_FILES } from '../path/anchors.js';

/** 全部 features 开关为 true（GUI 全选态） */
export const ALL_FEATURES_TRUE: FeatureFlags = {
  simulateManual: true,
  resourceHash: true,
  classFilePrefix: true,
  stripComments: true,
  renameFilenames: true,
  renameImageNames: true,
  encryptAllStrings: true,
  insertJunkFuncProp: true,
  renameFuncPropVarEnum: true,
  enhancedUiJunkCode: true,
  colorNudge: false,
  shuffleFuncOrder: true,
  disruptExecOrder: true,
  controlFlowFlatten: false,
  useNewJunkCode: true,
  ciphertextStrings: true,
  renameProtocol: true,
};

/** 默认配置：全部功能可开启 */
export const DEFAULT_FEATURES: FeatureFlags = { ...ALL_FEATURES_TRUE };

export const PRESET_FEATURES: Record<'light' | 'medium' | 'heavy', Partial<FeatureFlags>> = {
  light: {
    simulateManual: true,
    stripComments: true,
    renameFuncPropVarEnum: true,
    classFilePrefix: false,
    resourceHash: false,
    renameFilenames: false,
    renameImageNames: true,
    encryptAllStrings: false,
    insertJunkFuncProp: false,
    enhancedUiJunkCode: false,
    shuffleFuncOrder: false,
    disruptExecOrder: false,
    controlFlowFlatten: false,
    useNewJunkCode: false,
    ciphertextStrings: false,
    renameProtocol: false,
  },
  medium: {
    ...ALL_FEATURES_TRUE,
    useNewJunkCode: false,
    insertJunkFuncProp: false,
    enhancedUiJunkCode: false,
  },
  heavy: { ...ALL_FEATURES_TRUE },
};

export function createDefaultConfig(): ObfuscatorConfig {
  return {
    mode: 'full',
    scope: 'precise',
    preset: 'medium',
    platform: 'app-android',
    namingStyle: 'human',
    namePrefix: '',
    pathPrefix: 'auto',
    stableMode: false,
    forceNew: false,
    seed: null,
    outputDirNaming: 'timestamp',
    outputDir: 'dist-obfuscated',
    generateMap: true,
    generateLog: true,
    pathConflictCheck: true,
    sensitiveStrings: ['apiKey', 'secret', 'token', 'password'],
    keepExports: true,
    include: ['pages/**', 'components/**', 'common/**', 'store/**', 'service/**', 'uni_modules/**', '*.uts', '*.uvue', '*.vue', '*.js', '*.ts'],
    exclude: [
      'uni_modules/uni-*',
      'uni_modules/uts-*',
      'uni_modules/xsd-request/**',
      'node_modules/**',
      'unpackage/**',
      'dist/**',
      'obfuscated/**',
    ],
    rootAnchorDirs: [...DEFAULT_ROOT_ANCHOR_DIRS],
    rootAnchorFiles: [...DEFAULT_ROOT_ANCHOR_FILES],
    pathWhitelist: [
      'pages',
      'common',
      'static',
      'components',
      'uni_modules',
      'uni_modules/uni-*',
      'uni_modules/uts-*',
      'uni_modules/xsd-request',
      'uni_modules/vk-uview-ui',
      'pages/guide',
      'pages/category',
      'pages/cart',
      'pages/find',
      'common/config/**',
    ],
    features: { ...DEFAULT_FEATURES },
    stringEncrypt: {
      autoEncryptHttp: true,
      skipCaseLabels: true,
      skipAnnotations: true,
      skipTemplateStrings: false,
      whitelist: ['uni.', 'plus.', 'UTS'],
    },
    commentStrip: {
      enabled: true,
      safeMode: true,
    },
  };
}

/** init 命令专用：features 全开 + heavy 预设 */
export function createInitConfig(): ObfuscatorConfig {
  return {
    ...createDefaultConfig(),
    preset: 'heavy',
    features: { ...ALL_FEATURES_TRUE },
  };
}
