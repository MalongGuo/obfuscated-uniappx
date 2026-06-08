import type { PathRenameEntry } from '../path/pages-json-sync.js';

function applyPathToString(value: string, renameLog: PathRenameEntry[]): string {
  let result = value;
  const sorted = [...renameLog].sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of sorted) {
    if (!from || from === to) continue;
    result = result.split(from).join(to);
  }
  return result;
}

function walk(value: unknown, renameLog: PathRenameEntry[]): unknown {
  if (typeof value === 'string') return applyPathToString(value, renameLog);
  if (Array.isArray(value)) return value.map((item) => walk(item, renameLog));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(child, renameLog);
    }
    return out;
  }
  return value;
}

/** 同步 tsconfig.json compilerOptions.paths */
export function syncTsconfigContent(content: string, renameLog: PathRenameEntry[]): string {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return content;
  }
  const compilerOptions = (data.compilerOptions as Record<string, unknown> | undefined) ?? {};
  if (compilerOptions.paths) {
    compilerOptions.paths = walk(compilerOptions.paths, renameLog) as Record<string, unknown>;
  }
  data.compilerOptions = compilerOptions;
  return `${JSON.stringify(data, null, 2)}\n`;
}
