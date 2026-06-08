import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';

const PAGE_EXTENSIONS = ['.vue', '.uvue', '.nvue'];

export interface RouteEntry {
  path: string;
  source: 'pages' | 'subPackages' | 'tabBar';
}

export interface RouteCheckIssue {
  type: 'missing-file' | 'tabbar-broken';
  path: string;
  message: string;
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function parsePagesJsonRoutes(raw: string): RouteEntry[] {
  const data = JSON.parse(stripJsonComments(raw));
  const routes: RouteEntry[] = [];

  for (const page of data?.pages ?? []) {
    if (page?.path) routes.push({ path: page.path, source: 'pages' });
  }

  for (const pkg of data?.subPackages ?? []) {
    const root = (pkg?.root ?? '').replace(/\/+$/, '');
    for (const page of pkg?.pages ?? []) {
      if (page?.path) {
        const full = root ? `${root}/${page.path}` : page.path;
        routes.push({ path: full.replace(/\/+/g, '/'), source: 'subPackages' });
      }
    }
  }

  for (const item of data?.tabBar?.list ?? []) {
    if (item?.pagePath) routes.push({ path: item.pagePath, source: 'tabBar' });
  }

  return routes;
}

export function resolvePageFile(projectRoot: string, routePath: string): string | null {
  const roots = routePath.startsWith('uni_modules/')
    ? [{ prefix: 'uni_modules', rel: routePath.replace(/^uni_modules\//, '') }]
    : [{ prefix: 'pages', rel: routePath.replace(/^pages\//, '') }];

  for (const { prefix, rel } of roots) {
    const base = path.join(projectRoot, prefix, rel);

    for (const ext of PAGE_EXTENSIONS) {
      const candidate = `${base}${ext}`;
      if (fs.existsSync(candidate)) return path.relative(projectRoot, candidate);
    }

    for (const ext of PAGE_EXTENSIONS) {
      const candidate = path.join(base, `index${ext}`);
      if (fs.existsSync(candidate)) return path.relative(projectRoot, candidate);
    }
  }

  const rel = routePath.replace(/^pages\//, '');
  const segments = rel.split('/');
  const tail = segments.slice(-2).join('/');
  const leaf = segments[segments.length - 1];
  if (tail && routePath.startsWith('pages/')) {
    const fuzzy = fg.sync(`pages/**/${tail}/${leaf}.vue`, { cwd: projectRoot, onlyFiles: true });
    if (fuzzy[0]) return fuzzy[0];
    const fuzzy2 = fg.sync(`pages/**/${leaf}/${leaf}.vue`, { cwd: projectRoot, onlyFiles: true });
    if (fuzzy2[0]) return fuzzy2[0];
    const fuzzy3 = fg.sync(`pages/**/${leaf}.vue`, { cwd: projectRoot, onlyFiles: true });
    if (fuzzy3.length === 1) return fuzzy3[0]!;
  }

  return null;
}

export function checkRouteConsistency(projectRoot: string, pagesJsonRaw: string): RouteCheckIssue[] {
  const issues: RouteCheckIssue[] = [];
  const routes = parsePagesJsonRoutes(pagesJsonRaw);
  const seen = new Set<string>();

  for (const route of routes) {
    if (seen.has(route.path)) continue;
    seen.add(route.path);

    const file = resolvePageFile(projectRoot, route.path);
    if (!file) {
      issues.push({
        type: route.source === 'tabBar' ? 'tabbar-broken' : 'missing-file',
        path: route.path,
        message: `路由 ${route.path} 无对应物理文件（${route.source}）`,
      });
    }
  }

  return issues;
}
