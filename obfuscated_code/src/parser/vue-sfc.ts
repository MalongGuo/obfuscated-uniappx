import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse as parseTemplateAst, type RootNode } from '@vue/compiler-dom';
import { extensionToLang, parseScript } from './babel.js';
import { isRenamableIdentifier } from '../transforms/rename-map.js';
import type { ParsedScript, ParsedVueSfc } from './types.js';

const VUE_EXTENSIONS = new Set(['.vue', '.uvue', '.nvue']);

export function isVueExtension(ext: string): boolean {
  return VUE_EXTENSIONS.has(ext);
}

function addIdentifier(names: Set<string>, raw: string | undefined | null, exclude?: Set<string>): void {
  if (!raw) return;
  const name = raw.split(/[.[(]/)[0]!;
  if (exclude?.has(name)) return;
  if (!isRenamableIdentifier(name)) return;
  names.add(name);
}

function collectVForAliasesFromExpression(expr: string, aliases: Set<string>): void {
  const trimmed = expr.trim();
  const inMatch = trimmed.match(/^([\s\S]+?)\s+in\s+/);
  if (inMatch) {
    const lhs = inMatch[1]!.trim().replace(/^\(|\)$/g, '');
    const aliasRe = /[a-zA-Z_$][\w$]*/g;
    let alias: RegExpExecArray | null;
    while ((alias = aliasRe.exec(lhs)) !== null) {
      aliases.add(alias[0]);
    }
    return;
  }
  const ofMatch = trimmed.match(/^([\s\S]+?)\s+of\s+/);
  if (ofMatch) {
    const lhs = ofMatch[1]!.trim().replace(/^\(|\)$/g, '');
    for (const part of lhs.split(',')) {
      const name = part.trim().split(/[.[(]/)[0]?.trim();
      if (name) aliases.add(name);
    }
  }
}

function collectVForAliases(template: string): Set<string> {
  const aliases = new Set<string>();
  const re = /v-for="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    collectVForAliasesFromExpression(match[1]!, aliases);
  }
  return aliases;
}

function collectIdentifiersFromExpression(expr: string, names: Set<string>, exclude?: Set<string>): void {
  const trimmed = expr.trim();
  if (!trimmed) return;

  if (/\s+in\s+/.test(trimmed) || /\s+of\s+/.test(trimmed)) {
    collectFromDirectiveExpression(trimmed, names, exclude);
    return;
  }

  const idRe = /[a-zA-Z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = idRe.exec(trimmed)) !== null) {
    addIdentifier(names, match[0], exclude);
  }
}

/** 从 v-for / v-slot 等表达式中提取标识符，避免整段 "item in list" 被当作符号名 */
function collectFromDirectiveExpression(expr: string, names: Set<string>, exclude?: Set<string>): void {
  const trimmed = expr.trim();
  if (!trimmed) return;

  const inMatch = trimmed.match(/\s+in\s+([\s\S]+)$/);
  if (inMatch) {
    addIdentifier(names, inMatch[1]!.trim(), exclude);
    return;
  }

  const ofMatch = trimmed.match(/\s+of\s+([\s\S]+)$/);
  if (ofMatch) {
    addIdentifier(names, ofMatch[1]!.trim(), exclude);
    return;
  }

  addIdentifier(names, trimmed.split(/[.[(?]/)[0], exclude);
}

function collectFromBindingExpression(expr: string, names: Set<string>, exclude?: Set<string>): void {
  collectIdentifiersFromExpression(expr, names, exclude);
}

function collectTemplateIdentifiersFallback(template: string, exclude: Set<string>): Set<string> {
  const names = new Set<string>();

  const patterns: Array<{ re: RegExp; pick: (match: RegExpExecArray) => string | undefined }> = [
    { re: /\{\{\s*([^}]+?)\s*\}\}/g, pick: (m) => m[1] },
    { re: /@[\w.-]+="([^"]+)"/g, pick: (m) => m[1] },
    { re: /v-for="([^"]+)"/g, pick: (m) => m[1] },
    { re: /v-[a-zA-Z0-9_-]+="([^"]+)"/g, pick: (m) => m[1] },
    { re: /:([\w-]+)="([^"]+)"/g, pick: (m) => m[2] },
  ];

  for (const { re, pick } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(template)) !== null) {
      const expr = pick(match);
      if (expr) collectFromBindingExpression(expr, names, exclude);
    }
  }

  return names;
}

function walkTemplate(
  node: RootNode | { type: number; props?: unknown[]; children?: unknown[] },
  names: Set<string>,
  exclude: Set<string>,
): void {
  const anyNode = node as {
    type: number;
    content?: unknown;
    props?: Array<{ type: number; name?: string; exp?: { content?: string } }>;
    children?: Array<{ type: number; content?: unknown; props?: unknown[]; children?: unknown[] }>;
  };

  if (anyNode.type === 5 && typeof anyNode.content === 'string') {
    collectFromBindingExpression(anyNode.content, names, exclude);
  }

  if (anyNode.props) {
    for (const prop of anyNode.props) {
      if (prop.exp?.content) {
        if (prop.name === 'for' || prop.name === 'slot') {
          collectFromDirectiveExpression(prop.exp.content, names, exclude);
        } else {
          collectFromBindingExpression(prop.exp.content, names, exclude);
        }
      }
    }
  }

  if (anyNode.children) {
    for (const child of anyNode.children) {
      walkTemplate(child as RootNode, names, exclude);
    }
  }
}

function collectTemplateIdentifiers(template: string): string[] {
  const vForAliases = collectVForAliases(template);
  const names = new Set<string>();
  try {
    const ast = parseTemplateAst(template, { comments: false });
    walkTemplate(ast, names, vForAliases);
  } catch {
    for (const name of collectTemplateIdentifiersFallback(template, vForAliases)) {
      names.add(name);
    }
  }
  return [...names].filter((n) => !vForAliases.has(n));
}

export function parseVueFile(
  content: string,
  relativePath: string,
  extension: string,
): ParsedVueSfc {
  const { descriptor, errors } = parseSfc(content, { filename: relativePath });
  if (errors.length > 0) {
    return {
      kind: extension === '.uvue' ? 'uvue' : extension === '.nvue' ? 'nvue' : 'vue',
      relativePath,
      template: descriptor.template?.content ?? null,
      scripts: [],
      templateIdentifiers: [],
    };
  }

  const scripts: ParsedScript[] = [];
  const blocks = [
    descriptor.script,
    descriptor.scriptSetup,
  ].filter(Boolean);

  for (const block of blocks) {
    const lang = extensionToLang(
      block!.lang === 'ts' ? '.ts' : block!.lang === 'uts' ? '.uts' : '.js',
    );
    const parsed = parseScript(block!.content, lang, relativePath);
    scripts.push({
      lang,
      content: block!.content,
      ast: parsed.ast,
      parseError: parsed.error,
    });
  }

  const template = descriptor.template?.content ?? null;
  const templateIdentifiers = template ? collectTemplateIdentifiers(template) : [];

  return {
    kind: extension === '.uvue' ? 'uvue' : extension === '.nvue' ? 'nvue' : 'vue',
    relativePath,
    template,
    scripts,
    templateIdentifiers,
  };
}
