export interface PathRenameEntry {
  from: string;
  to: string;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function buildFullPathRenames(renameLog: PathRenameEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const { from, to } of renameLog) {
    if (!from || from === to) continue;
    map.set(normalize(from), normalize(to));
  }
  return map;
}

/** 将可能已被 applyReplacements 改写的路径还原为 renameLog 中的 from，便于分包相对 path 匹配 */
function resolveOriginalPath(pagePath: string, fullRenames: Map<string, string>): string {
  const norm = normalize(pagePath);
  if (fullRenames.has(norm)) return norm;
  for (const [from, to] of fullRenames) {
    if (to === norm) return from;
  }
  return norm;
}

function transformFullPagePath(pagePath: string, fullRenames: Map<string, string>): string {
  const norm = normalize(pagePath);
  if (fullRenames.has(norm)) {
    return fullRenames.get(norm)!;
  }

  const sorted = [...fullRenames.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    if (norm === from || norm.startsWith(`${from}/`)) {
      return norm.replace(from, to);
    }
  }
  return pagePath;
}

/** 按段拼接 root + 相对路径，查找 renameLog 中每段累积路径的映射 */
function transformRelativePathBySegments(
  relPath: string,
  root: string,
  fullRenames: Map<string, string>,
): string {
  const segments = relPath.split('/');
  const normRoot = normalize(root);
  return segments
    .map((seg, index) => {
      const partial = normalize([normRoot, ...segments.slice(0, index + 1)].join('/'));
      const transformed = transformFullPagePath(partial, fullRenames);
      if (transformed !== partial) {
        return transformed.split('/').pop()!;
      }
      return seg;
    })
    .join('/');
}

/** 将 subPackage 内相对 path 转为混淆后的相对 path */
function transformSubPackageRelativePath(
  relPath: string,
  root: string,
  fullRenames: Map<string, string>,
): string {
  const normRoot = normalize(root);
  const normFull = normalize(`${normRoot}/${relPath}`);
  const newFull = transformFullPagePath(normFull, fullRenames);
  const newRoot = transformFullPagePath(normRoot, fullRenames);

  if (newFull.startsWith(`${newRoot}/`)) {
    return newFull.slice(newRoot.length + 1);
  }

  return transformRelativePathBySegments(relPath, normRoot, fullRenames);
}

function transformWindowPath(value: string, fullRenames: Map<string, string>): string {
  const extMatch = value.match(/(\.(?:uvue|vue|nvue))$/);
  const ext = extMatch?.[1] ?? '';
  const withoutExt = ext ? value.slice(0, -ext.length) : value;
  return `${transformFullPagePath(withoutExt, fullRenames)}${ext}`;
}

export function syncPagesJsonContent(content: string, renameLog: PathRenameEntry[]): string {
  const fullRenames = buildFullPathRenames(renameLog);
  let subPackageRoot: string | null = null;

  return content.replace(
    /"(root|pagePath|path)"\s*:\s*"([^"]+)"/g,
    (match, key: string, value: string) => {
      if (key === 'root') {
        subPackageRoot = resolveOriginalPath(value, fullRenames);
        return `"root": "${transformFullPagePath(subPackageRoot, fullRenames)}"`;
      }

      if (key === 'pagePath') {
        return `"pagePath": "${transformFullPagePath(value, fullRenames)}"`;
      }

      if (value.startsWith('pages/') || value.startsWith('uni_modules/')) {
        return `"path": "${transformFullPagePath(value, fullRenames)}"`;
      }

      if (value.startsWith('windows/')) {
        return `"path": "${transformWindowPath(value, fullRenames)}"`;
      }

      if (subPackageRoot) {
        const newRel = transformSubPackageRelativePath(value, subPackageRoot, fullRenames);
        return `"path": "${newRel}"`;
      }

      return match;
    },
  );
}

/** 静态资源 / manifest 图标等路径，与 clone 目录映射一致 */
export function transformResourcePath(resourcePath: string, renameLog: PathRenameEntry[]): string {
  const fullRenames = buildFullPathRenames(renameLog);
  const norm = normalize(resourcePath);
  return transformFullPagePath(norm, fullRenames);
}
