import type { Node } from '@babel/types';

export type ScriptLang = 'js' | 'ts' | 'uts';

export interface ParsedScript {
  lang: ScriptLang;
  content: string;
  ast: Node | null;
  parseError?: string;
}

export interface ParsedVueSfc {
  kind: 'vue' | 'uvue' | 'nvue';
  relativePath: string;
  template: string | null;
  scripts: ParsedScript[];
  templateIdentifiers: string[];
}

export interface ParsedModule {
  kind: 'module';
  relativePath: string;
  lang: ScriptLang;
  ast: Node | null;
  parseError?: string;
}

export type ParsedFile = ParsedVueSfc | ParsedModule;
