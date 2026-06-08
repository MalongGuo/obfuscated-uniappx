import type { ObfuscatorConfig } from '../types/config.js';
import { scanProject } from '../scanner/index.js';
import { parseProject } from '../parser/index.js';
import {
  allocateSymbolTable,
  buildSymbolTable,
  getSymbolsInFile,
  lookupSymbol,
  symbolTableToJson,
} from '../symbols/index.js';
import { resolveSymbolTableWhitelistOptions } from '../whitelist/project-whitelist.js';
import type { SymbolTable } from '../symbols/types.js';
import { writePreloadLog } from './logs.js';

export interface SymbolsResult {
  symbolCount: number;
  renameableCount: number;
  parseErrorCount: number;
  table: ReturnType<typeof symbolTableToJson>;
}

export async function extractSymbols(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<{ table: SymbolTable; result: SymbolsResult }> {
  const files = await scanProject(projectPath, config);
  const parsed = await parseProject(files);
  const { options: whitelistOpts } = await resolveSymbolTableWhitelistOptions(projectPath, config);
  const table = buildSymbolTable(parsed, {
    customWhitelist: whitelistOpts.customWhitelist,
    keepExports: config.keepExports,
  });
  allocateSymbolTable(table, config.namingStyle, config.seed, config.namePrefix);

  const json = symbolTableToJson(table);
  return {
    table,
    result: {
      symbolCount: table.symbols.size,
      renameableCount: [...table.symbols.values()].filter((s) => s.renameable).length,
      parseErrorCount: table.parseErrors.length,
      table: json,
    },
  };
}

export function formatFileSymbols(
  table: SymbolTable,
  fileFilter: string,
): Array<{ name: string; kind: string; rename: string }> {
  const normalized = fileFilter.replace(/\\/g, '/');
  return getSymbolsInFile(table, normalized)
    .sort()
    .map((name) => {
      const entry = lookupSymbol(table, normalized, name);
      return {
        name,
        kind: entry?.kind ?? '?',
        rename: entry?.renameable ? (entry.obfuscatedName ?? '') : '(保留)',
      };
    });
}

export async function runPreloadSymbols(
  projectPath: string,
  config: ObfuscatorConfig,
  fileFilter?: string,
  logMode: ObfuscatorConfig['mode'] = config.mode,
): Promise<{ result: SymbolsResult; table: SymbolTable; logPath: string }> {
  const { table, result } = await extractSymbols(projectPath, config);
  const fileSymbols = fileFilter ? formatFileSymbols(table, fileFilter) : undefined;
  const logPath = await writePreloadLog(projectPath, logMode, 'symbols', {
    namingStyle: config.namingStyle,
    seed: config.seed,
    symbolCount: result.symbolCount,
    renameableCount: result.renameableCount,
    parseErrorCount: result.parseErrorCount,
    parseErrors: table.parseErrors,
    fileFilter: fileFilter ?? null,
    fileSymbols: fileSymbols ?? null,
    symbols: result.table,
  });
  return { result, table, logPath };
}
