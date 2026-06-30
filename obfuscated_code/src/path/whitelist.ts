export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** precise 范围：目录/文件路径是否落在 include 规则内 */
export function matchesIncludeScope(relPath: string, include: string[]): boolean {
  if (include.length === 0) return true;
  const normalized = normalizePath(relPath);
  for (const pattern of include) {
    const p = normalizePath(pattern);
    if (p.endsWith('/**')) {
      const prefix = p.slice(0, -3);
      if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true;
      continue;
    }
    if (p.includes('*') && !p.includes('/')) continue;
    if (normalized === p || normalized.startsWith(`${p}/`)) return true;
  }
  return false;
}

export function matchesPathWhitelist(fullDirPath: string, patterns: string[]): boolean {
  const normalized = normalizePath(fullDirPath);
  for (const pattern of patterns) {
    const p = normalizePath(pattern);
    if (p.endsWith('/**')) {
      const prefix = p.slice(0, -3);
      if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
        return true;
      }
      continue;
    }
    if (p.includes('*')) {
      const regex = new RegExp(
        `^${p.split('/').map((seg) => (seg === '*' ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`,
      );
      if (regex.test(normalized)) return true;
      continue;
    }
    // Multi-segment paths whitelist the whole subtree (e.g. uni_modules/vk-uview-ui/components).
    // Single-segment entries (pages, common) stay exact-only so pages/u can still rename.
    if (normalized === p || (p.includes('/') && normalized.startsWith(`${p}/`))) return true;
  }
  return false;
}
