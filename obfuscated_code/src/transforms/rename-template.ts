import type { RenameMap } from './rename-map.js';
import { isRenamableIdentifier, JS_RESERVED_WORDS } from './rename-map.js';

const TEMPLATE_REGION_PLACEHOLDER = '\x00T';
const OBJECT_KEY_PLACEHOLDER = '\x00K';
const MEMBER_PROP_PLACEHOLDER = '\x00M';

/** 屏蔽引号字符串，避免误改 :class / 文案中的词 */
function maskTemplateQuotedStrings(template: string): { masked: string; regions: string[] } {
  const regions: string[] = [];
  const placeholder = (raw: string) => {
    const idx = regions.length;
    regions.push(raw);
    return `${TEMPLATE_REGION_PLACEHOLDER}${idx}${TEMPLATE_REGION_PLACEHOLDER}`;
  };

  let masked = template;
  masked = masked.replace(/"(?:[^"\\]|\\.)*"/g, placeholder);
  masked = masked.replace(/'(?:[^'\\]|\\.)*'/g, placeholder);
  return { masked, regions };
}

function unmaskTemplateQuotedStrings(masked: string, regions: string[]): string {
  return masked.replace(
    new RegExp(`${TEMPLATE_REGION_PLACEHOLDER}(\\d+)${TEMPLATE_REGION_PLACEHOLDER}`, 'g'),
    (_m, index: string) => regions[Number(index)] ?? _m,
  );
}

/** 按 token 替换表达式中的标识符，保留 ?.、运算符与字符串占位 */
function applyRenameMapToFragment(fragment: string, renameMap: RenameMap): string {
  if (renameMap.size === 0) return fragment;

  const { masked, regions } = maskTemplateQuotedStrings(fragment);
  const { masked: memberMasked, props } = maskMemberPropertyNames(masked);
  const renamed = memberMasked.replace(/[a-zA-Z_$][\w$]*/g, (token) => {
    if (JS_RESERVED_WORDS.has(token) || !isRenamableIdentifier(token)) return token;
    return renameMap.get(token) ?? token;
  });
  return unmaskMemberPropertyNames(unmaskTemplateQuotedStrings(renamed, regions), props);
}

/** 屏蔽 object literal 的 unquoted key，避免误改 CSS 属性名或 :class 类名键 */
function maskObjectLiteralKeys(fragment: string): { masked: string; keys: string[] } {
  const keys: string[] = [];
  const masked = fragment.replace(
    /([{,]\s*)([a-zA-Z_$][\w-]*)(\s*:)/g,
    (_m, before: string, key: string, colon: string) => {
      const idx = keys.length;
      keys.push(key);
      return `${before}${OBJECT_KEY_PLACEHOLDER}${idx}${OBJECT_KEY_PLACEHOLDER}${colon}`;
    },
  );
  return { masked, keys };
}

function unmaskObjectLiteralKeys(masked: string, keys: string[]): string {
  return masked.replace(
    new RegExp(`${OBJECT_KEY_PLACEHOLDER}(\\d+)${OBJECT_KEY_PLACEHOLDER}`, 'g'),
    (_m, index: string) => keys[Number(index)] ?? _m,
  );
}

/** 成员访问属性名（.id / .toString / ?.foo）不参与标识符重命名 */
function maskMemberPropertyNames(fragment: string): { masked: string; props: string[] } {
  const props: string[] = [];
  const masked = fragment.replace(/(\?\.|\.)([a-zA-Z_$][\w$]*)/g, (segment, sep: string, prop: string) => {
    const idx = props.length;
    props.push(prop);
    return `${sep}${MEMBER_PROP_PLACEHOLDER}${idx}${MEMBER_PROP_PLACEHOLDER}`;
  });
  return { masked, props };
}

function unmaskMemberPropertyNames(masked: string, props: string[]): string {
  return masked.replace(
    new RegExp(`${MEMBER_PROP_PLACEHOLDER}(\\d+)${MEMBER_PROP_PLACEHOLDER}`, 'g'),
    (_m, index: string) => props[Number(index)] ?? _m,
  );
}

function bindingKind(attr: string): 'style' | 'class' | null {
  if (attr === ':style' || attr === 'v-bind:style') return 'style';
  if (attr === ':class' || attr === 'v-bind:class') return 'class';
  return null;
}

/** :style 绑定：保留 object key（CSS 属性名），仅重命名 value 中的标识符 */
function applyRenameMapToStyleFragment(fragment: string, renameMap: RenameMap): string {
  const { masked, keys } = maskObjectLiteralKeys(fragment);
  const renamed = applyRenameMapToFragment(masked, renameMap);
  return unmaskObjectLiteralKeys(renamed, keys);
}

/** :class 绑定：保留 object key（类名由 class-obfuscate 阶段处理），仅重命名 value 中的标识符 */
function applyRenameMapToClassFragment(fragment: string, renameMap: RenameMap): string {
  const { masked, keys } = maskObjectLiteralKeys(fragment);
  const renamed = applyRenameMapToFragment(masked, renameMap);
  return unmaskObjectLiteralKeys(renamed, keys);
}

function renameBindingExpression(attr: string, expr: string, renameMap: RenameMap): string {
  const kind = bindingKind(attr);
  if (kind === 'style') {
    return applyRenameMapToStyleFragment(expr, renameMap);
  }
  if (kind === 'class') {
    return applyRenameMapToClassFragment(expr, renameMap);
  }
  return applyRenameMapToFragment(expr, renameMap);
}

/** v- / @ / : / v-bind: 动态绑定属性值（含 .stop / .prevent 等修饰符） */
const DYNAMIC_ATTR_RE =
  /(^|\s)((?:v-[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*|@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*|v-bind:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*|:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*))\s*=\s*"((?:[^"\\]|\\.)*)"/gm;

/** {{ mustache }} 表达式 */
const MUSTACHE_RE = /\{\{((?:[^"'{}]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')+)\}\}/g;

function renameVueBindingExpressions(template: string, renameMap: RenameMap): string {
  let result = template.replace(DYNAMIC_ATTR_RE, (match, prefix, attr, expr) => {
    const renamed = renameBindingExpression(attr, expr, renameMap);
    return renamed === expr ? match : `${prefix}${attr}="${renamed}"`;
  });

  result = result.replace(MUSTACHE_RE, (match, expr) => {
    const renamed = applyRenameMapToFragment(expr, renameMap);
    return renamed === expr ? match : `{{${renamed}}}`;
  });

  return result;
}

export function renameTemplate(template: string, renameMap: RenameMap): string {
  if (renameMap.size === 0) return template;

  // 仅处理 Vue 绑定表达式与 mustache；不再做全局词边界替换，避免误改属性名（:background、placeholder 等）
  return renameVueBindingExpressions(template, renameMap);
}
