import { normalizePath } from './whitelist.js';

/** 目录名是否为 uni-* 或 uts-* */
export function isProtectedDirName(dirName: string): boolean {
  return dirName.startsWith('uni-') || dirName.startsWith('uts-');
}

/** 兼容旧名 */
export function isProtectedName(name: string): boolean {
  return isProtectedDirName(name);
}

/**
 * 路径是否在受保护区域：
 * 仅 uni_modules 下直接的 uni-* / uts-* 目录及其子目录。
 */
export function isProtectedPath(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  if (!normalized) return false;
  return /^uni_modules\/(uni-|uts-)[^/]+(\/|$)/.test(normalized);
}

/** @deprecated 使用 isProtectedPath */
export function isUniModulesPluginPath(relPath: string): boolean {
  return isProtectedPath(relPath);
}
