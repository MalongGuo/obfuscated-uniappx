import {
  getFrameworkPrefixes,
  getGlobalBuiltins,
  getLifecycleHooks,
  getReservedWords,
  loadSymbolWhitelistConfig,
} from './load-config.js';

export function isGlobalBuiltin(name: string): boolean {
  return getGlobalBuiltins().has(name);
}

export function isFrameworkApi(name: string): boolean {
  return getFrameworkPrefixes().some((prefix) => name.startsWith(prefix));
}

export function shouldKeepSymbol(
  name: string,
  customWhitelist: string[] = [],
  extraFrameworkPrefixes: string[] = [],
): boolean {
  const prefixes = [...getFrameworkPrefixes(), ...extraFrameworkPrefixes];
  if (getLifecycleHooks().has(name)) return true;
  if (getReservedWords().has(name)) return true;
  if (isGlobalBuiltin(name)) return true;
  if (prefixes.some((prefix) => name.startsWith(prefix))) return true;
  if (customWhitelist.includes(name)) return true;
  if (loadSymbolWhitelistConfig().keepDollarPrefix !== false && name.startsWith('$')) return true;
  return false;
}
