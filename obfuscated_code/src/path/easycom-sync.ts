import type { PathRenameEntry } from './pages-json-sync.js';

export interface EasycomMapping {
  /** 原始组件标签，如 u-link */
  from: string;
  /** 混淆后标签（token 前缀），如 TOKENu-link */
  to: string;
  /** 混淆后主文件相对路径，如 components/TOKENu-link/TOKENu-link.vue */
  file: string;
}

const COMPONENT_EXTS = ['.vue', '.uvue', '.nvue'] as const;
const TEMPLATE_FILE_EXTS = new Set(['.vue', '.uvue', '.nvue']);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function findMainComponentFile(
  tag: string,
  newDir: string,
  fileMap: Map<string, string>,
): string | null {
  for (const ext of COMPONENT_EXTS) {
    const mapped = fileMap.get(`components/${tag}/${tag}${ext}`);
    if (mapped) return mapped;
  }

  const stemMapped = fileMap.get(`components/${tag}/${tag}`);
  if (stemMapped && COMPONENT_EXTS.some((ext) => stemMapped.endsWith(ext))) {
    return stemMapped;
  }

  for (const [fFrom, fTo] of fileMap) {
    if (!fTo.startsWith(`components/${newDir}/`)) continue;
    if (!COMPONENT_EXTS.some((ext) => fTo.endsWith(ext))) continue;
    const fromBase = fFrom.split('/').pop() ?? '';
    const fromStem = fromBase.replace(/\.(vue|uvue|nvue)$/, '');
    if (fromStem === tag) return fTo;
  }

  const obfuscatedValues = new Set(fileMap.values());
  for (const ext of COMPONENT_EXTS) {
    const candidate = `components/${newDir}/${newDir}${ext}`;
    if (obfuscatedValues.has(candidate)) return candidate;
  }

  return null;
}

/** 从 components 目录重命名日志生成组件标签映射：u-link → TOKENu-link */
export function buildEasycomMappings(
  mappings: PathRenameEntry[],
  fileMappings: PathRenameEntry[],
): EasycomMapping[] {
  const fileMap = new Map<string, string>();
  for (const { from, to } of fileMappings) {
    if (from && to) fileMap.set(normalize(from), normalize(to));
  }

  const results: EasycomMapping[] = [];
  const seen = new Set<string>();

  for (const { from, to } of mappings) {
    const normFrom = normalize(from);
    const match = normFrom.match(/^components\/([^/]+)$/);
    if (!match) continue;

    const tag = match[1]!;
    if (seen.has(tag)) continue;

    const newName = normalize(to).split('/').pop()!;
    const mainFile = findMainComponentFile(tag, newName, fileMap);
    if (!mainFile) continue;

    seen.add(tag);
    results.push({ from: tag, to: newName, file: mainFile });
  }

  return results.sort((a, b) => a.from.localeCompare(b.from));
}

/** 将模板中的组件标签同步为混淆后名称：<u-link> → <TOKENu-link> */
export function syncComponentTags(content: string, mappings: EasycomMapping[]): string {
  if (mappings.length === 0) return content;

  const sorted = [...mappings].sort((a, b) => b.from.length - a.from.length);
  let result = content;
  for (const { from, to } of sorted) {
    if (!from || from === to) continue;
    const esc = escapeRegex(from);
    result = result.replace(new RegExp(`</${esc}>`, 'g'), `</${to}>`);
    result = result.replace(new RegExp(`<${esc}(?=\\s|>|/)`, 'g'), `<${to}`);
  }
  return result;
}

export function isTemplateFile(relFile: string): boolean {
  const dot = relFile.lastIndexOf('.');
  if (dot < 0) return false;
  return TEMPLATE_FILE_EXTS.has(relFile.slice(dot).toLowerCase());
}

/** 移除 clone 早期写入的 easycom.custom，改由标签同步 + autoscan 解析 */
export function stripEasycomBlock(content: string): string {
  if (!content.includes('"easycom"')) return content;
  return content.replace(/\t"easycom"\s*:\s*\{[\s\S]*?\n\t\},?\n?/, '');
}
