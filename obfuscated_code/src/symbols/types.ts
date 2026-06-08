export type SymbolKind =
  | 'function'
  | 'class'
  | 'property'
  | 'local'
  | 'import'
  | 'export'
  | 'template-ref';

export interface SymbolOccurrence {
  file: string;
  line?: number;
  column?: number;
  kind: SymbolKind;
  scope?: string;
}

export interface SymbolEntry {
  name: string;
  /** 符号所在文件（相对项目根） */
  file: string;
  kind: SymbolKind;
  occurrences: SymbolOccurrence[];
  exported: boolean;
  importedFrom?: string;
  renameable: boolean;
  obfuscatedName?: string;
  /** export/import 链路组，同组共享混淆名 */
  linkGroup?: string;
}

export interface SymbolTable {
  symbols: Map<string, SymbolEntry>;
  byFile: Map<string, string[]>;
  parseErrors: Array<{ file: string; error: string }>;
}

export interface BuildSymbolTableOptions {
  customWhitelist?: string[];
  extraFrameworkPrefixes?: string[];
  keepExports?: boolean;
}
