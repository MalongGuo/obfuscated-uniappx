import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { isImmutableConfigFile, isRootAnchorFile } from '../path/anchors.js';
import { obfuscateOrdinaryFilename } from '../path/file-rename.js';
import { applyReplacements, buildContentReplacements } from '../path/replacer.js';
import { isTextFile } from '../path/replacer.js';
import type { ObfuscatorConfig } from '../types/config.js';
import { resolvePathToken } from '../output/resolve.js';

const CODE_EXT = new Set(['.uts', '.uvue', '.vue', '.ts', '.js']);

export interface PathRenamePair {
  from: string;
  to: string;
}

export interface CodeFilenameRenameProgress {
  /** 以源码文件为粒度：from → to */
  onFileProgress?: (index: number, total: number, detail: string) => void;
}

export function formatCodeFilenameDetail(from: string, to: string): string {
  return `${from} → ${to}`;
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/');
}

function planCodeFilenameRenames(
  files: string[],
  config: ObfuscatorConfig,
  token: string,
): PathRenamePair[] {
  const plans: PathRenamePair[] = [];

  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    if (isRootAnchorFile(rel, config.rootAnchorFiles) || isImmutableConfigFile(rel)) continue;

    const dir = path.dirname(rel);
    const base = path.basename(rel);
    const newBase = obfuscateOrdinaryFilename(base, token);
    if (newBase === base) continue;

    const from = normalizeRel(rel);
    const to = dir === '.' ? newBase : `${normalizeRel(dir)}/${newBase}`;
    if (from === to) continue;
    plans.push({ from, to });
  }

  return plans;
}

async function executeFilenameRenames(workPath: string, plans: PathRenamePair[]): Promise<void> {
  for (const { from, to } of plans) {
    const oldAbs = path.join(workPath, ...from.split('/'));
    const newAbs = path.join(workPath, ...to.split('/'));
    if (!(await fs.pathExists(oldAbs))) continue;
    await fs.ensureDir(path.dirname(newAbs));
    await fs.move(oldAbs, newAbs, { overwrite: true });
  }
}

async function syncFilenameReferences(workPath: string, renameLog: PathRenamePair[]): Promise<number> {
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

/** code 模式下对非锚点源码文件做 token 前缀重命名 */
export async function renameCodeModeFilenames(
  workPath: string,
  config: ObfuscatorConfig,
  progress: CodeFilenameRenameProgress = {},
): Promise<{ renamed: number; replacedFiles: number; renameLog: PathRenamePair[] }> {
  const { token } = resolvePathToken(config);
  const { onFileProgress } = progress;

  const files = await fg('**/*', { cwd: workPath, onlyFiles: true });
  const renameLog = planCodeFilenameRenames(files, config, token);
  const total = renameLog.length;

  await executeFilenameRenames(workPath, renameLog);

  let index = 0;
  for (const { from, to } of renameLog) {
    index++;
    onFileProgress?.(index, total, formatCodeFilenameDetail(from, to));
  }

  const replacedFiles = await syncFilenameReferences(workPath, renameLog);

  return { renamed: renameLog.length, replacedFiles, renameLog };
}
