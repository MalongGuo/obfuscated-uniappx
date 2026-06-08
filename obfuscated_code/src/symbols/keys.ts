/** 文件内符号唯一键：{relativePath}::{name} */
export function makeSymbolKey(file: string, name: string): string {
  return `${file.replace(/\\/g, '/')}::${name}`;
}

export function parseSymbolKey(key: string): { file: string; name: string } {
  const idx = key.indexOf('::');
  if (idx <= 0) return { file: '', name: key };
  return {
    file: key.slice(0, idx),
    name: key.slice(idx + 2),
  };
}

export function getSymbolEntry(
  symbols: Map<string, import('./types.js').SymbolEntry>,
  file: string,
  name: string,
) {
  return symbols.get(makeSymbolKey(file, name));
}
