import _traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import { shouldKeepSymbol } from '../whitelist/builtin.js';
import { isRenamableIdentifier } from '../transforms/rename-map.js';
import type { ParsedFile, ParsedVueSfc } from '../parser/types.js';
import { makeSymbolKey } from './keys.js';
import type { SymbolEntry, SymbolKind, SymbolOccurrence } from './types.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

function addSymbol(
  map: Map<string, SymbolEntry>,
  file: string,
  name: string,
  kind: SymbolKind,
  occurrence: SymbolOccurrence,
  opts?: { exported?: boolean; importedFrom?: string; renameable?: boolean },
): void {
  if (!name || name === 'default') return;

  const normalizedFile = file.replace(/\\/g, '/');
  const key = makeSymbolKey(normalizedFile, name);
  const existing = map.get(key);
  if (existing) {
    existing.occurrences.push(occurrence);
    if (opts?.exported) existing.exported = true;
    if (opts?.importedFrom) existing.importedFrom = opts.importedFrom;
    if (opts?.renameable === false) existing.renameable = false;
    return;
  }

  map.set(key, {
    name,
    file: normalizedFile,
    kind,
    occurrences: [occurrence],
    exported: opts?.exported ?? false,
    importedFrom: opts?.importedFrom,
    renameable: opts?.renameable ?? true,
  });
}

function applyWhitelist(
  map: Map<string, SymbolEntry>,
  customWhitelist: string[],
  extraFrameworkPrefixes: string[],
): void {
  for (const entry of map.values()) {
    if (shouldKeepSymbol(entry.name, customWhitelist, extraFrameworkPrefixes)) {
      entry.renameable = false;
    }
  }
}

/** 收集 $callMethod("methodName") 中的方法名，调用方以字符串引用，不能重命名 */
function collectCallMethodApiNames(parsedFiles: ParsedFile[]): Set<string> {
  const names = new Set<string>();
  for (const parsed of parsedFiles) {
    if (parsed.kind === 'module') {
      if (parsed.ast?.type === 'File') {
        collectCallMethodNamesFromAst(parsed.ast, names);
      }
      continue;
    }
    for (const script of parsed.scripts) {
      if (script.ast?.type === 'File') {
        collectCallMethodNamesFromAst(script.ast, names);
      }
    }
  }
  return names;
}

function collectCallMethodNamesFromAst(ast: t.File, names: Set<string>): void {
  try {
    traverse(ast, {
      noScope: true,
      CallExpression(path: NodePath<t.CallExpression>) {
        const cal = path.node.callee;
        if (cal.type !== 'MemberExpression') return;
        const prop = cal.property;
        if (prop.type !== 'Identifier' || prop.name !== '$callMethod') return;
        const arg = path.node.arguments[0];
        if (arg?.type === 'StringLiteral' && arg.value) {
          names.add(arg.value);
        }
      },
    });
  } catch {
    // 跳过无法遍历的 AST
  }
}

function locOf(node: t.Node): { line?: number; column?: number } {
  return {
    line: node.loc?.start.line,
    column: node.loc?.start.column,
  };
}

function collectFromAst(
  ast: t.File,
  file: string,
  map: Map<string, SymbolEntry>,
  customWhitelist: string[],
  scope = 'module',
): void {
  const normalizedFile = file.replace(/\\/g, '/');
  try {
    traverse(ast, {
      noScope: true,
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        const name = path.node.id?.name;
        if (!name) return;
        addSymbol(map, normalizedFile, name, 'function', { file: normalizedFile, kind: 'function', scope, ...locOf(path.node) });
      },
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        const name = path.node.id?.name;
        if (!name) return;
        addSymbol(map, normalizedFile, name, 'class', { file: normalizedFile, kind: 'class', scope, ...locOf(path.node) });
      },
      TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
        const name = path.node.id.name;
        addSymbol(map, normalizedFile, name, 'class', { file: normalizedFile, kind: 'class', scope, ...locOf(path.node) });
      },
      TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
        const name = path.node.id.name;
        addSymbol(map, normalizedFile, name, 'class', { file: normalizedFile, kind: 'class', scope, ...locOf(path.node) });
      },
      TSEnumDeclaration(path: NodePath<t.TSEnumDeclaration>) {
        const name = path.node.id.name;
        addSymbol(map, normalizedFile, name, 'class', { file: normalizedFile, kind: 'class', scope, ...locOf(path.node) });
      },
      ClassMethod(path: NodePath<t.ClassMethod>) {
        const name = path.node.key.type === 'Identifier' ? path.node.key.name : undefined;
        if (!name || path.node.kind === 'constructor') return;
        addSymbol(map, normalizedFile, name, 'function', { file: normalizedFile, kind: 'function', scope: 'class-method', ...locOf(path.node) });
      },
      ObjectMethod(path: NodePath<t.ObjectMethod>) {
        const name = path.node.key.type === 'Identifier' ? path.node.key.name : undefined;
        if (!name) return;
        addSymbol(map, normalizedFile, name, 'function', { file: normalizedFile, kind: 'function', scope: 'object-method', ...locOf(path.node) });
      },
      ObjectProperty(path: NodePath<t.ObjectProperty>) {
        if (path.node.key.type !== 'Identifier') return;
        const name = path.node.key.name;
        const value = path.node.value;
        const isFunction =
          value.type === 'FunctionExpression' ||
          value.type === 'ArrowFunctionExpression';

        const isPropsChild = path.findParent((p) => {
          if (!p.isObjectProperty()) return false;
          const k = p.node.key;
          return k.type === 'Identifier' && k.name === 'props';
        }) != null;

        addSymbol(
          map,
          normalizedFile,
          name,
          isFunction ? 'function' : 'property',
          { file: normalizedFile, kind: isFunction ? 'function' : 'property', scope: 'object-property', ...locOf(path.node) },
          isPropsChild ? { renameable: false } : undefined,
        );
      },
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (path.node.id.type !== 'Identifier') return;
        const name = path.node.id.name;
        const init = path.node.init;
        const isFunction =
          init?.type === 'FunctionExpression' ||
          init?.type === 'ArrowFunctionExpression';
        if (!isFunction) {
          addSymbol(map, normalizedFile, name, 'local', { file: normalizedFile, kind: 'local', scope, ...locOf(path.node) });
          return;
        }
        addSymbol(map, normalizedFile, name, 'function', { file: normalizedFile, kind: 'function', scope, ...locOf(path.node) });
      },
      ImportSpecifier(path: NodePath<t.ImportSpecifier>) {
        const imported = path.node.imported.type === 'Identifier' ? path.node.imported.name : undefined;
        const local = path.node.local.name;
        if (imported) {
          addSymbol(map, normalizedFile, local, 'import', {
            file: normalizedFile,
            kind: 'import',
            scope: 'import',
            ...locOf(path.node),
          }, { importedFrom: imported, renameable: false });
        }
      },
      ImportDefaultSpecifier(path: NodePath<t.ImportDefaultSpecifier>) {
        addSymbol(map, normalizedFile, path.node.local.name, 'import', {
          file: normalizedFile,
          kind: 'import',
          scope: 'import',
          ...locOf(path.node),
        }, { renameable: false });
      },
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const decl = path.node.declaration;
        if (decl?.type === 'FunctionDeclaration' && decl.id) {
          addSymbol(map, normalizedFile, decl.id.name, 'function', {
            file: normalizedFile,
            kind: 'export',
            scope: 'export',
            ...locOf(path.node),
          }, { exported: true });
        }
        if (decl?.type === 'ClassDeclaration' && decl.id) {
          addSymbol(map, normalizedFile, decl.id.name, 'class', {
            file: normalizedFile,
            kind: 'export',
            scope: 'export',
            ...locOf(path.node),
          }, { exported: true });
        }
        if (decl?.type === 'TSTypeAliasDeclaration' && decl.id.type === 'Identifier') {
          addSymbol(map, normalizedFile, decl.id.name, 'class', {
            file: normalizedFile,
            kind: 'export',
            scope: 'export',
            ...locOf(path.node),
          }, { exported: true });
        }
        if (decl?.type === 'TSInterfaceDeclaration' && decl.id.type === 'Identifier') {
          addSymbol(map, normalizedFile, decl.id.name, 'class', {
            file: normalizedFile,
            kind: 'export',
            scope: 'export',
            ...locOf(path.node),
          }, { exported: true });
        }
        if (decl?.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type === 'Identifier') {
              addSymbol(map, normalizedFile, d.id.name, 'local', {
                file: normalizedFile,
                kind: 'export',
                scope: 'export',
                ...locOf(d),
              }, { exported: true });
            }
          }
        }
      },
    });
  } catch {
    // 部分 uvue/uts 源码含合法重复绑定名，跳过该文件 AST 收集
    return;
  }
}

function collectFromParsedFile(
  parsed: ParsedFile,
  map: Map<string, SymbolEntry>,
  customWhitelist: string[],
): void {
  if (parsed.kind === 'module') {
    if (parsed.ast?.type === 'File') {
      collectFromAst(parsed.ast, parsed.relativePath, map, customWhitelist);
    }
    return;
  }

  collectFromVueSfc(parsed, map, customWhitelist);
}

function collectFromVueSfc(
  parsed: ParsedVueSfc,
  map: Map<string, SymbolEntry>,
  customWhitelist: string[],
): void {
  const normalizedFile = parsed.relativePath.replace(/\\/g, '/');
  for (const script of parsed.scripts) {
    if (script.ast?.type === 'File') {
      collectFromAst(script.ast, normalizedFile, map, customWhitelist, 'vue-script');
    }
  }

  for (const name of parsed.templateIdentifiers) {
    if (!isRenamableIdentifier(name)) continue;
    addSymbol(map, normalizedFile, name, 'template-ref', {
      file: normalizedFile,
      kind: 'template-ref',
      scope: 'template',
    });
  }
}

export function collectSymbols(
  parsedFiles: ParsedFile[],
  customWhitelist: string[] = [],
  extraFrameworkPrefixes: string[] = [],
): Map<string, SymbolEntry> {
  const callMethodApis = collectCallMethodApiNames(parsedFiles);
  const mergedWhitelist = [...customWhitelist, ...callMethodApis];
  const map = new Map<string, SymbolEntry>();
  for (const parsed of parsedFiles) {
    collectFromParsedFile(parsed, map, mergedWhitelist);
  }
  applyWhitelist(map, mergedWhitelist, extraFrameworkPrefixes);
  return map;
}
