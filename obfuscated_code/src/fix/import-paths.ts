import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import {
  buildContentReplacementGuard,
  isImmutableConfigFile,
  rootAnchorDirBasenames,
} from '../path/anchors.js';
import { applyReplacements, buildContentReplacements, isTextFile } from '../path/replacer.js';
import {
  buildEasycomMappings,
  isTemplateFile,
  stripEasycomBlock,
  syncComponentTags,
} from '../path/easycom-sync.js';
import { syncPagesJsonContent } from '../path/pages-json-sync.js';
import { isProtectedPath } from '../path/protected-names.js';
import { ARTIFACT_JSON, artifactFilenameCandidates } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifacts.js';
import { extractTokenFromOutputDir } from '../output/resolve.js';
import { loadConfig } from '../config/loader.js';

async function resolvePathsMapFile(projectRoot: string): Promise<string | null> {
  const config = await loadConfig(projectRoot, {});
  const direct = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapPaths, config.mode);
  if (direct) return direct;

  const resolved = path.resolve(projectRoot);
  const token = extractTokenFromOutputDir(path.basename(resolved));
  if (!token) return null;

  const logDir = path.join(path.dirname(resolved), 'log');
  if (!(await fs.pathExists(logDir))) return null;

  const entries = await fs.readdir(logDir);
  const match = entries.find((name) => name.endsWith(`_${token}`));
  if (!match) return null;

  for (const filename of artifactFilenameCandidates(ARTIFACT_JSON.mapPaths, config.mode)) {
    const candidate = path.join(logDir, match, filename);
    if (await fs.pathExists(candidate)) return candidate;
  }
  return null;
}

export interface RenameLogData {
  mappings: Array<{ from: string; to: string }>;
  fileMappings: Array<{ from: string; to: string }>;
}

export async function loadRenameLog(projectRoot: string): Promise<RenameLogData> {
  const mapPath = await resolvePathsMapFile(projectRoot);
  if (!mapPath) return { mappings: [], fileMappings: [] };

  try {
    const data = await fs.readJson(mapPath);
    const mappings = (data.mappings ?? []) as Array<{ from: string; to: string }>;
    const fileMappings = (data.fileMappings ?? []) as Array<{ from: string; to: string }>;
    return { mappings, fileMappings };
  } catch {
    return { mappings: [], fileMappings: [] };
  }
}

/** 还原被误替换的顶级锚点目录引用：./{token}common/ → ./common/ */
export function fixAnchorDirImports(content: string, token: string, anchorDirs: Iterable<string>): string {
  let result = content;
  for (const dir of anchorDirs) {
    const wrong = `./${token}${dir}/`;
    const right = `./${dir}/`;
    if (result.includes(wrong)) {
      result = result.split(wrong).join(right);
    }
  }
  return result;
}

export async function fixRelativeImports(
  projectRoot: string,
  renameLogData: RenameLogData,
  token = '',
): Promise<number> {
  const { mappings, fileMappings } = renameLogData;
  const renameLog = [...mappings, ...fileMappings];
  const config = await loadConfig(projectRoot);
  const guard = buildContentReplacementGuard(config.rootAnchorFiles, config.rootAnchorDirs);
  const anchorDirs = rootAnchorDirBasenames(config.rootAnchorDirs);
  const easycomMappings = buildEasycomMappings(mappings, fileMappings);
  const replacements = buildContentReplacements(renameLog, guard);
  const files = await fg('**/*', { cwd: projectRoot, onlyFiles: true, dot: false });
  const textFiles = files.filter((f) => isTextFile(f));

  let changed = 0;
  for (const relFile of textFiles) {
    if (isImmutableConfigFile(relFile) || isProtectedPath(relFile)) continue;

    const absFile = path.join(projectRoot, relFile);
    const original = await fs.readFile(absFile, 'utf-8');
    let updated: string;
    if (path.basename(relFile) === 'pages.json') {
      updated = stripEasycomBlock(syncPagesJsonContent(original, renameLog));
      if (token) {
        updated = fixAnchorDirImports(updated, token, anchorDirs);
      }
    } else {
      updated = applyReplacements(original, replacements);
      if (isTemplateFile(relFile)) {
        updated = syncComponentTags(updated, easycomMappings);
      }
      if (token) {
        updated = fixAnchorDirImports(updated, token, anchorDirs);
      }
    }

    if (updated !== original) {
      await fs.writeFile(absFile, updated, 'utf-8');
      changed++;
    }
  }

  return changed;
}
