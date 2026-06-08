import path from 'node:path';
import fg from 'fast-glob';
import { parsePagesJsonRoutes, resolvePageFile } from '../path/route-check.js';

export interface PagesJsonFix {
  key: 'path' | 'pagePath';
  oldValue: string;
  newValue: string;
  subPackageRoot: string | null;
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripToken(name: string, token: string): string {
  if (token && name.startsWith(token)) return name.slice(token.length);
  return name;
}

function segmentMatches(routeSeg: string, diskSeg: string, token: string): boolean {
  if (routeSeg === diskSeg) return true;
  if (token && diskSeg === `${token}${routeSeg}`) return true;
  if (token && stripToken(routeSeg, token) === stripToken(diskSeg, token)) return true;
  return false;
}

function leafMatches(fileLeaf: string, routeLeaf: string, token: string): boolean {
  if (fileLeaf === routeLeaf) return true;
  if (token && fileLeaf === `${token}${routeLeaf}`) return true;
  if (token && stripToken(fileLeaf, token) === routeLeaf) return true;
  // 误混淆：dynamic-border → dynamic-{token}border（目录名片段误匹配）
  const dash = routeLeaf.lastIndexOf('-');
  if (token && dash > 0) {
    const prefix = routeLeaf.slice(0, dash);
    const suffix = routeLeaf.slice(dash + 1);
    if (fileLeaf === `${prefix}-${token}${suffix}`) return true;
  }
  return false;
}

/** 在分包根目录下，根据磁盘文件反推正确的相对 path */
export function findSubPackageRelOnDisk(
  rootDir: string,
  relPath: string,
  token: string,
): string | null {
  const segments = relPath.split('/');
  const leaf = segments[segments.length - 1]!;
  const expectedDepth = segments.length;

  const files = fg.sync('**/*.{uvue,vue,nvue}', { cwd: rootDir, onlyFiles: true });
  const matches: string[] = [];

  for (const file of files) {
    const withoutExt = file.replace(/\.(uvue|vue|nvue)$/, '');
    const fileSegs = withoutExt.split('/');
    if (fileSegs.length !== expectedDepth) continue;
    if (!leafMatches(fileSegs[fileSegs.length - 1]!, leaf, token)) continue;

    let ok = true;
    for (let i = 0; i < segments.length - 1; i++) {
      if (!segmentMatches(segments[i]!, fileSegs[i]!, token)) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(withoutExt);
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const distinct = [...new Set(matches)].filter((m) => m !== relPath);
  return distinct.length === 1 ? distinct[0]! : null;
}

function findRouteInTree(
  projectRoot: string,
  routePath: string,
  searchRoot: string,
  routePrefix: string,
  token: string,
): string | null {
  const rel = routePath.replace(new RegExp(`^${routePrefix}/`), '');
  const segments = rel.split('/');
  const leaf = segments[segments.length - 1]!;
  const expectedDepth = segments.length;

  const files = fg.sync('**/*.{uvue,vue,nvue}', { cwd: path.join(projectRoot, searchRoot), onlyFiles: true });
  const matches: string[] = [];

  for (const file of files) {
    const withoutExt = file.replace(/\.(uvue|vue|nvue)$/, '');
    const fileSegs = withoutExt.split('/');
    if (fileSegs.length !== expectedDepth) continue;
    if (!leafMatches(fileSegs[fileSegs.length - 1]!, leaf, token)) continue;

    let ok = true;
    for (let i = 0; i < segments.length - 1; i++) {
      if (!segmentMatches(segments[i]!, fileSegs[i]!, token)) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(`${routePrefix}/${withoutExt}`);
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const distinct = [...new Set(matches)].filter((m) => m !== routePath);
  return distinct.length === 1 ? distinct[0]! : null;
}

/** 根据磁盘文件反推顶层 pages/tabBar/uni_modules 等完整路由 */
export function findFullRouteOnDisk(
  projectRoot: string,
  routePath: string,
  token: string,
): string | null {
  if (resolvePageFile(projectRoot, routePath)) return null;

  if (routePath.startsWith('uni_modules/')) {
    return findRouteInTree(projectRoot, routePath, 'uni_modules', 'uni_modules', token);
  }

  if (routePath.startsWith('pages/')) {
    return findRouteInTree(projectRoot, routePath, 'pages', 'pages', token);
  }

  return null;
}

export function collectPagesJsonFixes(
  projectRoot: string,
  pagesJsonRaw: string,
  token = '',
): PagesJsonFix[] {
  const fixes: PagesJsonFix[] = [];
  const data = JSON.parse(stripJsonComments(pagesJsonRaw));

  for (const page of data?.pages ?? []) {
    if (!page?.path) continue;
    if (!page.path.startsWith('pages/') && !page.path.startsWith('uni_modules/')) continue;
    if (resolvePageFile(projectRoot, page.path)) continue;
    const corrected = findFullRouteOnDisk(projectRoot, page.path, token);
    if (corrected && corrected !== page.path) {
      fixes.push({
        key: 'path',
        oldValue: page.path,
        newValue: corrected,
        subPackageRoot: null,
      });
    }
  }

  for (const pkg of data?.subPackages ?? []) {
    const root = (pkg?.root ?? '').replace(/\/+$/, '');
    if (!root) continue;
    const rootDir = path.join(projectRoot, root);
    for (const page of pkg?.pages ?? []) {
      if (!page?.path) continue;
      const fullRoute = `${root}/${page.path}`.replace(/\/+/g, '/');
      if (resolvePageFile(projectRoot, fullRoute)) continue;

      const correctedRel = findSubPackageRelOnDisk(rootDir, page.path, token);
      if (correctedRel && correctedRel !== page.path) {
        fixes.push({
          key: 'path',
          oldValue: page.path,
          newValue: correctedRel,
          subPackageRoot: root,
        });
      }
    }
  }

  for (const item of data?.tabBar?.list ?? []) {
    if (!item?.pagePath) continue;
    if (resolvePageFile(projectRoot, item.pagePath)) continue;
    const corrected = findFullRouteOnDisk(projectRoot, item.pagePath, token);
    if (corrected && corrected !== item.pagePath) {
      fixes.push({
        key: 'pagePath',
        oldValue: item.pagePath,
        newValue: corrected,
        subPackageRoot: null,
      });
    }
  }

  return fixes;
}

/** 保留 pages.json 注释，按上下文应用 path 修复 */
export function applyPagesJsonFixes(content: string, fixes: PagesJsonFix[]): string {
  if (fixes.length === 0) return content;

  let subPackageRoot: string | null = null;

  return content.replace(
    /"(root|pagePath|path)"\s*:\s*"([^"]+)"/g,
    (match, key: string, value: string) => {
      if (key === 'root') {
        subPackageRoot = value;
        return match;
      }

      const fix = fixes.find((item) => {
        if (item.key !== key || item.oldValue !== value) return false;
        if (key === 'path' && item.subPackageRoot) {
          return item.subPackageRoot === subPackageRoot;
        }
        return item.subPackageRoot === null;
      });

      if (!fix) return match;
      return `"${key}": "${fix.newValue}"`;
    },
  );
}
