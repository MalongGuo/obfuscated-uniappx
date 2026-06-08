import _traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { ObfuscatorConfig } from '../types/config.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

function isCssSelectorString(value: string): boolean {
  if (!value.includes('.')) return false;
  return /^[\s.#>+~[\]:(),\w-]+$/.test(value);
}

function shouldSkipString(value: string, config: ObfuscatorConfig): boolean {
  if (value.length === 0 || value.length > 64) return true;
  if (isCssSelectorString(value)) return true;
  if (config.stringEncrypt.skipTemplateStrings) return false;
  for (const prefix of config.stringEncrypt.whitelist) {
    if (value.startsWith(prefix)) return true;
  }
  if (!config.stringEncrypt.autoEncryptHttp && /^https?:\/\//.test(value)) return true;
  return false;
}

/** import/export/require 等模块路径必须保持 StringLiteral */
function mustStayStringLiteral(path: NodePath<t.StringLiteral>): boolean {
  const parent = path.parent;
  if (!parent) return false;

  if (
    (t.isImportDeclaration(parent) ||
      t.isExportAllDeclaration(parent) ||
      t.isExportNamedDeclaration(parent)) &&
    parent.source === path.node
  ) {
    return true;
  }

  if (t.isCallExpression(parent) && parent.arguments[0] === path.node) {
    const { callee } = parent;
    if (t.isIdentifier(callee) && callee.name === 'require') return true;
    if (t.isImport(callee)) return true;
  }

  if (t.isImportExpression(parent) && parent.source === path.node) return true;

  if (t.isObjectProperty(parent) && parent.key === path.node && !parent.computed) return true;

  if (t.isObjectMethod(parent) && parent.key === path.node && !parent.computed) return true;

  if (t.isClassMethod(parent) && parent.key === path.node && !parent.computed) return true;

  if (t.isClassProperty(parent) && parent.key === path.node && !parent.computed) return true;

  if (
    t.isObjectProperty(parent) &&
    parent.value === path.node &&
    !parent.computed &&
    t.isIdentifier(parent.key) &&
    ['position', 'type', 'icon', 'method', 'animationType', 'direction'].includes(parent.key.name)
  ) {
    return true;
  }

  if (t.isTSLiteralType(parent) && parent.literal === path.node) return true;

  if (t.isTSEnumMember(parent) && parent.initializer === path.node) return true;

  if (t.isTSModuleDeclaration(parent) && parent.id === path.node) return true;

  return false;
}

function isInTypeAnnotation(path: NodePath<t.StringLiteral>): boolean {
  let current: NodePath | null = path.parentPath;
  while (current) {
    if (current.isTSTypeAnnotation()) return true;
    current = current.parentPath;
  }
  return false;
}

function encryptToFromCharCode(value: string): t.CallExpression {
  const codes = [...value].map((c) => t.numericLiteral(c.charCodeAt(0)));
  return t.callExpression(
    t.memberExpression(t.identifier('String'), t.identifier('fromCharCode')),
    codes,
  );
}

/** 可读的 fromCharCode 表达式，用于 obfuscation-map-strings.json */
export function formatFromCharCodeExpr(value: string): string {
  const codes = [...value].map((c) => c.charCodeAt(0)).join(',');
  return `String.fromCharCode(${codes})`;
}

export type StringEncryptCollector = Map<string, string>;

/** 将字符串字面量替换为 String.fromCharCode(...)，并写入 collector */
export function encryptStringLiterals(
  ast: t.File,
  config: ObfuscatorConfig,
  collector?: StringEncryptCollector,
): void {
  if (!config.features.encryptAllStrings && !config.features.ciphertextStrings) return;

  traverse(ast, {
    noScope: true,
    RegExpLiteral() {
      /* 不进入正则字面量 */
    },
    StringLiteral(path: NodePath<t.StringLiteral>) {
      const value = path.node.value;
      if (shouldSkipString(value, config)) return;
      if (mustStayStringLiteral(path)) return;
      if (config.stringEncrypt.skipAnnotations && isInTypeAnnotation(path)) return;
      if (config.stringEncrypt.skipCaseLabels && path.parentPath.isSwitchCase()) return;
      collector?.set(value, formatFromCharCodeExpr(value));
      path.replaceWith(encryptToFromCharCode(value));
    },
  });
}

export function mergeStringEncryptCollectors(collectors: StringEncryptCollector[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of collectors) {
    for (const [literal, encrypted] of map) {
      merged[literal] = encrypted;
    }
  }
  return merged;
}
