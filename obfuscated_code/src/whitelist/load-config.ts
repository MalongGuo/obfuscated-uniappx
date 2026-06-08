import fs from 'fs-extra';
import { getPackageConfigPath } from '../config/package-paths.js';

export interface SymbolWhitelistConfig {
  lifecycleHooks: string[];
  reservedWords: string[];
  frameworkPrefixes: string[];
  globalBuiltins?: string[];
  keepDollarPrefix?: boolean;
}

export interface ApiLiteralKeysConfig {
  keys: string[];
}

let symbolConfig: SymbolWhitelistConfig | undefined;
let apiLiteralConfig: ApiLiteralKeysConfig | undefined;

export function loadSymbolWhitelistConfig(): SymbolWhitelistConfig {
  if (!symbolConfig) {
    symbolConfig = fs.readJsonSync(getPackageConfigPath('whitelist-symbols-uniappx.json')) as SymbolWhitelistConfig;
  }
  return symbolConfig;
}

export function loadApiLiteralKeysConfig(): ApiLiteralKeysConfig {
  if (!apiLiteralConfig) {
    apiLiteralConfig = fs.readJsonSync(getPackageConfigPath('api-literal-keys.json')) as ApiLiteralKeysConfig;
  }
  return apiLiteralConfig;
}

export function getLifecycleHooks(): Set<string> {
  return new Set(loadSymbolWhitelistConfig().lifecycleHooks);
}

export function getReservedWords(): Set<string> {
  return new Set(loadSymbolWhitelistConfig().reservedWords);
}

export function getFrameworkPrefixes(): string[] {
  return [...loadSymbolWhitelistConfig().frameworkPrefixes];
}

export function getGlobalBuiltins(): Set<string> {
  return new Set(loadSymbolWhitelistConfig().globalBuiltins ?? []);
}

export function getApiLiteralKeys(): Set<string> {
  return new Set(loadApiLiteralKeysConfig().keys);
}

/** 测试用：重置缓存 */
export function resetWhitelistConfigCache(): void {
  symbolConfig = undefined;
  apiLiteralConfig = undefined;
}
