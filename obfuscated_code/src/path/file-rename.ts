import path from 'node:path';
import fs from 'fs-extra';
import type { Logger } from '../logger/index.js';
import { normalizePath } from './whitelist.js';
import { isImmutableConfigFile, isRootAnchorFile } from './anchors.js';
import { isProtectedPath } from './protected-names.js';

export interface PathRenameEntry {
  from: string;
  to: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 目录导入入口文件（@/foo/bar 解析为 bar/index.uts），clone 阶段不可改名 */
export function isBarrelEntryFilename(fileName: string): boolean {
  const dot = fileName.indexOf('.');
  if (dot <= 0) return false;
  return fileName.slice(0, dot) === 'index';
}

/** 从混淆后目录名提取 token：TOKENpicker-view + picker-view → TOKEN */
export function extractDirToken(oldDirName: string, newDirName: string): string {
  if (newDirName.endsWith(oldDirName) && newDirName.length > oldDirName.length) {
    return newDirName.slice(0, newDirName.length - oldDirName.length);
  }
  return '';
}

/** 目录内文件是否以目录名开头：dir/dir.ext、dir/dir.test.js */
export function matchesDirFilename(fileName: string, dirName: string): boolean {
  if (fileName === dirName) return true;
  if (!fileName.startsWith(dirName)) return false;
  if (fileName.length <= dirName.length) return false;
  return fileName[dirName.length] === '.';
}

/** 文件名是否包含目录名段（由 . 或 - 分隔）：wrap-picker-view.test.js */
export function containsDirNameSegment(fileName: string, dirName: string): boolean {
  const regex = new RegExp(`(^|[.-])${escapeRegex(dirName)}(?=[.-]|$)`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fileName)) !== null) {
    const prefix = match[1];
    const dirStart = match.index + prefix.length;
    // uni-{dirName} 是独立命名前缀，不算目录名片段（如 uni-widget 相对 widget 目录）
    if (prefix === '-' && dirStart >= 4 && fileName.slice(dirStart - 4, dirStart) === 'uni-') {
      continue;
    }
    // dynamic-border 中 border 是复合词后缀，不等于目录名 border（单段目录名）
    if (prefix === '-' && !dirName.includes('-')) {
      const segmentStart = fileName.lastIndexOf('-', match.index - 1) + 1;
      const segmentBefore = fileName.slice(segmentStart, match.index);
      if (segmentBefore && segmentBefore !== dirName) {
        continue;
      }
    }
    return true;
  }
  return false;
}

export function buildDirSyncedFilename(
  fileName: string,
  oldDirName: string,
  newDirName: string,
): string {
  if (fileName === oldDirName) return newDirName;
  if (fileName.startsWith(`${oldDirName}.`)) {
    return `${newDirName}${fileName.slice(oldDirName.length)}`;
  }
  return fileName;
}

/** 将文件名中的目录名片段替换为混淆后目录名 */
export function replaceDirNameInFilename(
  fileName: string,
  oldDirName: string,
  newDirName: string,
): string {
  const regex = new RegExp(`(^|[.-])${escapeRegex(oldDirName)}(?=[.-]|$)`, 'g');
  return fileName.replace(regex, (_match, prefix: string) => `${prefix}${newDirName}`);
}

/** 普通文件：a.b.c.d.suffix → {token}a.b.c.d.suffix（与目录名 token 前缀一致） */
export function obfuscateOrdinaryFilename(fileName: string, token: string): string {
  if (!token) return fileName;
  const dot = fileName.indexOf('.');
  if (dot <= 0) return `${token}${fileName}`;
  const first = fileName.slice(0, dot);
  const rest = fileName.slice(dot);
  return `${token}${first}${rest}`;
}

export function buildRenamedFilename(
  fileName: string,
  oldDirName: string,
  newDirName: string,
  fileRelPath?: string,
): string | null {
  if (fileRelPath && isProtectedPath(fileRelPath)) return null;
  if (isBarrelEntryFilename(fileName)) return null;

  if (matchesDirFilename(fileName, oldDirName)) {
    return buildDirSyncedFilename(fileName, oldDirName, newDirName);
  }

  if (containsDirNameSegment(fileName, oldDirName)) {
    return replaceDirNameInFilename(fileName, oldDirName, newDirName);
  }

  const token = extractDirToken(oldDirName, newDirName);
  const renamed = obfuscateOrdinaryFilename(fileName, token);
  return renamed === fileName ? null : renamed;
}

function appendRouteRenames(
  fileRenameLog: PathRenameEntry[],
  oldDirRel: string,
  newDirRel: string,
  oldDirName: string,
  newDirName: string,
  entryName: string,
  newFileName: string,
): void {
  const oldRoute = normalizePath(`${oldDirRel}/${oldDirName}`);
  const newRoute = normalizePath(`${newDirRel}/${newDirName}`);
  if (oldRoute !== newRoute) {
    fileRenameLog.push({ from: oldRoute, to: newRoute });
  }

  const baseWithoutExt = entryName.includes('.') ? entryName.slice(0, entryName.indexOf('.')) : entryName;
  if (baseWithoutExt !== oldDirName && containsDirNameSegment(baseWithoutExt, oldDirName)) {
    const newBase = replaceDirNameInFilename(baseWithoutExt, oldDirName, newDirName);
    const partialOld = normalizePath(`${newDirRel}/${baseWithoutExt}`);
    const partialNew = normalizePath(`${newDirRel}/${newBase}`);
    if (partialOld !== partialNew) {
      fileRenameLog.push({ from: partialOld, to: partialNew });
    }
  }

  const partialRoute = normalizePath(`${newDirRel}/${oldDirName}`);
  if (partialRoute !== newRoute && partialRoute !== oldRoute) {
    fileRenameLog.push({ from: partialRoute, to: newRoute });
  }

  const newBaseWithoutExt = newFileName.includes('.')
    ? newFileName.slice(0, newFileName.indexOf('.'))
    : newFileName;
  if (baseWithoutExt !== oldDirName && baseWithoutExt !== newBaseWithoutExt) {
    const fileRouteOld = normalizePath(`${oldDirRel}/${baseWithoutExt}`);
    const fileRouteNew = normalizePath(`${newDirRel}/${newBaseWithoutExt}`);
    if (fileRouteOld !== fileRouteNew) {
      fileRenameLog.push({ from: fileRouteOld, to: fileRouteNew });
    }
  }
}

/**
 * 目录改名后同步文件重命名（components 规则）：
 * 1. dir/dir.ext、dir/dir.test.js
 * 2. *{dirName}* 文件名（如 wrap-picker-view.test.js）
 * 3. 其余普通文件 a.b.c.d → a{token}.b.c.d
 */
export async function syncMatchingFilenamesForDir(
  workPath: string,
  oldDirRel: string,
  newDirRel: string,
  logger: Logger,
  rootAnchorFiles: readonly string[] = [],
): Promise<PathRenameEntry[]> {
  const oldDirName = oldDirRel.split('/').pop();
  const newDirName = newDirRel.split('/').pop();
  if (!oldDirName || !newDirName || oldDirName === newDirName) return [];
  if (isProtectedPath(oldDirRel) || isProtectedPath(newDirRel)) return [];

  const dirAbs = path.join(workPath, ...newDirRel.split('/'));
  if (!(await fs.pathExists(dirAbs))) return [];

  const fileRenameLog: PathRenameEntry[] = [];
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const entryRel = normalizePath(`${newDirRel}/${entry.name}`);
    if (isImmutableConfigFile(entryRel)) continue;

    const newFileName = buildRenamedFilename(entry.name, oldDirName, newDirName, entryRel);
    if (!newFileName || newFileName === entry.name) continue;

    const oldFileRel = normalizePath(`${newDirRel}/${entry.name}`);
    const newFileRel = normalizePath(`${newDirRel}/${newFileName}`);
    if (isRootAnchorFile(oldFileRel, rootAnchorFiles) || isRootAnchorFile(newFileRel, rootAnchorFiles)) {
      continue;
    }
    const oldAbs = path.join(workPath, ...oldFileRel.split('/'));
    const newAbs = path.join(workPath, ...newFileRel.split('/'));

    if (await fs.pathExists(newAbs)) {
      logger.warn(`  目标文件已存在，跳过: ${oldFileRel} -> ${newFileRel}`);
      continue;
    }

    await fs.move(oldAbs, newAbs);
    fileRenameLog.push({ from: oldFileRel, to: newFileRel });
    appendRouteRenames(fileRenameLog, oldDirRel, newDirRel, oldDirName, newDirName, entry.name, newFileName);

    if (logger.isVerbose()) {
      logger.info(`  同名文件: ${oldFileRel} -> ${newFileRel}`);
    } else {
      logger.detail(`  同名文件: ${oldFileRel} -> ${newFileRel}`);
    }
  }

  return fileRenameLog;
}

/** 批量同步（测试用）；生产路径应在每次目录改名后立即调用 syncMatchingFilenamesForDir */
export async function syncMatchingFilenames(
  workPath: string,
  dirRenameLog: PathRenameEntry[],
  logger: Logger,
  rootAnchorFiles: readonly string[] = [],
): Promise<PathRenameEntry[]> {
  const fileRenameLog: PathRenameEntry[] = [];
  for (const { from, to } of dirRenameLog) {
    const renames = await syncMatchingFilenamesForDir(
      workPath,
      from,
      to,
      logger,
      rootAnchorFiles,
    );
    fileRenameLog.push(...renames);
  }
  return fileRenameLog;
}
