import path from 'node:path';
import fs from 'fs-extra';
import type { ObfuscationMode } from '../types/config.js';
import { resolveArtifactProjectRoot } from './artifacts.js';
import {
  OBFUSCATED_DIR,
  CONFIG_SUBDIR,
  OBFUSCATOR_CONFIG_FILENAME,
  resolveObfuscatedConfigDir,
  resolveObfuscatorConfigPath,
} from './obfuscated-config.js';
import { preloadLogFilename, type PreloadLogTask } from '../preload/logs.js';

const PRELOAD_TASKS: PreloadLogTask[] = ['vocab', 'symbols', 'sensitive', 'paths'];
const PRELOAD_MODES: ObfuscationMode[] = ['clone', 'code', 'full'];

/** preload 规则文件名：whitelist.json 与 {mode}-{task}.json */
export function listPreloadRuleFilenames(mode?: ObfuscationMode): string[] {
  const names = ['whitelist.json'];
  const modes =
    mode === 'full' ? (['clone', 'code'] as ObfuscationMode[]) : mode ? [mode] : PRELOAD_MODES;
  for (const m of modes) {
    if (m === 'full') continue;
    for (const task of PRELOAD_TASKS) {
      names.push(preloadLogFilename(m, task));
    }
  }
  return names;
}

export function isPreloadRuleFilename(filename: string): boolean {
  if (filename === 'whitelist.json') return true;
  return /^(clone|code|full)-(vocab|symbols|sensitive|paths)\.json$/.test(filename);
}

/**
 * run 前：将源项目 obfuscated/ 配置全量同步到输出目录。
 * 复制完成后、混淆开始前调用；同步后输出目录内 obfuscated/ 只读。
 */
export async function copyObfuscatedConfigToOutput(
  sourceProjectPath: string,
  outputPath: string,
): Promise<string[]> {
  const artifactRoot = resolveArtifactProjectRoot(sourceProjectPath);
  const targetObfuscatedRoot = path.join(path.resolve(outputPath), OBFUSCATED_DIR);
  const copied: string[] = [];

  const sourceObfuscatorConfig = resolveObfuscatorConfigPath(artifactRoot);
  if (await fs.pathExists(sourceObfuscatorConfig)) {
    await fs.ensureDir(targetObfuscatedRoot);
    await fs.copy(
      sourceObfuscatorConfig,
      path.join(targetObfuscatedRoot, OBFUSCATOR_CONFIG_FILENAME),
    );
    copied.push(OBFUSCATOR_CONFIG_FILENAME);
  }

  const sourceConfigDir = resolveObfuscatedConfigDir(artifactRoot);
  if (await fs.pathExists(sourceConfigDir)) {
    const targetConfigDir = path.join(targetObfuscatedRoot, CONFIG_SUBDIR);
    await fs.ensureDir(targetConfigDir);
    for (const filename of await fs.readdir(sourceConfigDir)) {
      const src = path.join(sourceConfigDir, filename);
      if (!(await fs.stat(src)).isFile()) continue;
      await fs.copy(src, path.join(targetConfigDir, filename));
      copied.push(`${CONFIG_SUBDIR}/${filename}`);
    }
  }

  return copied.sort();
}
