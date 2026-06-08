import path from 'node:path';
import _traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import type { ParsedFile } from '../parser/types.js';
import { makeSymbolKey } from './keys.js';
import type { SymbolTable } from './types.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

const MODULE_EXTENSIONS = ['', '.uts', '.ts', '.js', '.tsx', '.jsx', '/index.uts', '/index.ts', '/index.js'];

interface ModuleExport {
  file: string;
  exportedName: string;
}

interface ModuleImport {
  file: string;
  localName: string;
  importedName: string;
  source: string;
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, '/');
}

function resolveModulePath(fromFile: string, source: string, projectFiles: Set<string>): string | null {
  let base: string;
  if (source.startsWith('@/')) {
    base = source.slice(2);
  } else if (source.startsWith('.')) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(normalizeFile(fromFile)), source));
  } else {
    return null;
  }

  for (const ext of MODULE_EXTENSIONS) {
    const candidate = normalizeFile(base + ext);
    if (projectFiles.has(candidate)) return candidate;
  }
  return null;
}

function collectFromAst(
  ast: t.File,
  file: string,
  exports: ModuleExport[],
  imports: ModuleImport[],
): void {
  try {
    traverse(ast, {
      noScope: true,
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (spec.type === 'ImportSpecifier') {
          const importedName =
            spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
          imports.push({
            file,
            localName: spec.local.name,
            importedName,
            source,
          });
        } else if (spec.type === 'ImportDefaultSpecifier') {
          imports.push({
            file,
            localName: spec.local.name,
            importedName: 'default',
            source,
          });
        }
      }
    },
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const decl = path.node.declaration;
      if (decl?.type === 'FunctionDeclaration' && decl.id) {
        exports.push({ file, exportedName: decl.id.name });
      } else if (decl?.type === 'ClassDeclaration' && decl.id) {
        exports.push({ file, exportedName: decl.id.name });
      } else if (decl?.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id.type === 'Identifier') {
            exports.push({ file, exportedName: d.id.name });
          }
        }
      } else if (decl?.type === 'TSTypeAliasDeclaration' && decl.id.type === 'Identifier') {
        exports.push({ file, exportedName: decl.id.name });
      } else if (decl?.type === 'TSInterfaceDeclaration' && decl.id.type === 'Identifier') {
        exports.push({ file, exportedName: decl.id.name });
      }

      for (const spec of path.node.specifiers) {
        if (spec.type === 'ExportSpecifier') {
          const exportedName =
            spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
          exports.push({ file, exportedName });
        }
      }
    },
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      const decl = path.node.declaration;
      if (decl.type === 'FunctionDeclaration' && decl.id) {
        exports.push({ file, exportedName: decl.id.name });
      } else if (decl.type === 'Identifier') {
        exports.push({ file, exportedName: 'default' });
      }
    },
    });
  } catch {
    // 部分 UTS 文件含合法重复绑定，跳过 import/export 图收集
  }
}

function collectModuleGraph(parsedFiles: ParsedFile[]): {
  exports: ModuleExport[];
  imports: ModuleImport[];
  projectFiles: Set<string>;
} {
  const projectFiles = new Set(parsedFiles.map((f) => normalizeFile(f.relativePath)));
  const exports: ModuleExport[] = [];
  const imports: ModuleImport[] = [];

  for (const parsed of parsedFiles) {
    if (parsed.kind === 'module') {
      if (parsed.ast?.type === 'File') {
        collectFromAst(parsed.ast, normalizeFile(parsed.relativePath), exports, imports);
      }
      continue;
    }
    for (const script of parsed.scripts) {
      if (script.ast?.type === 'File') {
        collectFromAst(script.ast, normalizeFile(parsed.relativePath), exports, imports);
      }
    }
  }

  return { exports, imports, projectFiles };
}

function applyLinkGroup(table: SymbolTable, keys: string[], linkGroup: string): void {
  for (const key of keys) {
    const entry = table.symbols.get(key);
    if (entry) entry.linkGroup = linkGroup;
  }
}

/**
 * 建立 export → import 链路，同组符号共享混淆名。
 * keepExports 为 true 时，exported 符号及其 import 绑定均不重命名。
 */
export function linkCrossFileSymbols(
  table: SymbolTable,
  parsedFiles: ParsedFile[],
  options: { keepExports: boolean },
): void {
  const { exports, imports, projectFiles } = collectModuleGraph(parsedFiles);

  for (const imp of imports) {
    const sourceFile = resolveModulePath(imp.file, imp.source, projectFiles);
    if (!sourceFile) continue;

    const exportKey = makeSymbolKey(
      sourceFile,
      imp.importedName === 'default' ? imp.localName : imp.importedName,
    );
    let exportEntry = table.symbols.get(exportKey);

    if (!exportEntry && imp.importedName === 'default') {
      exportEntry = table.symbols.get(makeSymbolKey(sourceFile, imp.localName));
    }

    const importKey = makeSymbolKey(imp.file, imp.localName);
    const importEntry = table.symbols.get(importKey);
    if (!importEntry) continue;

    const linkGroup = `link:${sourceFile}:${imp.importedName}`;
    const keys = [importKey];
    if (exportEntry) keys.push(exportKey);
    applyLinkGroup(table, keys, linkGroup);

    if (exportEntry) {
      importEntry.importedFrom = imp.importedName;
      if (exportEntry.exported) importEntry.exported = false;
      if (!options.keepExports || !exportEntry.exported) {
        importEntry.renameable = exportEntry.renameable;
      }
    }
  }

  if (options.keepExports) {
    for (const entry of table.symbols.values()) {
      if (entry.exported) entry.renameable = false;
    }
    const frozenGroups = new Set<string>();
    for (const entry of table.symbols.values()) {
      if (entry.exported && entry.linkGroup) frozenGroups.add(entry.linkGroup);
    }
    for (const entry of table.symbols.values()) {
      if (entry.linkGroup && frozenGroups.has(entry.linkGroup)) {
        entry.renameable = false;
      }
    }
  }
}
