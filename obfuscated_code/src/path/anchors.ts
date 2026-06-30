/** 官方 uni-app x 示例 + 常用变体的默认根锚点目录 */
export const DEFAULT_ROOT_ANCHOR_DIRS: readonly string[] = [
  'pages',
  'static',
  'uni_modules',
  'components',
  'utssdk',
  'platforms',
  'nativeResources',
  'harmonyConfig',
  'hybrid',
  'wxcomponents',
  'common',
  'nativeplugins',
  'uniCloud-aliyun',
  'uniCloud-alipay',
  'uniCloud-tcb',
  'uniCloud-*',
];

/** 官方 uni-app x 根级入口/配置文件，不可改名 */
export const DEFAULT_ROOT_ANCHOR_FILES: readonly string[] = [
  'main.uts',
  'App.uvue',
  'pages.json',
  'manifest.json',
  'package.json',
  'AndroidManifest.xml',
  'Info.plist',
  'uni.scss',
];

/** 任意路径下均不可改名的配置文件 */
export const IMMUTABLE_FILENAMES: readonly string[] = ['package.json'];

function matchesRootAnchor(dirName: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return dirName.startsWith(pattern.slice(0, -1));
  }
  return dirName === pattern;
}

export function isRootAnchorDir(
  relDir: string,
  dirName: string,
  rootAnchorDirs: readonly string[] = DEFAULT_ROOT_ANCHOR_DIRS,
): boolean {
  const parent = relDir.includes('/') ? relDir.slice(0, relDir.lastIndexOf('/')) : '';
  if (parent !== '') return false;
  return rootAnchorDirs.some((pattern) => matchesRootAnchor(dirName, pattern));
}

export function isRootAnchorFile(
  relFile: string,
  rootAnchorFiles: readonly string[] = DEFAULT_ROOT_ANCHOR_FILES,
): boolean {
  const normalized = relFile.replace(/\\/g, '/');
  if (normalized.includes('/')) return false;
  return rootAnchorFiles.includes(normalized);
}

/** package.json 等：禁止改名且不做内容替换 */
export function isImmutableConfigFile(relFile: string): boolean {
  const base = relFile.replace(/\\/g, '/').split('/').pop() ?? '';
  return IMMUTABLE_FILENAMES.includes(base);
}

/** 根锚点文件名（无扩展名），用于避免内容替换误伤 main.uts 等 */
export function rootAnchorBasenames(
  rootAnchorFiles: readonly string[] = DEFAULT_ROOT_ANCHOR_FILES,
): Set<string> {
  const basenames = new Set<string>();
  for (const file of rootAnchorFiles) {
    if (IMMUTABLE_FILENAMES.includes(file)) continue;
    const dot = file.lastIndexOf('.');
    basenames.add(dot > 0 ? file.slice(0, dot) : file);
  }
  return basenames;
}

/** 顶级锚点目录名（无通配符），避免 ./common/ 被误替换为 ./{token}common/ */
export function rootAnchorDirBasenames(
  rootAnchorDirs: readonly string[] = DEFAULT_ROOT_ANCHOR_DIRS,
): Set<string> {
  const names = new Set<string>();
  for (const pattern of rootAnchorDirs) {
    if (!pattern.includes('*')) names.add(pattern);
  }
  return names;
}

export function buildContentReplacementGuard(
  rootAnchorFiles: readonly string[] = DEFAULT_ROOT_ANCHOR_FILES,
  rootAnchorDirs: readonly string[] = DEFAULT_ROOT_ANCHOR_DIRS,
): Set<string> {
  const guard = new Set([...rootAnchorBasenames(rootAnchorFiles), ...rootAnchorDirBasenames(rootAnchorDirs)]);
  guard.add('index');
  return guard;
}

/** 复制时始终保留的顶级目录（扫描 exclude 中的 obfuscated/** 不影响复制） */
export const COPY_ALWAYS_INCLUDE_TOP_LEVEL_DIRS = ['obfuscated'] as const;

/** 构建复制忽略目录集（已剔除 COPY_ALWAYS_INCLUDE_TOP_LEVEL_DIRS） */
export function buildCopyIgnoreSet(
  exclude: string[],
  extraTopLevelDirs: Iterable<string> = [],
): Set<string> {
  const dirs = topLevelDirsFromExclude(exclude, extraTopLevelDirs);
  for (const name of COPY_ALWAYS_INCLUDE_TOP_LEVEL_DIRS) {
    dirs.delete(name);
  }
  return dirs;
}

/** 仅根级排除项参与复制忽略；嵌套模式如 uni_modules/uni-* 不排除整个 uni_modules */
export function topLevelDirsFromExclude(exclude: string[], extraTopLevelDirs: Iterable<string> = []): Set<string> {
  const dirs = new Set<string>(['node_modules', '.git', 'dist', 'dist-obfuscated', 'unpackage']);
  for (const d of extraTopLevelDirs) {
    dirs.add(d);
  }
  for (const pattern of exclude) {
    const normalized = pattern.replace(/\\/g, '/').replace(/\/\*\*$/, '');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 1 && !segments[0]!.includes('*')) {
      dirs.add(segments[0]!);
    }
  }
  return dirs;
}
