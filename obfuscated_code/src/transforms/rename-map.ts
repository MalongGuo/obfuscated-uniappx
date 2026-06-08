import type { SymbolTable } from '../symbols/types.js';
import { isGlobalBuiltin } from '../whitelist/builtin.js';
import { getApiLiteralKeys } from '../whitelist/load-config.js';

export type RenameMap = Map<string, string>;

/** 不可作为重命名目标的 JS 关键字（含 v-for 的 in/of） */
export const JS_RESERVED_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'this', 'in', 'of', 'as', 'if', 'else',
  'return', 'new', 'typeof', 'void', 'delete', 'instanceof', 'case', 'break',
  'continue', 'default', 'switch', 'while', 'for', 'do', 'try', 'catch', 'finally',
  'throw', 'class', 'extends', 'super', 'import', 'export', 'from', 'await', 'yield',
]);

/** 仅允许合法 JS 标识符进入 template/script 联动重命名，排除 v-for 整段表达式等误收集符号 */
export function isRenamableIdentifier(name: string): boolean {
  if (isGlobalBuiltin(name)) return false;
  return /^[a-zA-Z_$][\w$]*$/.test(name) && !JS_RESERVED_WORDS.has(name);
}

const RESERVED_VUE_KEYS = new Set([
  'data', 'methods', 'computed', 'watch', 'props', 'components', 'mixins',
  'filters', 'directives', 'provide', 'inject', 'emits', 'expose', 'setup',
  'name', 'extends', 'model', 'inheritAttrs',
]);

/** uni-app App 级选项：定义键与 this.xxx 必须一致，不可只改引用不改键名 */
const RESERVED_UNI_APP_KEYS = new Set([
  'globalData',
]);

/** 网络请求 / 框架字面量键名，不可重命名（来源：config/api-literal-keys.json） */
export function getRenameMapApiLiteralKeys(): Set<string> {
  return getApiLiteralKeys();
}

/** @deprecated 使用 getRenameMapApiLiteralKeys()；配置见 config/api-literal-keys.json */
export const API_LITERAL_KEYS = getApiLiteralKeys();

export function buildFileRenameMap(table: SymbolTable, relativePath: string): RenameMap {
  const normalized = relativePath.replace(/\\/g, '/');
  const map: RenameMap = new Map();

  for (const entry of table.symbols.values()) {
    if (!entry.renameable || !entry.obfuscatedName || entry.name === entry.obfuscatedName) {
      continue;
    }
    const inFile = entry.occurrences.some((o) => o.file.replace(/\\/g, '/') === normalized);
    if (!inFile) continue;
    if (entry.kind === 'import' && !entry.renameable) continue;
    if (RESERVED_VUE_KEYS.has(entry.name)) continue;
    if (RESERVED_UNI_APP_KEYS.has(entry.name)) continue;
    if (API_LITERAL_KEYS.has(entry.name)) continue;
    if (!isRenamableIdentifier(entry.name)) continue;
    map.set(entry.name, entry.obfuscatedName);
  }

  return map;
}

export function renameMapToRecord(map: RenameMap): Record<string, string> {
  return Object.fromEntries(map);
}

export function renameMapToPairs(map: RenameMap): Array<{ from: string; to: string }> {
  return [...map.entries()]
    .filter(([from, to]) => from !== to)
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

export interface FileChangeDetailInput {
  renames: Array<{ from: string; to: string }>;
  changed: boolean;
  commentsStripped: boolean;
  identifierRenamed: boolean;
  astTransformed?: boolean;
}

/** 进度行：文件路径 | 原名 → 新名 (+N) | 其他变换 */
export function formatFileObfuscateDetail(
  filePath: string,
  entry: FileChangeDetailInput,
  options?: { maxShow?: number; includeRenames?: boolean },
): string {
  const maxShow = options?.maxShow ?? 1;
  const includeRenames = options?.includeRenames ?? true;
  const notes: string[] = [];

  if (includeRenames && entry.renames.length > 0) {
    const shown = entry.renames
      .slice(0, maxShow)
      .map((r) => `${r.from} → ${r.to}`)
      .join(', ');
    const more = entry.renames.length > maxShow ? ` (+${entry.renames.length - maxShow})` : '';
    notes.push(shown + more);
  } else {
    if (entry.commentsStripped) notes.push('注释清理');
    if (entry.astTransformed) notes.push('AST变换');
    if (!entry.changed) notes.push('无变更');
    else if (notes.length === 0) notes.push('已变换');
  }

  return notes.length > 0 ? `${filePath} | ${notes.join('; ')}` : filePath;
}
