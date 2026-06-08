export type ObfuscationMode = 'clone' | 'code' | 'full' | 'preload';
export type ObfuscationScope = 'precise' | 'full';
export type ObfuscationPreset = 'light' | 'medium' | 'heavy';
export type NamingStyle = 'human' | 'hex';
export type Platform = 'app-android' | 'app-ios' | 'app-harmony' | 'mp-weixin' | 'web';
/** 输出目录命名：timestamp 含 unixMs；seed-stable 有 seed 时用 {项目}_{token} */
export type OutputDirNaming = 'timestamp' | 'seed-stable';

export interface FeatureFlags {
  simulateManual: boolean;
  resourceHash: boolean;
  classFilePrefix: boolean;
  stripComments: boolean;
  renameFilenames: boolean;
  renameImageNames: boolean;
  encryptAllStrings: boolean;
  insertJunkFuncProp: boolean;
  renameFuncPropVarEnum: boolean;
  enhancedUiJunkCode: boolean;
  /** CSS #RRGGBB 颜色微扰，默认关闭 */
  colorNudge: boolean;
  shuffleFuncOrder: boolean;
  disruptExecOrder: boolean;
  controlFlowFlatten: boolean;
  useNewJunkCode: boolean;
  ciphertextStrings: boolean;
  renameProtocol: boolean;
}

export interface StringEncryptConfig {
  autoEncryptHttp: boolean;
  skipCaseLabels: boolean;
  skipAnnotations: boolean;
  skipTemplateStrings: boolean;
  whitelist: string[];
}

export interface CommentStripConfig {
  enabled: boolean;
  safeMode: boolean;
}

export interface ObfuscatorConfig {
  mode: ObfuscationMode;
  scope: ObfuscationScope;
  preset: ObfuscationPreset;
  platform: Platform;
  namingStyle: NamingStyle;
  namePrefix: string;
  pathPrefix: string | 'auto';
  stableMode: boolean;
  forceNew: boolean;
  seed: string | null;
  /** 默认 timestamp；seed-stable 且指定 seed 时输出 {项目}_{token} */
  outputDirNaming: OutputDirNaming;
  outputDir: string;
  generateMap: boolean;
  /** 是否生成分阶段诊断日志到 obfuscated/config/，默认开启 */
  generateLog: boolean;
  pathConflictCheck: boolean;
  sensitiveStrings: string[];
  keepExports: boolean;
  include: string[];
  exclude: string[];
  /** 项目根级不可改名的目录（UniApp 约定 + 官方示例结构） */
  rootAnchorDirs: string[];
  /** 项目根级不可改名的文件（入口与配置文件） */
  rootAnchorFiles: string[];
  pathWhitelist: string[];
  features: FeatureFlags;
  stringEncrypt: StringEncryptConfig;
  commentStrip: CommentStripConfig;
}

export interface CliOptions {
  project: string;
  config?: string;
  preset?: ObfuscationPreset;
  mode?: ObfuscationMode;
  scope?: ObfuscationScope;
  platform?: Platform;
  output?: string;
  seed?: string;
  noSeed?: boolean;
  outputDirNaming?: OutputDirNaming;
  forceNew?: boolean;
  stable?: boolean;
  verbose?: boolean;
  debug?: boolean;
  noMap?: boolean;
  noLog?: boolean;
}
