import path from 'node:path';
import fs from 'fs-extra';
import { normalizePath } from '../path/whitelist.js';

export const OBFUSCATED_DIR = 'obfuscated';

/** 输出目录内 obfuscated/ 快照路径：复制后只读，混淆流程不再修改 */
export function isObfuscatedSnapshotPath(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  return normalized === OBFUSCATED_DIR || normalized.startsWith(`${OBFUSCATED_DIR}/`);
}
export const CONFIG_SUBDIR = 'config';
export const LOGS_SUBDIR = 'logs';
export const OBFUSCATOR_CONFIG_FILENAME = 'obfuscator.config.json';

/** 源项目内：{project}/obfuscated/ */
export function resolveObfuscatedRoot(projectPath: string): string {
  return path.resolve(projectPath, OBFUSCATED_DIR);
}

/** 源项目内：{project}/obfuscated/obfuscator.config.json */
export function resolveObfuscatorConfigPath(projectPath: string): string {
  return path.join(resolveObfuscatedRoot(projectPath), OBFUSCATOR_CONFIG_FILENAME);
}

/** 加载配置：优先 obfuscated/，回退项目根 legacy */
export async function resolveObfuscatorConfigFileForLoad(
  projectPath: string,
): Promise<string | null> {
  const resolved = path.resolve(projectPath);
  const primary = resolveObfuscatorConfigPath(resolved);
  const legacy = path.join(resolved, OBFUSCATOR_CONFIG_FILENAME);
  if (await fs.pathExists(primary)) return primary;
  if (await fs.pathExists(legacy)) return legacy;
  return null;
}

export async function ensureObfuscatedRoot(projectPath: string): Promise<string> {
  const dir = resolveObfuscatedRoot(projectPath);
  await fs.ensureDir(dir);
  return dir;
}

/** 源项目内：{project}/obfuscated/config/ */
export function resolveObfuscatedConfigDir(projectPath: string): string {
  return path.join(resolveObfuscatedRoot(projectPath), CONFIG_SUBDIR);
}

/** 源项目内：{project}/obfuscated/logs/{sessionBaseName}/ */
export function resolveObfuscatedLogSessionDir(
  projectPath: string,
  sessionBaseName: string,
): string {
  return path.join(resolveObfuscatedRoot(projectPath), LOGS_SUBDIR, sessionBaseName);
}

export async function ensureObfuscatedConfigDir(projectPath: string): Promise<string> {
  const dir = resolveObfuscatedConfigDir(projectPath);
  await fs.ensureDir(dir);
  return dir;
}

export async function resolveObfuscatedConfigFile(
  projectPath: string,
  filename: string,
): Promise<string> {
  const dir = await ensureObfuscatedConfigDir(projectPath);
  return path.join(dir, filename);
}

/** 相对项目根的路径，用于终端展示 */
export function obfuscatedConfigLabel(projectPath: string, filename: string): string {
  return `${OBFUSCATED_DIR}/${CONFIG_SUBDIR}/${filename}`;
}

/** 相对项目根：obfuscated/obfuscator.config.json */
export function obfuscatorConfigLabel(): string {
  return `${OBFUSCATED_DIR}/${OBFUSCATOR_CONFIG_FILENAME}`;
}

export function obfuscatedLogsLabel(sessionBaseName: string): string {
  return `${OBFUSCATED_DIR}/${LOGS_SUBDIR}/${sessionBaseName}`;
}

/** 写入 {project}/obfuscated/config/{filename} */
export async function writeConfigJson(
  projectPath: string,
  filename: string,
  data: unknown,
): Promise<string> {
  const filePath = await resolveObfuscatedConfigFile(projectPath, filename);
  await fs.writeJson(filePath, data, { spaces: 2 });
  return filePath;
}

/** 写入 {project}/obfuscated/config/{filename} */
export async function writeConfigText(
  projectPath: string,
  filename: string,
  content: string,
): Promise<string> {
  const filePath = await resolveObfuscatedConfigFile(projectPath, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}
