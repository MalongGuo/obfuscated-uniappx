import path from 'node:path';
import fs from 'fs-extra';
import type { CliOptions, ObfuscatorConfig } from '../types/config.js';
import { loadConfig } from '../config/loader.js';
import { resolveArtifactProjectRoot } from '../output/artifacts.js';
import { resolveObfuscatedConfigDir } from '../output/obfuscated-config.js';
import { getFrameworkPathPatterns } from './load-framework.js';
import type { GeneratedWhitelist } from './generator.js';
import type { BuildSymbolTableOptions } from '../symbols/types.js';

export type ProjectWhitelist = GeneratedWhitelist;

export interface ResolvedProjectWhitelist {
  whitelist: ProjectWhitelist;
  loadedFrom: string;
}

async function readWhitelistFile(filePath: string): Promise<ProjectWhitelist | null> {
  if (!(await fs.pathExists(filePath))) return null;
  return (await fs.readJson(filePath)) as ProjectWhitelist;
}

/** 读取项目 whitelist.json（obfuscated/config → 源项目回退 → 根目录 legacy） */
export async function loadProjectWhitelist(
  projectPath: string,
): Promise<ResolvedProjectWhitelist | null> {
  const resolved = path.resolve(projectPath);
  const sourceRoot = resolveArtifactProjectRoot(resolved);

  const candidates = [
    path.join(resolveObfuscatedConfigDir(resolved), 'whitelist.json'),
    path.join(resolved, 'whitelist.json'),
    path.join(resolveObfuscatedConfigDir(sourceRoot), 'whitelist.json'),
    path.join(sourceRoot, 'whitelist.json'),
  ];

  const seen = new Set<string>();
  for (const filePath of candidates) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    const data = await readWhitelistFile(filePath);
    if (data) {
      return { whitelist: data, loadedFrom: filePath };
    }
  }

  return null;
}

export function buildSymbolWhitelistOptions(
  project: ProjectWhitelist | null,
  sensitiveStrings: string[],
): Pick<BuildSymbolTableOptions, 'customWhitelist'> {
  const symbolNames = new Set<string>(sensitiveStrings);
  for (const name of project?.symbols ?? []) {
    symbolNames.add(name);
  }

  return {
    customWhitelist: [...symbolNames],
  };
}

export function mergePathWhitelistPatterns(
  configPatterns: readonly string[],
  project: ProjectWhitelist | null,
  extraPatterns: readonly string[] = [],
): string[] {
  const merged = [...configPatterns];
  for (const pattern of project?.pathPatterns ?? []) {
    if (!merged.includes(pattern)) merged.push(pattern);
  }
  for (const pattern of extraPatterns) {
    if (!merged.includes(pattern)) merged.push(pattern);
  }
  return merged;
}

export function describePathWhitelist(
  config: Pick<ObfuscatorConfig, 'pathWhitelist'>,
  project: ProjectWhitelist | null,
): { configCount: number; projectCount: number; mergedCount: number; merged: string[] } {
  const merged = mergePathWhitelistPatterns(config.pathWhitelist, project);
  return {
    configCount: config.pathWhitelist.length,
    projectCount: project?.pathPatterns.length ?? 0,
    mergedCount: merged.length,
    merged,
  };
}

/** 终端摘要：每个配置文件一行「文件名  结果」，文件名列按最长名对齐 */
export function formatWhitelistLoadSummary(
  config: Pick<ObfuscatorConfig, 'pathWhitelist' | 'sensitiveStrings'>,
  project: ProjectWhitelist | null,
): string[] {
  const paths = describePathWhitelist(config, project);
  const projectSymbols = project?.symbols.length ?? 0;
  const sensitive = config.sensitiveStrings.length;
  const projectPaths = project?.pathPatterns.length ?? 0;
  const rows: Array<{ file: string; detail: string }> = [
    {
      file: 'obfuscator.config.json',
      detail: `sensitiveStrings ${sensitive} 个, pathWhitelist ${paths.configCount} 条`,
    },
    {
      file: 'whitelist.json',
      detail: `symbols ${projectSymbols} 个, pathPatterns ${projectPaths} 条`,
    },
  ];
  const nameWidth = Math.max(...rows.map((row) => row.file.length));
  const lines = rows.map((row) => `${row.file.padEnd(nameWidth)}  ${row.detail}`);
  if (paths.projectCount > 0 && paths.mergedCount !== paths.configCount) {
    lines.push(`路径白名单合并 ${paths.mergedCount} 条`);
  }
  return lines;
}

export function printWhitelistLoadSummary(
  emit: (message: string) => void,
  config: Pick<ObfuscatorConfig, 'pathWhitelist' | 'sensitiveStrings'>,
  project: ProjectWhitelist | null,
): void {
  emit('  加载配置:');
  for (const line of formatWhitelistLoadSummary(config, project)) {
    emit(`    ${line}`);
  }
}

/** preload / run：读 config 与 whitelist.json（whitelist 仅由 init 生成） */
export async function loadPreloadProjectContext(
  projectPath: string,
  options: Partial<CliOptions> = {},
): Promise<{
  config: ObfuscatorConfig;
  whitelist: ResolvedProjectWhitelist | null;
}> {
  const config = await loadConfig(projectPath, options);
  const whitelist = await loadProjectWhitelist(projectPath);
  return { config, whitelist };
}

export async function resolveSymbolTableWhitelistOptions(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<{
  options: Pick<BuildSymbolTableOptions, 'customWhitelist'>;
  loaded: ResolvedProjectWhitelist | null;
}> {
  const loaded = await loadProjectWhitelist(projectPath);
  return {
    loaded,
    options: buildSymbolWhitelistOptions(loaded?.whitelist ?? null, config.sensitiveStrings),
  };
}

export async function resolvePathWhitelistForClone(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<{ patterns: string[]; loaded: ResolvedProjectWhitelist | null }> {
  const loaded = await loadProjectWhitelist(projectPath);
  return {
    loaded,
    patterns: mergePathWhitelistPatterns(
      config.pathWhitelist,
      loaded?.whitelist ?? null,
      getFrameworkPathPatterns(),
    ),
  };
}

