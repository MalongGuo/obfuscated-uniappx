import type { SymbolTable } from '../symbols/types.js';
import { API_LITERAL_KEYS } from '../transforms/rename-map.js';
import { shouldKeepSymbol } from '../whitelist/builtin.js';

export interface ClassifiedMappings {
  functions: Record<string, string>;
  properties: Record<string, string>;
  classes: Record<string, string>;
  locals: Record<string, string>;
  totalMappings: number;
}

export function buildClassifiedMappings(table: SymbolTable): ClassifiedMappings {
  const functions: Record<string, string> = {};
  const properties: Record<string, string> = {};
  const classes: Record<string, string> = {};
  const locals: Record<string, string> = {};

  for (const entry of table.symbols.values()) {
    if (!entry.renameable || !entry.obfuscatedName) continue;
    if (API_LITERAL_KEYS.has(entry.name)) continue;
    if (shouldKeepSymbol(entry.name)) continue;

    switch (entry.kind) {
      case 'function':
        functions[entry.name] = entry.obfuscatedName;
        break;
      case 'property':
      case 'template-ref':
        properties[entry.name] = entry.obfuscatedName;
        break;
      case 'class':
        classes[entry.name] = entry.obfuscatedName;
        break;
      case 'local':
        locals[entry.name] = entry.obfuscatedName;
        break;
      default:
        break;
    }
  }

  return {
    functions,
    properties,
    classes,
    locals,
    totalMappings: Object.keys(functions).length
      + Object.keys(properties).length
      + Object.keys(classes).length
      + Object.keys(locals).length,
  };
}
