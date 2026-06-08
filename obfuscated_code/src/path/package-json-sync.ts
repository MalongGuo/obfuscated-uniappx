import type { PathRenameEntry } from './pages-json-sync.js';

function applyPathToString(value: string, renameLog: PathRenameEntry[]): string {
  let result = value;
  const sorted = [...renameLog].sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of sorted) {
    if (!from || from === to) continue;
    result = result.split(`${from}/`).join(`${to}/`);
    result = result.split(`./${from}/`).join(`./${to}/`);
    result = result.split(`../${from}/`).join(`../${to}/`);
    if (from.includes('/')) {
      result = result.split(from).join(to);
    }
  }
  return result;
}

function walkAndReplaceStrings(value: unknown, renameLog: PathRenameEntry[]): unknown {
  if (typeof value === 'string') {
    return applyPathToString(value, renameLog);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkAndReplaceStrings(item, renameLog));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walkAndReplaceStrings(child, renameLog);
    }
    return out;
  }
  return value;
}

/** 修复被误替换的 npm scripts 字段名，并仅更新字符串值中的路径 */
export function syncPackageJsonContent(content: string, renameLog: PathRenameEntry[]): string {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return content;
  }

  if (!('scripts' in data)) {
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (key !== 'scripts' && key.endsWith('scripts') && val && typeof val === 'object' && !Array.isArray(val)) {
        data.scripts = val;
        delete data[key];
        break;
      }
    }
  }

  const updated = walkAndReplaceStrings(data, renameLog) as Record<string, unknown>;

  return `${JSON.stringify(updated, null, 2)}\n`;
}
