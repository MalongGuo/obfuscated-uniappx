import fs from 'fs-extra';
import type { ScannedFile } from '../scanner/index.js';
import { extensionToLang, isScriptExtension, parseScript } from './babel.js';
import { isVueExtension, parseVueFile } from './vue-sfc.js';
import type { ParsedFile } from './types.js';

export * from './types.js';
export { parseScript, isScriptExtension } from './babel.js';
export { parseVueFile, isVueExtension } from './vue-sfc.js';

export async function parseSourceFile(file: ScannedFile): Promise<ParsedFile> {
  const content = await fs.readFile(file.absolutePath, 'utf-8');

  if (isVueExtension(file.extension)) {
    return parseVueFile(content, file.relativePath, file.extension);
  }

  const lang = extensionToLang(file.extension);
  const parsed = parseScript(content, lang, file.relativePath);
  return {
    kind: 'module',
    relativePath: file.relativePath,
    lang,
    ast: parsed.ast,
    parseError: parsed.error,
  };
}

export async function parseProject(files: ScannedFile[]): Promise<ParsedFile[]> {
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    if (!isScriptExtension(file.extension) && !isVueExtension(file.extension)) {
      continue;
    }
    parsed.push(await parseSourceFile(file));
  }
  return parsed;
}
