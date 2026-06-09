import path from 'node:path';
import type { ObfuscatorConfig } from '../types/config.js';
import { generateToken } from '../path/token.js';

/** 有 seed 且为默认 outputDir 时，输出 {项目}_{token}；--no-seed 时用 {项目}_{unixMs}_{token} */
export function shouldUseSeedBasedOutputNaming(config: ObfuscatorConfig): boolean {
  if (config.outputDir && config.outputDir !== 'dist-obfuscated') return false;
  return Boolean(config.seed);
}

/** @deprecated 使用 shouldUseSeedBasedOutputNaming；保留别名兼容旧调用 */
export const shouldUseSeedStableOutputNaming = shouldUseSeedBasedOutputNaming;

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

/** seed 固定目录：{项目名}_{token}（token 16 位字母开头，无 unixMs） */
export const SEED_BASED_OUTPUT_DIR_PATTERN = /^(.+)_([A-Za-z][A-Za-z0-9]{15})$/;

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

  const seedBased = basename.match(SEED_BASED_OUTPUT_DIR_PATTERN);
  if (seedBased) {
    return {
      projectName: seedBased[1]!,
      token: seedBased[2]!,
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

/** 输出目录名：有 seed 时 项目名称_token；无 seed 时 项目名称_{unixMs}_token */
export function buildOutputFolderName(
  projectPath: string,
  token: string,
  at = new Date(),
  seedBased = false,
): string {
  const projectName = path.basename(path.resolve(projectPath));
  if (seedBased) {
    return `${projectName}_${token}`;
  }
  return `${projectName}_${formatOutputTimestamp(at)}_${token}`;
}

/** 有 seed 时链式混淆归一化为原始项目名 + token */
export function buildSeedBasedOutputFolderName(projectName: string, token: string): string {
  return `${projectName}_${token}`;
}

/** @deprecated 使用 buildSeedBasedOutputFolderName */
export const buildSeedStableOutputFolderName = buildSeedBasedOutputFolderName;

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
 * - 有 seed → {项目}_{token}
 * - --no-seed → {项目}_{unixMs}_{token}
 * - 源目录已是混淆输出且无 seed → {源目录名}_{unixMs}
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
    const seedBased = shouldUseSeedBasedOutputNaming(config);
    if (seedBased) {
      return {
        outputPath: path.resolve(parentDir, buildSeedBasedOutputFolderName(parsed.projectName, token)),
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

  const seedBased = shouldUseSeedBasedOutputNaming(config);
  const { token, auto } = resolvePathToken(config);
  return {
    outputPath: resolveOutputPath(resolvedProject, config.outputDir, token, at, seedBased),
    token,
    tokenAuto: auto,
    seedFromSourceDir: null,
    sourceIsObfuscatedOutputDir: false,
  };
}

/**
 * 输出目录与项目同级。
 * 有 seed：{项目名称}_{token}；无 seed：{项目名称}_{unixMs}_{token}
 * --output 指定非默认名时：与项目同级的指定目录
 */
export function resolveOutputPath(
  projectPath: string,
  outputDir: string,
  token: string,
  at = new Date(),
  seedBased = false,
): string {
  const resolvedProject = path.resolve(projectPath);
  const parentDir = path.dirname(resolvedProject);

  if (!outputDir || outputDir === 'dist-obfuscated') {
    return path.resolve(parentDir, buildOutputFolderName(resolvedProject, token, at, seedBased));
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
  seedBased = false,
): string {
  const resolved = resolveOutputPath(projectPath, outputDir, token, at, seedBased);
  return path.basename(resolved);
}

/** 项目内需要排除的旧版输出根目录 */
export function getOutputBaseName(outputDir: string): string {
  if (!outputDir || outputDir === 'dist-obfuscated') return '';
  return path.isAbsolute(outputDir) ? path.basename(outputDir) : outputDir;
}
