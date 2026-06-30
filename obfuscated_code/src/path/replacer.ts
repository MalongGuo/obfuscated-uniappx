export interface PathReplacement {
  from: string;
  to: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectBasenameMappings(
  renameLog: Array<{ from: string; to: string }>,
  protectedBasenames: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const map = new Map<string, string>();
  const conflicts = new Set<string>();

  const upsert = (key: string, value: string) => {
    const existing = map.get(key);
    if (existing && existing !== value) conflicts.add(key);
    else map.set(key, value);
  };

  for (const { from, to } of renameLog) {
    if (!from || !to || from === to) continue;
    const fromBase = from.split('/').pop()!;
    const toBase = to.split('/').pop()!;
    if (fromBase === toBase) continue;

    if (!protectedBasenames.has(fromBase)) {
      upsert(fromBase, toBase);
    }

    const fromDot = fromBase.indexOf('.');
    const toDot = toBase.indexOf('.');
    if (fromDot > 0 && toDot > 0) {
      const fromStem = fromBase.slice(0, fromDot);
      if (!protectedBasenames.has(fromStem)) {
        upsert(fromStem, toBase.slice(0, toDot));
      }
    }
  }

  for (const key of conflicts) map.delete(key);
  for (const key of protectedBasenames) map.delete(key);
  return map;
}

const SCOPED_REL_ROOTS = ['pages', 'components', 'store', 'windows', 'common', 'service'] as const;

function buildRelativeImportVariants(basenameMap: Map<string, string>): PathReplacement[] {
  const reps: PathReplacement[] = [];
  for (const [fromBase, toBase] of basenameMap) {
    // Single-segment sibling imports (../types); avoid ../../basename — too easy to false-match.
    for (const lead of ['./', '../']) {
      reps.push({ from: `${lead}${fromBase}`, to: `${lead}${toBase}` });
    }
  }
  return reps;
}

/** 生成 pages/foo/bar → ../foo/bar 这类去掉顶层目录前缀的相对 import 变体 */
function buildScopedRelativeVariants(
  from: string,
  to: string,
  seen: Set<string>,
  reps: PathReplacement[],
): void {
  for (const root of SCOPED_REL_ROOTS) {
    const prefix = `${root}/`;
    if (!from.startsWith(prefix) || !to.startsWith(prefix)) continue;

    const relFrom = from.slice(prefix.length);
    const relTo = to.slice(prefix.length);
    for (const lead of ['./', '../', '../../', '../../../', '../../../../']) {
      const variant = `${lead}${relFrom}`;
      const replacement = `${lead}${relTo}`;
      if (seen.has(variant)) continue;
      seen.add(variant);
      reps.push({ from: variant, to: replacement });
    }
  }
}

export function buildContentReplacements(
  renameLog: Array<{ from: string; to: string }>,
  protectedBasenames: ReadonlySet<string> = new Set(),
): PathReplacement[] {
  const reps: PathReplacement[] = [];
  const seen = new Set<string>();

  const sorted = [...renameLog].sort((a, b) => b.from.length - a.from.length);

  for (const { from, to } of sorted) {
    if (!from || from === to) continue;

    const isSingleSegment = !from.includes('/');
    if (isSingleSegment && protectedBasenames.has(from)) continue;
    const variants = isSingleSegment
      ? [
          `${from}/`,
          `./${from}/`,
          `../${from}/`,
          `../../${from}/`,
          `../../../${from}/`,
          `/${from}/`,
          `@/${from}`,
          `@/${from}/`,
          `"${from}/`,
          `'${from}/`,
          `"./${from}/`,
          `'./${from}/`,
          `"@/${from}"`,
          `"@/${from}/"`,
          `'@/${from}'`,
          `'@/${from}/'`,
          `\`${from}/`,
          `\`/${from}/`,
          `\`@/${from}/`,
          `node ${from}/`,
        ]
      : [
          from,
          `./${from}`,
          `../${from}`,
          `../../${from}`,
          `../../../${from}`,
          `/${from}`,
          `@/${from}`,
          `'${from}'`,
          `"${from}"`,
          `'./${from}'`,
          `"./${from}"`,
          `'@/${from}'`,
          `"@/${from}"`,
          `\`${from}`,
          `\`/${from}`,
          `\`@/${from}`,
          `pages/${from}`,
        ];

    for (const variant of variants) {
      if (seen.has(variant)) continue;
      seen.add(variant);

      const toPath = isSingleSegment ? `${to}/` : to;
      let replacement = variant;
      if (variant === from) replacement = toPath;
      else if (variant === `${from}/`) replacement = toPath;
      else if (variant.startsWith('./')) {
        replacement = isSingleSegment
          ? variant.replace(`${from}/`, `${to}/`)
          : variant.replace(`${from}/`, `${to}/`).replace(from, to);
      } else if (variant.startsWith('../')) {
        replacement = isSingleSegment
          ? variant.replace(`${from}/`, `${to}/`)
          : variant.replace(`${from}/`, `${to}/`).replace(from, to);
      } else if (variant.startsWith('@/')) {
        replacement = isSingleSegment
          ? variant.replace(`${from}/`, `${to}/`).replace(new RegExp(`${escapeRegex(from)}$`), to)
          : variant.replace(`${from}/`, `${to}/`).replace(from, to);
      } else if (variant.startsWith('/')) {
        replacement = isSingleSegment
          ? variant.replace(`${from}/`, `${to}/`)
          : variant.replace(`${from}/`, `${to}/`).replace(from, to);
      }
      else if (variant.startsWith('node ')) replacement = variant.replace(`${from}/`, `${to}/`);
      else if (variant.startsWith("'") || variant.startsWith('"')) {
        const body = isSingleSegment
          ? variant.slice(1).replace(`${from}/`, `${to}/`).replace(new RegExp(`${escapeRegex(from)}$`), to)
          : variant.slice(1).replace(`${from}/`, `${to}/`).replace(from, to);
        replacement = variant[0] + body;
      } else if (variant.startsWith('`')) {
        replacement = isSingleSegment
          ? variant.replace(`${from}/`, `${to}/`).replace(new RegExp(`${escapeRegex(from)}$`), to)
          : variant.replace(`${from}/`, `${to}/`).replace(from, to);
      } else if (variant.startsWith('pages/')) {
        replacement = variant.replace(from, to);
      }

      reps.push({ from: variant, to: replacement });
    }

    if (!isSingleSegment) {
      buildScopedRelativeVariants(from, to, seen, reps);
    }
  }

  for (const rel of buildRelativeImportVariants(collectBasenameMappings(renameLog, protectedBasenames))) {
    if (seen.has(rel.from)) continue;
    seen.add(rel.from);
    reps.push(rel);
  }

  return reps.sort((a, b) => b.from.length - a.from.length);
}

const TEXT_EXTENSIONS = new Set([
  '.vue', '.uvue', '.nvue', '.js', '.ts', '.uts', '.jsx', '.tsx',
  '.json', '.scss', '.css', '.less', '.sass', '.html', '.xml', '.md', '.txt',
]);

export function isTextFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

const SEGMENT_BOUNDARY = /[/"'`.?&#]/;

/** `./foo` 不能以 `.` 为前导边界，否则会误匹配 `../../foo` 中的 `./foo` 子串 */
function segmentLookbehind(from: string): string {
  if (from.startsWith('./')) {
    return '[/"\'`|^]';
  }
  if (from.startsWith('../')) {
    // `../types` 只应匹配 import 路径起点，避免误伤 `../../request` 中的 `../request` 子串
    return '["\'`|^]';
  }
  return `${SEGMENT_BOUNDARY.source}|^`;
}

function replacePathSegment(content: string, from: string, to: string): string {
  if (!from || from === to) return content;

  const escaped = escapeRegex(from);
  const regex = new RegExp(
    `(?<=${segmentLookbehind(from)})${escaped}(?=${SEGMENT_BOUNDARY.source}|$)`,
    'g',
  );
  return content.replace(regex, to);
}

export function applyReplacements(content: string, replacements: PathReplacement[]): string {
  let result = content;
  for (const { from, to } of replacements) {
    result = replacePathSegment(result, from, to);
  }
  return result;
}
