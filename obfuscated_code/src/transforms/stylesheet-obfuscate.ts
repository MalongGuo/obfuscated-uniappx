import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { randomBytes } from 'node:crypto';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import {
  applyClassRenamesToStyle,
  extractStyleClassNames,
} from './class-obfuscate.js';
import {
  collectScssLoopClassNames,
  expandScssLoopsInContent,
} from './scss-loop-expand.js';

export const STYLESHEET_GLOB = ['**/*.{css,scss,less,sass}'];

const STYLESHEET_SCAN_IGNORE = ['**/node_modules/**', '**/unpackage/**', '**/dist/**', '**/obfuscated/**'];

export interface StylesheetFileScan {
  relPath: string;
  absPath: string;
  content: string;
  classes: Set<string>;
}

export interface EnhancedStylesheetResult {
  filesScanned: number;
  filesChanged: number;
  classRenameCount: number;
  classRenameMap: Map<string, string>;
  sampleRename?: string;
}

function randomLocalClassToken(): string {
  return `c${randomBytes(5).toString('hex')}`;
}

/** 扫描项目内全部 css/scss 等样式文件并提取 class 名 */
export async function scanStylesheetFiles(workPath: string): Promise<StylesheetFileScan[]> {
  const relPaths = new Set<string>();
  for (const pattern of STYLESHEET_GLOB) {
    for (const rel of await fg(pattern, {
      cwd: workPath,
      onlyFiles: true,
      ignore: STYLESHEET_SCAN_IGNORE,
    })) {
      relPaths.add(rel.replace(/\\/g, '/'));
    }
  }

  const scans: StylesheetFileScan[] = [];
  for (const relPath of [...relPaths].sort()) {
    const absPath = path.join(workPath, relPath);
    const content = await fs.readFile(absPath, 'utf-8');
    scans.push({
      relPath,
      absPath,
      content,
      classes: extractStyleClassNames(content),
    });
  }
  return scans;
}

/**
 * 全项目 css/scss class 统一命名（仅重命名 class，不改文件名 / @import 路径）：
 * 每个 class 独立生成随机 token；多文件共用同一 class 时映射一致。
 */
export function buildGlobalStylesheetClassMap(scans: StylesheetFileScan[]): Map<string, string> {
  const classNames = new Set<string>();
  for (const scan of scans) {
    for (const cls of scan.classes) {
      classNames.add(cls);
    }
    for (const cls of collectScssLoopClassNames(scan.content)) {
      classNames.add(cls);
    }
  }

  const map = new Map<string, string>();
  for (const cls of classNames) {
    map.set(cls, randomLocalClassToken());
  }
  return map;
}

export function applyStylesheetClassRenames(content: string, renameMap: Map<string, string>): string {
  return applyClassRenamesToStyle(content, renameMap);
}

/** css/scss 加强：先全量扫描再统一 class 重命名 */
export async function runEnhancedStylesheetObfuscation(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<EnhancedStylesheetResult> {
  const result: EnhancedStylesheetResult = {
    filesScanned: 0,
    filesChanged: 0,
    classRenameCount: 0,
    classRenameMap: new Map(),
  };

  const scans = await scanStylesheetFiles(workPath);
  result.filesScanned = scans.length;
  if (scans.length === 0) return result;

  const renameMap = buildGlobalStylesheetClassMap(scans);
  result.classRenameMap = renameMap;
  result.classRenameCount = renameMap.size;
  if (renameMap.size === 0) return result;

  const first = renameMap.entries().next().value;
  if (first) {
    result.sampleRename = `${first[0]} → ${first[1]}`;
  }

  logger.info(`  样式 class 统一命名: ${scans.length} 个文件, ${renameMap.size} 个 class`);

  const interval = Math.max(10, Math.floor(scans.length / 15));
  let index = 0;
  for (const scan of scans) {
    index++;
    let next = expandScssLoopsInContent(scan.content).content;
    next = applyStylesheetClassRenames(next, renameMap);
    if (next !== scan.content) {
      await fs.writeFile(scan.absPath, next, 'utf-8');
      result.filesChanged++;
    }
    logger.progress(
      '样式 class',
      index,
      scans.length,
      result.sampleRename ? `${scan.relPath} | ${result.sampleRename}` : scan.relPath,
      interval,
    );
  }

  logger.info(`  样式 class 统一命名完成: ${result.filesChanged} 个文件已修改`);
  return result;
}
