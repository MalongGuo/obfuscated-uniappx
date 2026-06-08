import path from 'node:path';
import type { ObfuscatorConfig } from '../types/config.js';
import { generateToken } from '../path/token.js';

/** seed-stable 且指定 seed、且为默认 outputDir 时，输出 {项目}_{token} */
export function shouldUseSeedStableOutputNaming(config: ObfuscatorConfig): boolean {
  if (config.outputDir && config.outputDir !== 'dist-obfuscated') return false;
  if (config.outputDirNaming !== 'seed-stable') return false;
  if (!config.seed) return false;
  return true;
}

export function resolvePathToken(config: ObfuscatorConfig): { token: string; auto: boolean } {
  const auto = config.pathPrefix === 'auto' || !config.pathPrefix;
  return {
    token: auto ? generateToken(config.seed, 16) : config.pathPrefix,
    auto,
  };
}

/** 旧格式：{项目名}_{YYYYMMDD}_{HHmmss}_{token} */
export const LEGACY_OBFUSCATED_OUTPUT_DIR_PATTERN = /^(.+)_(\d{8})_(\d{6})_([^/]+)$/;

/** 新格式：{项目名}_{unixMs}_{token} */
export const OBFUSCATED_OUTPUT_DIR_PATTERN = /^(.+)_(\d{10,13})_([^/]+)$/;

/** 再次混淆时追加的 Unix 毫秒后缀：{已有目录名}_{unixMs} */
const CHAINED_UNIX_SUFFIX_PATTERN = /^(.+)_(\d{10,13})$/;

export interface ParsedObfuscatedOutputDir {
  projectName: string;
  token: string;
  /** Unix 毫秒时间戳（新格式） */
  timestampMs?: string;
  /** 兼容旧格式 */
  date?: string;
  time?: string;
}

function tryParseObfuscatedCore(basename: string): ParsedObfuscatedOutputDir | null {
  const legacy = basename.match(LEGACY_OBFUSCATED_OUTPUT_DIR_PATTERN);
  if (legacy) {
    return {
      projectName: legacy[1]!,
      date: legacy[2],
      time: legacy[3],
      token: legacy[4]!,
    };
  }

  const modern = basename.match(OBFUSCATED_OUTPUT_DIR_PATTERN);
  if (modern) {
    return {
      projectName: modern[1]!,
      timestampMs: modern[2],
      token: modern[3]!,
    };
  }

  return null;
}

function stripChainedUnixSuffixes(basename: string): string {
  let name = basename;
  while (true) {
    const chained = name.match(CHAINED_UNIX_SUFFIX_PATTERN);
    if (!chained) return name;
    name = chained[1]!;
  }
}

export function parseObfuscatedOutputDirName(basename: string): ParsedObfuscatedOutputDir | null {
  return tryParseObfuscatedCore(stripChainedUnixSuffixes(basename));
}

export function isObfuscatedOutputDirFormat(basename: string): boolean {
  return parseObfuscatedOutputDirName(basename) !== null;
}

/** 从混淆输出目录名解析 token */
export function extractTokenFromOutputDir(dirBasename: string): string {
  return parseObfuscatedOutputDirName(dirBasename)?.token ?? '';
}

/** Unix 毫秒时间戳，用于输出目录名 */
export function formatOutputTimestamp(at = new Date()): string {
  return String(at.getTime());
}

/** 输出目录名：项目名称_{unixMs}_token 或 seed-stable 时 项目名称_token */
export function buildOutputFolderName(
  projectPath: string,
  token: string,
  at = new Date(),
  seedStable = false,
): string {
  const projectName = path.basename(path.resolve(projectPath));
  if (seedStable) {
    return `${projectName}_${token}`;
  }
  return `${projectName}_${formatOutputTimestamp(at)}_${token}`;
}

/** seed-stable 链式混淆时归一化为原始项目名 + token */
export function buildSeedStableOutputFolderName(projectName: string, token: string): string {
  return `${projectName}_${token}`;
}

export interface RunOutputPlan {
  outputPath: string;
  token: string;
  tokenAuto: boolean;
  /** 源目录符合混淆输出命名时，从文件名解析的 token（作 seed） */
  seedFromSourceDir: string | null;
  sourceIsObfuscatedOutputDir: boolean;
}

function resolveRunToken(
  config: ObfuscatorConfig,
  seedFromSourceDir: string | null,
): { token: string; tokenAuto: boolean } {
  const autoPrefix = config.pathPrefix === 'auto' || !config.pathPrefix;
  if (!autoPrefix) {
    return { token: config.pathPrefix, tokenAuto: false };
  }
  if (config.seed) {
    return { token: generateToken(config.seed, 16), tokenAuto: true };
  }
  if (seedFromSourceDir) {
    return { token: seedFromSourceDir, tokenAuto: false };
  }
  return { token: generateToken(null, 16), tokenAuto: true };
}

/**
 * run 输出目录规划：
 * - 源目录非混淆输出格式 → 自动生成 {项目}_{unixMs}_{token}
 * - 源目录符合混淆输出格式 → {源目录名}_{unixMs}，token/seed 取自源目录名
 */
export function resolveRunOutputPlan(
  projectPath: string,
  config: ObfuscatorConfig,
  at = new Date(),
): RunOutputPlan {
  const resolvedProject = path.resolve(projectPath);
  const basename = path.basename(resolvedProject);
  const parentDir = path.dirname(resolvedProject);

  if (config.outputDir && config.outputDir !== 'dist-obfuscated') {
    const { token, auto } = resolvePathToken(config);
    return {
      outputPath: resolveOutputPath(resolvedProject, config.outputDir, token, at),
      token,
      tokenAuto: auto,
      seedFromSourceDir: null,
      sourceIsObfuscatedOutputDir: false,
    };
  }

  const parsed = parseObfuscatedOutputDirName(basename);
  if (parsed) {
    const { token, tokenAuto } = resolveRunToken(config, parsed.token);
    const seedStable = shouldUseSeedStableOutputNaming(config);
    if (seedStable) {
      return {
        outputPath: path.resolve(parentDir, buildSeedStableOutputFolderName(parsed.projectName, token)),
        token,
        tokenAuto,
        seedFromSourceDir: parsed.token,
        sourceIsObfuscatedOutputDir: true,
      };
    }
    return {
      outputPath: path.resolve(parentDir, `${basename}_${formatOutputTimestamp(at)}`),
      token,
      tokenAuto,
      seedFromSourceDir: parsed.token,
      sourceIsObfuscatedOutputDir: true,
    };
  }

  const seedStable = shouldUseSeedStableOutputNaming(config);
  const { token, auto } = resolvePathToken(config);
  return {
    outputPath: resolveOutputPath(resolvedProject, config.outputDir, token, at, seedStable),
    token,
    tokenAuto: auto,
    seedFromSourceDir: null,
    sourceIsObfuscatedOutputDir: false,
  };
}

/**
 * 输出目录与项目同级。
 * 默认：{项目名称}_{unixMs}_{token}
 * --output 指定非默认名时：与项目同级的指定目录
 */
export function resolveOutputPath(
  projectPath: string,
  outputDir: string,
  token: string,
  at = new Date(),
  seedStable = false,
): string {
  const resolvedProject = path.resolve(projectPath);
  const parentDir = path.dirname(resolvedProject);

  if (!outputDir || outputDir === 'dist-obfuscated') {
    return path.resolve(parentDir, buildOutputFolderName(resolvedProject, token, at, seedStable));
  }

  if (path.isAbsolute(outputDir)) {
    return path.resolve(outputDir);
  }

  return path.resolve(parentDir, outputDir);
}

export function getOutputLabel(
  projectPath: string,
  outputDir: string,
  token: string,
  at = new Date(),
  seedStable = false,
): string {
  const resolved = resolveOutputPath(projectPath, outputDir, token, at, seedStable);
  return path.basename(resolved);
}

/** 项目内需要排除的旧版输出根目录 */
export function getOutputBaseName(outputDir: string): string {
  if (!outputDir || outputDir === 'dist-obfuscated') return '';
  return path.isAbsolute(outputDir) ? path.basename(outputDir) : outputDir;
}
