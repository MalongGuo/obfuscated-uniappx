/** 将 UTS 特有语法预处理为 Babel 可解析的 TypeScript 子集 */
export function preprocessUts(code: string): { code: string; applied: string[] } {
  const applied: string[] = [];
  let result = code;

  const rules: Array<{ name: string; pattern: RegExp; replacement: string }> = [
    { name: 'Int-type', pattern: /\bInt\b/g, replacement: 'number' },
    { name: 'Float-type', pattern: /\bFloat\b/g, replacement: 'number' },
    { name: 'Double-type', pattern: /\bDouble\b/g, replacement: 'number' },
    { name: 'Long-type', pattern: /\bLong\b/g, replacement: 'number' },
    { name: 'android-import', pattern: /^import\s+.+\s+from\s+['"]android\.[^'"]+['"];?\s*$/gm, replacement: '// $&' },
    { name: 'kotlin-import', pattern: /^import\s+.+\s+from\s+['"]kotlin\.[^'"]+['"];?\s*$/gm, replacement: '// $&' },
    { name: 'swift-import', pattern: /^import\s+.+\s+from\s+['"]Foundation['"];?\s*$/gm, replacement: '// $&' },
    { name: 'uts-optional-space', pattern: /(\w+)\s+\?:/g, replacement: '$1?:' },
    { name: 'uts-export-type', pattern: /^export\s+type\s+/gm, replacement: 'export type ' },
  ];

  for (const rule of rules) {
    const next = result.replace(rule.pattern, rule.replacement);
    if (next !== result) {
      applied.push(rule.name);
      result = next;
    }
  }

  return { code: result, applied };
}
