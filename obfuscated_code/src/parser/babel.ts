import { parse, type ParserOptions } from '@babel/parser';
import type { File, Node } from '@babel/types';
import { preprocessUts } from './uts-preprocess.js';

const BASE_PLUGINS: ParserOptions['plugins'] = [
  'typescript',
  'jsx',
  'decorators-legacy',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'exportDefaultFrom',
  'exportNamespaceFrom',
  'dynamicImport',
  'optionalChaining',
  'nullishCoalescingOperator',
  'objectRestSpread',
  'topLevelAwait',
];

function tryParse(code: string, filename?: string): File {
  return parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: BASE_PLUGINS,
    sourceFilename: filename,
  });
}

export function parseScript(
  code: string,
  lang: 'js' | 'ts' | 'uts',
  filename?: string,
): { ast: File | null; error?: string; fallback?: string } {
  if (!code.trim()) {
    return { ast: null };
  }

  try {
    return { ast: tryParse(code, filename) };
  } catch (firstError) {
    if (lang !== 'uts') {
      return {
        ast: null,
        error: firstError instanceof Error ? firstError.message : String(firstError),
      };
    }

    const { code: preprocessed, applied } = preprocessUts(code);
    try {
      return {
        ast: tryParse(preprocessed, filename),
        fallback: applied.length > 0 ? `uts-preprocess: ${applied.join(', ')}` : undefined,
      };
    } catch (secondError) {
      return {
        ast: null,
        error: secondError instanceof Error ? secondError.message : String(secondError),
        fallback: 'uts-preprocess-failed',
      };
    }
  }
}

export function isScriptExtension(ext: string): boolean {
  return ['.js', '.ts', '.uts', '.jsx', '.tsx'].includes(ext);
}

export function extensionToLang(ext: string): 'js' | 'ts' | 'uts' {
  if (ext === '.uts') return 'uts';
  if (ext === '.ts' || ext === '.tsx') return 'ts';
  return 'js';
}

export type { Node };
