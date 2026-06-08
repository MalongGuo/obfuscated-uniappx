import path from 'node:path';
import type { ObfuscatorConfig } from '../types/config.js';
import { detectPathConflicts, extractTabBarPaths } from '../path/conflicts.js';
import { describePathWhitelist } from '../whitelist/project-whitelist.js';
import { loadProjectWhitelist } from '../whitelist/project-whitelist.js';
import { writePreloadLog } from './logs.js';

export interface PathsPreloadResult {
  tabBarPaths: string[];
  pathConflicts: string[];
  pathWhitelist: {
    configCount: number;
    projectCount: number;
    mergedCount: number;
    merged: string[];
  };
}

export async function extractPathsPreload(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<PathsPreloadResult> {
  const pagesJsonPath = path.join(projectPath, 'pages.json');
  const pagesDir = path.join(projectPath, 'pages');
  const tabBarPaths = await extractTabBarPaths(pagesJsonPath);
  const pathConflicts = await detectPathConflicts(pagesDir);
  const projectWhitelist = await loadProjectWhitelist(projectPath);
  const pathWhitelist = describePathWhitelist(config, projectWhitelist?.whitelist ?? null);

  return {
    tabBarPaths,
    pathConflicts,
    pathWhitelist,
  };
}

export async function runPreloadPaths(
  projectPath: string,
  config: ObfuscatorConfig,
  logMode: ObfuscatorConfig['mode'] = config.mode,
): Promise<{ result: PathsPreloadResult; logPath: string }> {
  const result = await extractPathsPreload(projectPath, config);
  const logPath = await writePreloadLog(projectPath, logMode, 'paths', {
    tabBarPaths: result.tabBarPaths,
    pathConflicts: result.pathConflicts,
    pathWhitelist: result.pathWhitelist,
  });
  return { result, logPath };
}
