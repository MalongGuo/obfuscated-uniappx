import _traverseModule from '@babel/traverse';
import _generateModule from '@babel/generator';
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import type { RenameMap } from './rename-map.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = _traverseModule.default as unknown as TraverseFn;
type GenerateFn = (
  ast: t.File,
  opts?: Parameters<typeof _generateModule.default>[1],
  code?: string,
) => { code: string };

const generate = (_generateModule.default ?? _generateModule) as unknown as GenerateFn;

const VUE_OPTION_KEYS = new Set([
  'data', 'methods', 'computed', 'watch', 'props', 'components', 'mixins',
  'filters', 'directives', 'provide', 'inject', 'emits', 'expose', 'setup',
]);

function isUnderVuePropsDefinition(path: NodePath<t.Node>): boolean {
  return path.findParent((parent) => {
    if (!parent.isObjectProperty()) return false;
    const key = parent.node.key;
    return key.type === 'Identifier' && key.name === 'props';
  }) != null;
}

function renameVueOptionKeys(path: NodePath<t.ObjectProperty>, renameMap: RenameMap): void {
  const key = path.node.key;
  if (key.type !== 'Identifier' || !VUE_OPTION_KEYS.has(key.name)) return;

  // props 键名是组件对外接口，重命名会导致父页面 prop 绑定失效
  if (key.name === 'props') return;

  const value = path.node.value;
  if (value.type !== 'ObjectExpression' && value.type !== 'FunctionExpression' && value.type !== 'ArrowFunctionExpression') {
    return;
  }

  const container = value.type === 'ObjectExpression' ? value : null;
  if (!container) return;

  for (const prop of container.properties) {
    if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
      const next = renameMap.get(prop.key.name);
      if (next) prop.key.name = next;
    }
    if (prop.type === 'ObjectMethod' && prop.key.type === 'Identifier') {
      const next = renameMap.get(prop.key.name);
      if (next) prop.key.name = next;
    }
  }
}

function extractDataReturnObject(
  node: t.ObjectProperty | t.ObjectMethod,
): t.ObjectExpression | null {
  if (node.type === 'ObjectMethod') {
    if (node.body.type !== 'BlockStatement') return null;
    for (const stmt of node.body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ObjectExpression') {
        return stmt.argument;
      }
    }
    return null;
  }

  const value = node.value;
  if (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression') {
    const body = value.body;
    if (body.type === 'BlockStatement') {
      for (const stmt of body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ObjectExpression') {
          return stmt.argument;
        }
      }
    } else if (body.type === 'ObjectExpression') {
      return body;
    }
  }
  return null;
}

function renameDataReturnProperties(
  path: NodePath<t.ObjectProperty | t.ObjectMethod>,
  renameMap: RenameMap,
): void {
  const key = path.node.key;
  if (key.type !== 'Identifier' || key.name !== 'data') return;

  const returnExpr = extractDataReturnObject(path.node);
  if (!returnExpr) return;

  for (const prop of returnExpr.properties) {
    if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
      const next = renameMap.get(prop.key.name);
      if (next) prop.key.name = next;
    }
  }
}

function safeScopeRename(path: NodePath, name: string, next: string): void {
  if (!path.scope.hasBinding(name)) return;
  try {
    path.scope.rename(name, next);
  } catch {
    // 作用域冲突时跳过
  }
}

/** 对 AST 应用重命名（不生成代码） */
export function applyRenamesToAst(
  ast: t.File,
  renameMap: RenameMap,
  renameProtocol = false,
): void {
  if (renameMap.size === 0) return;

  try {
    traverse(ast, {
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        if (path.node.key.type === 'Identifier' && isUnderVuePropsDefinition(path)) {
          return;
        }
        renameVueOptionKeys(path, renameMap);
        renameDataReturnProperties(path, renameMap);
      },
      ObjectMethod(path: NodePath<t.ObjectMethod>) {
        renameDataReturnProperties(path, renameMap);
        if (path.node.key.type === 'Identifier') {
          const next = renameMap.get(path.node.key.name);
          if (next) path.node.key.name = next;
        }
      },
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (
          path.node.object.type === 'ThisExpression' &&
          path.node.property.type === 'Identifier' &&
          !path.node.computed
        ) {
          const next = renameMap.get(path.node.property.name);
          if (next) path.node.property.name = next;
        }
      },
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        const name = path.node.id?.name;
        if (!name) return;
        const next = renameMap.get(name);
        if (!next) return;
        safeScopeRename(path, name, next);
      },
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        const name = path.node.id?.name;
        if (!name) return;
        const next = renameMap.get(name);
        if (!next) return;
        safeScopeRename(path, name, next);
      },
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (path.node.id.type !== 'Identifier') return;
        const name = path.node.id.name;
        const next = renameMap.get(name);
        if (!next) return;
        const binding = path.scope.getBinding(name);
        if (binding?.kind === 'param') return;
        safeScopeRename(path, name, next);
      },
      ImportSpecifier(path: NodePath<t.ImportSpecifier>) {
        const local = path.node.local.name;
        const next = renameMap.get(local);
        if (!next) return;
        safeScopeRename(path, local, next);
      },
      ImportDefaultSpecifier(path: NodePath<t.ImportDefaultSpecifier>) {
        const local = path.node.local.name;
        const next = renameMap.get(local);
        if (!next) return;
        safeScopeRename(path, local, next);
      },
      ImportNamespaceSpecifier(path: NodePath<t.ImportNamespaceSpecifier>) {
        const local = path.node.local.name;
        const next = renameMap.get(local);
        if (!next) return;
        safeScopeRename(path, local, next);
      },
      ...(renameProtocol
        ? {
            TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
              const name = path.node.id.name;
              const next = renameMap.get(name);
              if (next) path.node.id.name = next;
            },
            TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
              const name = path.node.id.name;
              const next = renameMap.get(name);
              if (next) path.node.id.name = next;
            },
            TSEnumDeclaration(path: NodePath<t.TSEnumDeclaration>) {
              const name = path.node.id.name;
              const next = renameMap.get(name);
              if (next) path.node.id.name = next;
            },
          }
        : {}),
    });
  } catch {
    // 作用域构建失败时，仅保留 ObjectProperty / MemberExpression 改写
  }
}

export function renameScriptAst(ast: t.File, renameMap: RenameMap, originalCode?: string): string {
  if (renameMap.size === 0) {
    return originalCode ?? generate(ast).code;
  }

  applyRenamesToAst(ast, renameMap, false);

  const result = generate(ast, {
    retainLines: true,
    comments: true,
  }, originalCode);
  return result.code;
}
