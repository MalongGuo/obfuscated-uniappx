import fs from 'fs-extra';
import type { ObfuscatorConfig } from '../types/config.js';
import { scanProject } from '../scanner/index.js';
import { writePreloadLog } from './logs.js';

const IDENTIFIER_REGEX = /\b(?:function|const|let|var|class)\s+([a-zA-Z_$][\w$]*)/g;
const METHOD_REGEX = /\b([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g;

export interface VocabResult {
  functions: string[];
  classes: string[];
  properties: string[];
  fileCount: number;
}

export async function extractVocab(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<VocabResult> {
  const files = await scanProject(projectPath, config);

  const functions = new Set<string>();
  const classes = new Set<string>();
  const properties = new Set<string>();

  for (const file of files) {
    if (!['.js', '.ts', '.uts', '.vue', '.uvue', '.nvue'].includes(file.extension)) continue;
    let content = await fs.readFile(file.absolutePath, 'utf-8');
    if (file.extension === '.vue' || file.extension === '.uvue' || file.extension === '.nvue') {
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      content = scriptMatch?.[1] ?? '';
    }

    let match: RegExpExecArray | null;
    IDENTIFIER_REGEX.lastIndex = 0;
    while ((match = IDENTIFIER_REGEX.exec(content)) !== null) {
      const keyword = content.slice(match.index, match.index + match[0].indexOf(match[1]!)).trim();
      const name = match[1]!;
      if (keyword.startsWith('function')) functions.add(name);
      else if (keyword.startsWith('class')) classes.add(name);
      else properties.add(name);
    }

    METHOD_REGEX.lastIndex = 0;
    while ((match = METHOD_REGEX.exec(content)) !== null) {
      functions.add(match[1]!);
    }
  }

  return {
    functions: [...functions].sort(),
    classes: [...classes].sort(),
    properties: [...properties].sort(),
    fileCount: files.length,
  };
}

export async function runPreloadVocab(
  projectPath: string,
  config: ObfuscatorConfig,
  logMode: ObfuscatorConfig['mode'] = config.mode,
): Promise<{ result: VocabResult; logPath: string }> {
  const result = await extractVocab(projectPath, config);
  const logPath = await writePreloadLog(projectPath, logMode, 'vocab', {
    scope: config.scope,
    ...result,
  });
  return { result, logPath };
}
