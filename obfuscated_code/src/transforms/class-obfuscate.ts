import { createHash } from 'node:crypto';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { obfuscateColorValuesDetailed } from './color-obfuscate.js';

/** 仅匹配静态 class=""，排除 :class 动态绑定 */
const CLASS_ATTR_RE = /(?<![:\w-])class\s*=\s*"([^"]*)"/g;
const CLASS_ATTR_SINGLE_RE = /(?<![:\w-])class\s*=\s*'([^']*)'/g;
const STYLE_SELECTOR_RE = /\.([a-zA-Z_][\w-]*)(?=[\s{,:#.>+~[\];]|$)/g;
const STYLE_EXTEND_RE = /@extend\s+\.([a-zA-Z_][\w-]*)\s*;/g;

const SKIP_CLASS_PREFIXES: string[] = ['uni-'];
const SKIP_EXACT = new Set<string>();

/** 模板别名：样式仅定义在同义 class 上（如 ux-column），避免 hash 后无 CSS */
const TEMPLATE_CLASS_ALIASES: Record<string, string> = {
  'ux-flex-col': 'ux-column',
};

const CLASS_PROP_ATTR_RE =
  /((?::(?:customClass|placeholderClass)|v-bind:(?:customClass|placeholderClass))\s*=\s*)(["'])((?:\\.|(?!\2)[^\\])*)\2/g;

function isAlreadyObfuscatedClass(name: string): boolean {
  return /^c[a-f0-9]{10}$/.test(name);
}

function isScssInterpolationLine(line: string): boolean {
  return line.includes('#{$');
}

/** 是否可参与 class 重命名（目录/路径白名单不影响样式 class 名） */
function canonicalClassName(name: string): string {
  return TEMPLATE_CLASS_ALIASES[name] ?? name;
}

function isRenamableClassName(name: string): boolean {
  if (!name || isAlreadyObfuscatedClass(name)) return false;
  if (name.startsWith('data-obf')) return false;
  if (SKIP_EXACT.has(name)) return false;
  if (SKIP_CLASS_PREFIXES.some((p) => name.startsWith(p))) return false;
  return true;
}

/** 收集阶段：包含 uni- 等仅跳过重命名的 class */
function isCollectableClassName(name: string): boolean {
  if (!name || isAlreadyObfuscatedClass(name)) return false;
  if (name.startsWith('data-obf')) return false;
  if (SKIP_EXACT.has(name)) return false;
  return true;
}

function resolveClassHash(name: string, renameMap: Map<string, string>): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const direct = renameMap.get(trimmed);
  if (direct != null) return direct;
  const aliasTarget = TEMPLATE_CLASS_ALIASES[trimmed];
  if (aliasTarget != null) {
    const aliased = renameMap.get(aliasTarget);
    if (aliased != null) return aliased;
  }
  return trimmed;
}

/** @deprecated 使用 isRenamableClassName */
function isProtectedClassName(name: string): boolean {
  return !isRenamableClassName(name);
}

/** inline style 属性名，与 utility class 同名时不可做裸字符串 class 同步 */
const CSS_INLINE_STYLE_KEYS = new Set([
  'height', 'width', 'opacity', 'position', 'top', 'left', 'right', 'bottom',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'backgroundColor', 'color', 'display', 'flexDirection', 'alignItems',
  'justifyContent', 'minHeight', 'maxHeight', 'minWidth', 'maxWidth',
  'boxSizing', 'zIndex', 'transform', 'transition', 'overflow',
  'fontSize', 'lineHeight', 'fontWeight', 'borderRadius',
]);

/** 裸 class 字符串是否应参与 script 同步（排除 CSS 属性名等误伤） */
function shouldRemapBareClassString(inner: string, renameMap: Map<string, string>): boolean {
  if (!renameMap.has(inner)) return false;
  if (CSS_INLINE_STYLE_KEYS.has(inner)) return false;
  // 典型 class token 含连字符；短单词更可能是 style key / 普通字符串
  if (!inner.includes('-') && inner.length <= 16) return false;
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STYLE_REGION_PLACEHOLDER = '\x00R';

/** 屏蔽引号字符串，避免 style.h5.scss 等 @import 路径被误识别为 class */
function maskStyleLiteralRegions(content: string): { masked: string; regions: string[] } {
  const regions: string[] = [];
  const placeholder = (raw: string) => {
    const idx = regions.length;
    regions.push(raw);
    return `${STYLE_REGION_PLACEHOLDER}${idx}${STYLE_REGION_PLACEHOLDER}`;
  };

  let masked = content;
  masked = masked.replace(/"(?:[^"\\]|\\.)*"/g, placeholder);
  masked = masked.replace(/'(?:[^'\\]|\\.)*'/g, placeholder);
  return { masked, regions };
}

function unmaskStyleLiteralRegions(masked: string, regions: string[]): string {
  return masked.replace(
    new RegExp(`${STYLE_REGION_PLACEHOLDER}(\\d+)${STYLE_REGION_PLACEHOLDER}`, 'g'),
    (_m, index: string) => regions[Number(index)] ?? _m,
  );
}

export function obfuscateCssClassToken(className: string, seed: string | null, salt: string): string {
  const hash = createHash('sha256').update(`${seed ?? 'cls'}:${salt}:${className}`).digest('hex').slice(0, 10);
  return `c${hash}`;
}

function collectClassNamesFromBindingExpression(expr: string, names: Set<string>): void {
  expr.replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g, (quoted) => {
    const inner = quoted.slice(1, -1);
    if (inner.includes(' ') || inner.includes('\t')) {
      for (const part of inner.split(/\s+/)) {
        const c = part.trim();
        if (c && isCollectableClassName(c)) names.add(canonicalClassName(c));
      }
    } else if (inner && isCollectableClassName(inner)) {
      names.add(canonicalClassName(inner));
    }
    return quoted;
  });
}

export function extractTemplateClassNames(template: string): Set<string> {
  const names = new Set<string>();
  const collect = (raw: string) => {
    for (const part of raw.split(/\s+/)) {
      const c = part.trim();
      if (!c || !isCollectableClassName(c)) continue;
      names.add(canonicalClassName(c));
    }
  };
  for (const re of [CLASS_ATTR_RE, CLASS_ATTR_SINGLE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) {
      collect(m[1]!);
    }
  }
  CLASS_PROP_ATTR_RE.lastIndex = 0;
  let propMatch: RegExpExecArray | null;
  while ((propMatch = CLASS_PROP_ATTR_RE.exec(template)) !== null) {
    collectClassNamesFromBindingExpression(propMatch[3]!, names);
  }
  return names;
}

function collectStyleClassMatches(line: string, names: Set<string>): void {
  STYLE_SELECTOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STYLE_SELECTOR_RE.exec(line)) !== null) {
    const c = m[1]!;
    if (isRenamableClassName(c)) names.add(c);
  }
  STYLE_EXTEND_RE.lastIndex = 0;
  while ((m = STYLE_EXTEND_RE.exec(line)) !== null) {
    const c = m[1]!;
    if (isRenamableClassName(c)) names.add(c);
  }
}

export function extractStyleClassNames(style: string): Set<string> {
  const names = new Set<string>();
  const { masked } = maskStyleLiteralRegions(style);
  for (const line of masked.split('\n')) {
    if (isScssInterpolationLine(line)) continue;
    collectStyleClassMatches(line, names);
  }
  return names;
}

export function buildClassRenameMap(
  classNames: Iterable<string>,
  seed: string | null,
  salt: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of classNames) {
    if (!isRenamableClassName(name)) continue;
    map.set(name, obfuscateCssClassToken(name, seed, salt));
  }
  return map;
}

export function applyClassRenamesToTemplate(template: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return template;

  const remap = (raw: string) =>
    raw
      .split(/\s+/)
      .map((c) => resolveClassHash(c.trim(), renameMap))
      .filter(Boolean)
      .join(' ');

  let result = template.replace(CLASS_ATTR_RE, (_m, val: string) => `class="${remap(val)}"`);
  result = result.replace(CLASS_ATTR_SINGLE_RE, (_m, val: string) => `class='${remap(val)}'`);
  result = applyClassRenamesToDynamicClass(result, renameMap);
  result = result.replace(
    CLASS_PROP_ATTR_RE,
    (match, prefix: string, quote: string, expr: string) => {
      const renamed = renameClassBindingExpression(expr, renameMap);
      return renamed === expr ? match : `${prefix}${quote}${renamed}${quote}`;
    },
  );
  return result;
}

const DYNAMIC_CLASS_ATTR_RE = /((?::class|v-bind:class)\s*=\s*)"((?:[^"\\]|\\.)*)"/g;

function remapQuotedClassTokens(inner: string, renameMap: Map<string, string>): string {
  if (!inner.trim()) return inner;
  return inner
    .split(/\s+/)
    .map((token) => resolveClassHash(token, renameMap))
    .filter(Boolean)
    .join(' ');
}

/** 同步 :class / v-bind:class 动态绑定中的类名（object key 与引号字符串） */
export function applyClassRenamesToDynamicClass(template: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return template;

  return template.replace(DYNAMIC_CLASS_ATTR_RE, (match, attr: string, expr: string) => {
    const renamed = renameClassBindingExpression(expr, renameMap);
    return renamed === expr ? match : `${attr}"${renamed}"`;
  });
}

export function renameClassBindingExpression(expr: string, renameMap: Map<string, string>): string {
  let result = expr.replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g, (quoted) => {
    const quote = quoted[0]!;
    const inner = quoted.slice(1, -1);
    const remapped = remapQuotedClassTokens(inner, renameMap);
    return remapped !== inner ? `${quote}${remapped}${quote}` : quoted;
  });

  result = result.replace(/([{,]\s*)([a-zA-Z_$][\w-]*)(\s*:)/g, (m, before: string, key: string, colon: string) => {
    const mapped = renameMap.get(key);
    return mapped != null ? `${before}${mapped}${colon}` : m;
  });

  return result;
}

/** CSS 选择器字符串（如 .category-section 或 .sidebar .item） */
function isCssSelectorString(value: string): boolean {
  if (!value.includes('.')) return false;
  return /^[\s.#>+~[\]:(),\w-]+$/.test(value);
}

function remapSelectorString(selector: string, renameMap: Map<string, string>): string {
  if (!isCssSelectorString(selector)) return selector;
  const sorted = [...renameMap.keys()].sort((a, b) => b.length - a.length);
  let result = selector;
  for (const oldName of sorted) {
    const newName = renameMap.get(oldName)!;
    const re = new RegExp(`\\.${escapeRegex(oldName)}(?=[\\s.#\\[>,+~]|$)`, 'g');
    result = result.replace(re, `.${newName}`);
  }
  return result;
}

/** 同步 script 中 createSelectorQuery 等使用的 class 选择器字符串，以及 :class 绑定的裸类名字符串 */
export function applyClassRenamesToScript(script: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return script;

  return script.replace(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, (match, quote: string, inner: string) => {
    let remapped = remapSelectorString(inner, renameMap);
    if (remapped === inner && shouldRemapBareClassString(inner, renameMap)) {
      remapped = renameMap.get(inner)!;
    }
    return remapped === inner ? match : `${quote}${remapped}${quote}`;
  });
}

function applyClassRenamesToStyleLine(line: string, renameMap: Map<string, string>): string {
  const sorted = [...renameMap.keys()].sort((a, b) => b.length - a.length);
  let result = line;
  for (const oldName of sorted) {
    if (!result.includes(oldName)) continue;
    const newName = renameMap.get(oldName)!;
    const selectorRe = new RegExp(`\\.${escapeRegex(oldName)}(?=[\\s{,:#.>+~\\[;]|$)`, 'g');
    result = result.replace(selectorRe, `.${newName}`);
    const extendRe = new RegExp(`(@extend\\s+)\\.${escapeRegex(oldName)}(\\s*;)`, 'g');
    result = result.replace(extendRe, `$1.${newName}$2`);
  }
  return result;
}

export function applyClassRenamesToStyle(style: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return style;

  const { masked, regions } = maskStyleLiteralRegions(style);
  const result = masked
    .split('\n')
    .map((line) => (isScssInterpolationLine(line) ? line : applyClassRenamesToStyleLine(line, renameMap)))
    .join('\n');
  return applyScssMapClassValueRenames(unmaskStyleLiteralRegions(result, regions), renameMap);
}

/** SCSS map 裸 token 值（如 $theme-list 的 theme-ls-user）用于 .#{$var} 插值，需同步为混淆名 */
export function applyScssMapClassValueRenames(content: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return content;
  return content.replace(
    /^(\s*"[^"]+":\s*)([a-zA-Z_][\w-]*)(\s*,?\s*)$/gm,
    (match, prefix: string, value: string, suffix: string) => {
      const mapped = renameMap.get(value);
      return mapped != null ? `${prefix}${mapped}${suffix}` : match;
    },
  );
}

export interface VueClassStyleObfuscateResult {
  content: string;
  classRenames: Array<{ from: string; to: string }>;
  colorSample?: string;
  changed: boolean;
}

function collectStyleBodies(content: string): string[] {
  const bodies: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    bodies.push(m[1]!);
  }
  return bodies;
}

/** template + style 块 class 联动重命名，并对 style 做颜色微扰 */
export function obfuscateVueClassAndStyleBlocks(
  content: string,
  seed: string | null,
  fileSalt: string,
  options: {
    renameClasses?: boolean;
    nudgeColors?: boolean;
    /** css/scss 全局 class 映射（stylesheet 加强阶段产出） */
    globalClassMap?: Map<string, string>;
  } = {},
): VueClassStyleObfuscateResult {
  const { renameClasses = true, nudgeColors = false, globalClassMap } = options;
  let changed = false;
  let colorSample: string | undefined;

  const { descriptor } = parseSfc(content, { filename: fileSalt });
  const templateBlock = descriptor.template;
  const templateBody = templateBlock?.content ?? '';

  const classSet = new Set<string>();
  if (renameClasses) {
    for (const c of extractTemplateClassNames(templateBody)) classSet.add(c);
    for (const style of collectStyleBodies(content)) {
      for (const c of extractStyleClassNames(style)) classSet.add(c);
    }
  }

  const renameMap = new Map<string, string>();
  if (globalClassMap) {
    for (const [from, to] of globalClassMap) {
      if (isRenamableClassName(from)) renameMap.set(from, to);
    }
  }
  if (renameClasses) {
    for (const name of classSet) {
      if (!isRenamableClassName(name)) continue;
      if (renameMap.has(name)) continue;
      renameMap.set(name, obfuscateCssClassToken(name, seed, fileSalt));
    }
  } else if (globalClassMap) {
    for (const name of classSet) {
      if (!isRenamableClassName(name)) continue;
      const mapped = globalClassMap.get(name);
      if (mapped) renameMap.set(name, mapped);
    }
  }

  const classRenames = [...renameMap.entries()]
    .filter(([from]) => isRenamableClassName(from) && (classSet.has(from) || globalClassMap?.has(from)))
    .map(([from, to]) => ({ from, to }));

  let updated = content;

  if (renameMap.size > 0 && templateBlock?.loc) {
    const newTemplate = applyClassRenamesToTemplate(templateBody, renameMap);
    if (newTemplate !== templateBody) {
      changed = true;
      const start = templateBlock.loc.start.offset;
      const end = templateBlock.loc.end.offset;
      updated = updated.slice(0, start) + newTemplate + updated.slice(end);
    }
  }

  if (renameMap.size > 0) {
    updated = updated.replace(
      /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (_m, open: string, script: string, close: string) => {
        const nextScript = applyClassRenamesToScript(script, renameMap);
        if (nextScript === script) return _m;
        changed = true;
        return `${open}${nextScript}${close}`;
      },
    );
  }

  updated = updated.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, style: string, close: string) => {
      let nextStyle = style;
      if (renameMap.size > 0) {
        nextStyle = applyClassRenamesToStyle(nextStyle, renameMap);
      }
      if (nudgeColors) {
        const detailed = obfuscateColorValuesDetailed(nextStyle);
        if (detailed.sample && !colorSample) colorSample = detailed.sample;
        nextStyle = detailed.content;
      }
      if (nextStyle !== style) {
        changed = true;
        return `${open}${nextStyle}${close}`;
      }
      return _m;
    },
  );

  return { content: updated, classRenames, colorSample, changed };
}
