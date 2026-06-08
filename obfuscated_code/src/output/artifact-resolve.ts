import path from 'node:path';
import fs from 'fs-extra';
import {
  LOGS_SUBDIR,
  OBFUSCATED_DIR,
  resolveObfuscatedConfigDir,
  resolveObfuscatedLogSessionDir,
} from './obfuscated-config.js';
import { artifactFilenameCandidates } from './artifact-names.js';
import type { ObfuscationMode } from '../types/config.js';
import { parseObfuscatedOutputDirName } from './resolve.js';

/** 从输出目录名推断源项目名：uni-test_{unixMs}_token → uni-test；兼容旧 YYYYMMDD 格式 */
export function guessSourceProjectName(dirBasename: string): string {
  return parseObfuscatedOutputDirName(dirBasename)?.projectName ?? dirBasename;
}

/** 配置/报告写入根目录：混淆输出目录回退到同级源项目 */
export function resolveArtifactProjectRoot(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  const basename = path.basename(resolved);
  const sourceName = guessSourceProjectName(basename);
  if (sourceName === basename) return resolved;
  return path.join(path.dirname(resolved), sourceName);
}

function legacyObfuscatedConfigDir(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  const projectName = path.basename(resolved);
  return path.resolve(path.dirname(resolved), 'obfuscated_config', projectName);
}

async function resolveArtifactFileExact(
  projectPath: string,
  filename: string,
): Promise<string | null> {
  const resolved = path.resolve(projectPath);
  const basename = path.basename(resolved);
  const parent = path.dirname(resolved);
  const sourceName = guessSourceProjectName(basename);
  const sourceRoot = path.join(parent, sourceName);

  const candidates: string[] = [
    path.join(resolveObfuscatedConfigDir(resolved), filename),
    path.join(resolveObfuscatedConfigDir(sourceRoot), filename),
    path.join(resolveObfuscatedLogSessionDir(resolved, basename), filename),
    path.join(resolveObfuscatedLogSessionDir(sourceRoot, basename), filename),
    path.join(parent, 'log', basename, filename),
    path.join(legacyObfuscatedConfigDir(resolved), filename),
    path.join(legacyObfuscatedConfigDir(sourceRoot), filename),
    path.join(resolved, filename),
  ];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }

  for (const root of [resolved, sourceRoot]) {
    const logsRoot = path.join(root, OBFUSCATED_DIR, LOGS_SUBDIR);
    if (!(await fs.pathExists(logsRoot))) continue;
    const sessions = await fs.readdir(logsRoot);
    for (const session of sessions.sort().reverse()) {
      const filePath = path.join(logsRoot, session, filename);
      if (await fs.pathExists(filePath)) return filePath;
    }
  }

  return null;
}

/** 解析映射/日志 JSON：优先 `{mode}-` 前缀，再回退旧文件名 */
export async function resolveArtifactFile(
  projectPath: string,
  basename: string,
  mode?: ObfuscationMode,
): Promise<string | null> {
  for (const filename of artifactFilenameCandidates(basename, mode)) {
    const found = await resolveArtifactFileExact(projectPath, filename);
    if (found) return found;
  }
  return null;
}
