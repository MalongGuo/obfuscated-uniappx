import fs from 'fs-extra';
import { getPackageConfigPath } from '../config/package-paths.js';

export interface FrameworkWhitelistConfig {
  note?: string;
  copyExcludeTopLevelDirs: string[];
  pathPatterns: string[];
}

let frameworkConfig: FrameworkWhitelistConfig | undefined;

export function loadFrameworkWhitelistConfig(): FrameworkWhitelistConfig {
  if (!frameworkConfig) {
    frameworkConfig = fs.readJsonSync(getPackageConfigPath('whitelist-framework.json')) as FrameworkWhitelistConfig;
  }
  return frameworkConfig;
}

export function getFrameworkCopyExcludeTopLevelDirs(): readonly string[] {
  return loadFrameworkWhitelistConfig().copyExcludeTopLevelDirs;
}

export function getFrameworkPathPatterns(): readonly string[] {
  return loadFrameworkWhitelistConfig().pathPatterns;
}

/** 测试用：重置缓存 */
export function resetFrameworkWhitelistConfigCache(): void {
  frameworkConfig = undefined;
}
