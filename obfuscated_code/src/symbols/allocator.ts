import type { NamingStyle } from '../types/config.js';
import { makeSymbolKey } from './keys.js';
import { createNameGenerator } from './naming.js';
import type { SymbolEntry, SymbolTable } from './types.js';

export class SymbolAllocator {
  private readonly used = new Set<string>();
  private readonly nextName: () => string;

  constructor(style: NamingStyle, seed?: string | null, prefix = '') {
    this.nextName = createNameGenerator(style, seed, prefix);
  }

  allocate(originalName: string): string {
    let candidate = this.nextName();
    while (this.used.has(candidate) || candidate === originalName) {
      candidate = this.nextName();
    }
    this.used.add(candidate);
    return candidate;
  }

  assignRenameableSymbols(table: SymbolTable): void {
    const groupNames = new Map<string, string>();
    for (const entry of table.symbols.values()) {
      if (!entry.renameable) continue;
      const groupId = entry.linkGroup ?? makeSymbolKey(entry.file, entry.name);
      if (entry.obfuscatedName) {
        this.used.add(entry.obfuscatedName);
        if (!groupNames.has(groupId)) {
          groupNames.set(groupId, entry.obfuscatedName);
        }
        continue;
      }
      if (!groupNames.has(groupId)) {
        groupNames.set(groupId, this.allocate(entry.name));
      }
      entry.obfuscatedName = groupNames.get(groupId)!;
    }
  }
}

export function allocateSymbolTable(
  table: SymbolTable,
  style: NamingStyle,
  seed?: string | null,
  prefix = '',
): void {
  const allocator = new SymbolAllocator(style, seed, prefix);
  allocator.assignRenameableSymbols(table);
}
