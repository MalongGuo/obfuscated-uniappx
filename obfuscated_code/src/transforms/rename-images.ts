import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { applyReplacements, buildContentReplacements } from '../path/replacer.js';
import { isTextFile } from '../path/replacer.js';
import { obfuscateOrdinaryFilename } from '../path/file-rename.js';
import { obfuscateDirName } from '../path/token.js';
import type { ObfuscatorConfig } from '../types/config.js';
import { resolvePathToken } from '../output/resolve.js';

const IMAGE_GLOB = 'static/**/*.{png,jpg,jpeg,webp,gif,svg}';
const STATIC_ROOT = 'static';

export interface RenameStaticImagesProgress {
  /** 以图片为粒度：originalPath → finalPath */
  onImageProgress?: (index: number, total: number, detail: string) => void;
  /** clone 阶段由统一内容替换处理引用，跳过单独 sync */
  skipReferenceSync?: boolean;
}

export interface PathRenamePair {
  from: string;
  to: string;
}

export interface ImageRenamePlan {
  /** 混淆前完整路径（用于引用替换与日志） */
  originalFrom: string;
  /** 混淆后完整路径 */
  finalTo: string;
  /** 目录重命名完成后的磁盘路径（move 源） */
  moveFrom: string;
}

export function formatImageRenameDetail(from: string, to: string): string {
  return `${from} → ${to}`;
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/');
}

function isAlreadyObfuscated(name: string, token: string): boolean {
  return token.length > 0 && name.startsWith(token);
}

async function collectStaticSubdirs(workPath: string): Promise<string[]> {
  const dirs = await fg(`${STATIC_ROOT}/**/`, {
    cwd: workPath,
    onlyDirectories: true,
    dot: false,
  });
  return dirs
    .map((d) => normalizeRel(d.replace(/\/$/, '')))
    .filter(Boolean)
    .sort((a, b) => b.split('/').length - a.split('/').length);
}

function planStaticDirRenames(subdirs: string[], token: string): PathRenamePair[] {
  const plans: PathRenamePair[] = [];
  for (const relDir of subdirs) {
    const dirName = path.basename(relDir);
    if (isAlreadyObfuscated(dirName, token)) continue;

    const newName = obfuscateDirName(dirName, token);
    if (newName === dirName) continue;

    const parentRel = normalizeRel(path.dirname(relDir));
    const from = relDir;
    const to = parentRel === '.' ? newName : `${parentRel}/${newName}`;
    plans.push({ from, to });
  }
  return plans;
}

/** 按目录映射推算路径（仅 static/ 子目录） */
export function applyDirRenameMap(relPath: string, dirRenames: PathRenamePair[]): string {
  let result = normalizeRel(relPath);
  const sorted = [...dirRenames].sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of sorted) {
    if (result === from) {
      result = to;
      break;
    }
    const prefix = `${from}/`;
    if (result.startsWith(prefix)) {
      result = `${to}${result.slice(from.length)}`;
      break;
    }
  }
  return result;
}

function planImageFileRenames(
  imagePaths: string[],
  token: string,
  dirRenames: PathRenamePair[],
): ImageRenamePlan[] {
  const plans: ImageRenamePlan[] = [];

  for (const rel of imagePaths) {
    const originalFrom = normalizeRel(rel);
    const moveFrom = applyDirRenameMap(originalFrom, dirRenames);
    const base = path.basename(moveFrom);
    const dot = base.indexOf('.');
    if (dot <= 0) continue;

    const stem = base.slice(0, dot);
    let finalTo = moveFrom;
    if (!isAlreadyObfuscated(stem, token)) {
      const newBase = obfuscateOrdinaryFilename(base, token);
      if (newBase !== base) {
        const dir = path.dirname(moveFrom);
        finalTo = dir === '.' ? newBase : `${dir}/${newBase}`;
      }
    }

    if (originalFrom === finalTo && moveFrom === originalFrom) continue;

    plans.push({ originalFrom, finalTo, moveFrom });
  }

  return plans;
}

async function executeDirRenames(workPath: string, dirRenames: PathRenamePair[]): Promise<void> {
  for (const { from, to } of dirRenames) {
    const oldAbs = path.join(workPath, ...from.split('/'));
    const newAbs = path.join(workPath, ...to.split('/'));
    if (!(await fs.pathExists(oldAbs)) || (await fs.pathExists(newAbs))) continue;
    await fs.move(oldAbs, newAbs);
  }
}

async function executeImageFileRenames(workPath: string, imagePlans: ImageRenamePlan[]): Promise<void> {
  for (const { moveFrom, finalTo } of imagePlans) {
    if (moveFrom === finalTo) continue;
    const oldAbs = path.join(workPath, ...moveFrom.split('/'));
    const newAbs = path.join(workPath, ...finalTo.split('/'));
    if (!(await fs.pathExists(oldAbs))) continue;
    await fs.ensureDir(path.dirname(newAbs));
    await fs.move(oldAbs, newAbs, { overwrite: true });
  }
}

function buildRenameLog(dirRenames: PathRenamePair[], imagePlans: ImageRenamePlan[]): PathRenamePair[] {
  const log: PathRenamePair[] = [...dirRenames];
  for (const { originalFrom, finalTo } of imagePlans) {
    if (originalFrom !== finalTo) {
      log.push({ from: originalFrom, to: finalTo });
    }
  }
  return log;
}

async function syncImageReferences(
  workPath: string,
  renameLog: PathRenamePair[],
): Promise<number> {
  if (renameLog.length === 0) return 0;

  const reps = buildContentReplacements(renameLog);
  const textFiles = await fg('**/*', { cwd: workPath, onlyFiles: true });
  let replacedFiles = 0;

  for (const rel of textFiles) {
    if (!isTextFile(rel)) continue;

    const abs = path.join(workPath, rel);
    const original = await fs.readFile(abs, 'utf-8');
    const updated = applyReplacements(original, reps);
    if (updated === original) continue;

    await fs.writeFile(abs, updated, 'utf-8');
    replacedFiles++;
  }

  return replacedFiles;
}

/**
 * static/ 图片混淆：先子目录 token，再文件名 token。
 * 日志与进度以**图片路径** original → final 为主；引用同步静默执行。
 */
export async function renameStaticImages(
  workPath: string,
  config: ObfuscatorConfig,
  progress: RenameStaticImagesProgress = {},
): Promise<{
  renamed: number;
  imageCount: number;
  dirCount: number;
  replacedFiles: number;
  renameLog: PathRenamePair[];
}> {
  const { token } = resolvePathToken(config);
  const { onImageProgress, skipReferenceSync = false } = progress;

  const initialImages = await fg(IMAGE_GLOB, { cwd: workPath, onlyFiles: true });
  const dirRenames = planStaticDirRenames(await collectStaticSubdirs(workPath), token);
  const imagePlans = planImageFileRenames(initialImages, token, dirRenames);

  const total = imagePlans.length;
  let index = 0;

  await executeDirRenames(workPath, dirRenames);
  await executeImageFileRenames(workPath, imagePlans);

  for (const { originalFrom, finalTo } of imagePlans) {
    index++;
    onImageProgress?.(index, total, formatImageRenameDetail(originalFrom, finalTo));
  }

  const renameLog = buildRenameLog(dirRenames, imagePlans);
  const replacedFiles = skipReferenceSync ? 0 : await syncImageReferences(workPath, renameLog);

  return {
    renamed: renameLog.length,
    imageCount: imagePlans.length,
    dirCount: dirRenames.length,
    replacedFiles,
    renameLog,
  };
}
