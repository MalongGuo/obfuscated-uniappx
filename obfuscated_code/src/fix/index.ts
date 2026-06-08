import path from 'node:path';
import fs from 'fs-extra';
import { loadConfig } from '../config/loader.js';
import { runCheck } from '../check/index.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifacts.js';
import { extractTokenFromOutputDir } from '../output/resolve.js';
import {
  applyPagesJsonFixes,
  collectPagesJsonFixes,
  type PagesJsonFix,
} from './pages-json-fix.js';
import { fixRelativeImports, loadRenameLog } from './import-paths.js';
import { syncProjectComponentTags } from './easycom-fix.js';
import type { CliOptions, ObfuscationMode } from '../types/config.js';

export interface FixResult {
  project: string;
  mode: ObfuscationMode;
  skipped: boolean;
  skipReason?: string;
  pagesJsonFixed: number;
  componentTagsSynced: number;
  importFilesFixed: number;
  fixes: PagesJsonFix[];
  routeIssuesBefore: number;
  routeIssuesAfter: number;
}

async function loadPathToken(projectRoot: string, mode: ObfuscationMode): Promise<string> {
  const mapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapPaths, mode);
  if (mapPath) {
    try {
      const data = await fs.readJson(mapPath);
      if (typeof data.token === 'string' && data.token) return data.token;
    } catch {
      // fall through
    }
  }
  return extractTokenFromOutputDir(path.basename(projectRoot));
}

export async function runFix(
  projectPath: string,
  options: Partial<CliOptions> = {},
): Promise<FixResult> {
  const resolved = path.resolve(projectPath);
  const config = await loadConfig(resolved, options);
  const mode = config.mode;

  if (mode === 'code') {
    return {
      project: resolved,
      mode,
      skipped: true,
      skipReason: 'code 模式未做路径混淆，无需修复 pages.json / import',
      pagesJsonFixed: 0,
      componentTagsSynced: 0,
      importFilesFixed: 0,
      fixes: [],
      routeIssuesBefore: 0,
      routeIssuesAfter: 0,
    };
  }

  const pagesJsonPath = path.join(resolved, 'pages.json');

  if (!(await fs.pathExists(pagesJsonPath))) {
    throw new Error(`未找到 pages.json: ${pagesJsonPath}`);
  }

  const beforeReport = await runCheck(resolved, options);
  const routeIssuesBefore = beforeReport.issues.filter((i) => i.category === 'route').length;

  const raw = await fs.readFile(pagesJsonPath, 'utf-8');
  const token = await loadPathToken(resolved, mode);
  const fixes = collectPagesJsonFixes(resolved, raw, token);

  if (fixes.length > 0) {
    const updated = applyPagesJsonFixes(raw, fixes);
    if (updated !== raw) {
      await fs.writeFile(pagesJsonPath, updated, 'utf-8');
    }
  }

  const componentTagsSynced = await syncProjectComponentTags(resolved);

  const renameLog = await loadRenameLog(resolved);
  const importFilesFixed = await fixRelativeImports(resolved, renameLog, token);

  const afterReport = await runCheck(resolved, options);
  const routeIssuesAfter = afterReport.issues.filter((i) => i.category === 'route').length;

  return {
    project: resolved,
    mode,
    skipped: false,
    pagesJsonFixed: fixes.length,
    componentTagsSynced,
    importFilesFixed,
    fixes,
    routeIssuesBefore,
    routeIssuesAfter,
  };
}
