import type { ParsedFile } from '../parser/types.js';
import { collectSymbols } from './collector.js';
import { linkCrossFileSymbols } from './cross-file.js';
import { getSymbolEntry, makeSymbolKey } from './keys.js';
import type { BuildSymbolTableOptions, SymbolTable } from './types.js';

export { getSymbolEntry, makeSymbolKey, parseSymbolKey } from './keys.js';

export function buildSymbolTable(
  parsedFiles: ParsedFile[],
  options: BuildSymbolTableOptions = {},
): SymbolTable {
  const symbols = collectSymbols(
    parsedFiles,
    options.customWhitelist ?? [],
    options.extraFrameworkPrefixes ?? [],
  );
  const byFile = new Map<string, string[]>();
  const parseErrors: SymbolTable['parseErrors'] = [];

  for (const parsed of parsedFiles) {
    if (parsed.kind === 'module') {
      if (parsed.parseError) {
        parseErrors.push({ file: parsed.relativePath, error: parsed.parseError });
      }
      continue;
    }
    for (const script of parsed.scripts) {
      if (script.parseError) {
        parseErrors.push({ file: parsed.relativePath, error: script.parseError });
      }
    }
  }

  for (const entry of symbols.values()) {
    const list = byFile.get(entry.file) ?? [];
    if (!list.includes(entry.name)) list.push(entry.name);
    byFile.set(entry.file, list);
  }

  const table: SymbolTable = { symbols, byFile, parseErrors };

  linkCrossFileSymbols(table, parsedFiles, {
    keepExports: options.keepExports ?? true,
  });

  return table;
}

export function symbolTableToJson(table: SymbolTable): Record<string, unknown> {
  const symbols: Record<string, unknown> = {};
  for (const [key, entry] of table.symbols) {
    symbols[key] = {
      name: entry.name,
      file: entry.file,
      kind: entry.kind,
      renameable: entry.renameable,
      exported: entry.exported,
      importedFrom: entry.importedFrom,
      linkGroup: entry.linkGroup,
      obfuscatedName: entry.obfuscatedName,
      files: [...new Set(entry.occurrences.map((o) => o.file))],
      occurrenceCount: entry.occurrences.length,
    };
  }

  return {
    symbolCount: table.symbols.size,
    renameableCount: [...table.symbols.values()].filter((s) => s.renameable).length,
    parseErrorCount: table.parseErrors.length,
    symbols,
    parseErrors: table.parseErrors,
  };
}

export function getSymbolsInFile(table: SymbolTable, file: string): string[] {
  const normalized = file.replace(/\\/g, '/');
  return table.byFile.get(normalized) ?? [];
}

export function lookupSymbol(table: SymbolTable, file: string, name: string) {
  return getSymbolEntry(table.symbols, file, name);
}
