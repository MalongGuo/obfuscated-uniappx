import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import {
  buildEasycomMappings,
  isTemplateFile,
  stripEasycomBlock,
  syncComponentTags,
} from '../path/easycom-sync.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifacts.js';
import { loadConfig } from '../config/loader.js';
import type { EasycomMapping } from '../path/easycom-sync.js';
import { loadRenameLog } from './import-paths.js';

async function loadStoredComponentTagMappings(projectRoot: string): Promise<EasycomMapping[] | null> {
  const config = await loadConfig(projectRoot, {});
  const mapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapPaths, config.mode);
  if (!mapPath) return null;
  try {
    const data = await fs.readJson(mapPath);
    const stored = data.easycomMappings as EasycomMapping[] | undefined;
    return stored?.length ? stored : null;
  } catch {
    return null;
  }
}

/** 同步模板组件标签，并移除 pages.json 中的 easycom.custom */
export async function syncProjectComponentTags(projectRoot: string): Promise<number> {
  const stored = await loadStoredComponentTagMappings(projectRoot);
  const renameLog = await loadRenameLog(projectRoot);
  const mappings =
    stored ??
    buildEasycomMappings(renameLog.mappings, renameLog.fileMappings);

  if (mappings.length === 0) return 0;

  const pagesJsonPath = path.join(projectRoot, 'pages.json');
  if (await fs.pathExists(pagesJsonPath)) {
    const raw = await fs.readFile(pagesJsonPath, 'utf-8');
    const stripped = stripEasycomBlock(raw);
    if (stripped !== raw) {
      await fs.writeFile(pagesJsonPath, stripped, 'utf-8');
    }
  }

  const files = await fg('**/*', { cwd: projectRoot, onlyFiles: true, dot: false });
  let changed = 0;
  for (const relFile of files) {
    if (!isTemplateFile(relFile)) continue;
    const abs = path.join(projectRoot, relFile);
    const original = await fs.readFile(abs, 'utf-8');
    const updated = syncComponentTags(original, mappings);
    if (updated !== original) {
      await fs.writeFile(abs, updated, 'utf-8');
      changed++;
    }
  }

  return changed > 0 ? mappings.length : 0;
}
