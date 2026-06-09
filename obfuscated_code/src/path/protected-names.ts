import { normalizePath } from './whitelist.js';

/** uni_modules 下非 uni-/uts- 前缀、但含 utssdk 需完整保留路径的 UTS 插件 */
export const PROTECTED_UTS_SDK_PACKAGE_IDS = ['xsd-request'] as const;

function isProtectedUniModulePackageDir(dirName: string): boolean {
  return (
    dirName.startsWith('uni-') ||
    dirName.startsWith('uts-') ||
    PROTECTED_UTS_SDK_PACKAGE_IDS.includes(dirName as (typeof PROTECTED_UTS_SDK_PACKAGE_IDS)[number])
  );
}

/** 目录名是否为受保护的 uni_modules 插件包名 */
export function isProtectedDirName(dirName: string): boolean {
  return isProtectedUniModulePackageDir(dirName);
}

/** 兼容旧名 */
export function isProtectedName(name: string): boolean {
  return isProtectedDirName(name);
}

/**
 * 路径是否在受保护区域：
 * uni_modules 下 uni-* / uts-* / 受保护 UTS SDK 插件（如 xsd-request）及其子目录。
 */
export function isProtectedPath(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  if (!normalized) return false;
  if (/^uni_modules\/(uni-|uts-)[^/]+(\/|$)/.test(normalized)) return true;
  for (const id of PROTECTED_UTS_SDK_PACKAGE_IDS) {
    if (normalized === `uni_modules/${id}` || normalized.startsWith(`uni_modules/${id}/`)) {
      return true;
    }
  }
  return false;
}

/** uni_modules 下 uts-* 与受保护 UTS SDK 插件目录（跳过 junk 等破坏性变换） */
export function isUtsPluginPath(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  if (!normalized) return false;
  if (/^uni_modules\/uts-[^/]+(\/|$)/.test(normalized)) return true;
  for (const id of PROTECTED_UTS_SDK_PACKAGE_IDS) {
    if (normalized === `uni_modules/${id}` || normalized.startsWith(`uni_modules/${id}/`)) {
      return true;
    }
  }
  return false;
}

/** @deprecated 使用 isProtectedPath */
export function isUniModulesPluginPath(relPath: string): boolean {
  return isProtectedPath(relPath);
}
