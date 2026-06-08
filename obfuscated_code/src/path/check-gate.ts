import path from 'node:path';
import fs from 'fs-extra';
import { detectPathConflicts } from './conflicts.js';
import { checkRouteConsistency } from './route-check.js';
import { scanResidualPaths } from './residual-check.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifact-resolve.js';
import type { CheckIssue } from '../check/types.js';
import type { ObfuscationMode } from '../types/config.js';

export interface PathCheckGateResult {
  issues: CheckIssue[];
  pathsMapPath: string | null;
}

/** clone 阶段质量门禁：路径冲突、pages.json 一致性、残留旧路径 */
export async function runPathCheckGate(
  projectRoot: string,
  mode: ObfuscationMode,
  pathWhitelist: string[],
): Promise<PathCheckGateResult> {
  const issues: CheckIssue[] = [];
  const pagesJsonPath = path.join(projectRoot, 'pages.json');
  const pagesDir = path.join(projectRoot, 'pages');

  if (await fs.pathExists(pagesDir)) {
    for (const c of await detectPathConflicts(pagesDir)) {
      issues.push({
        severity: 'warn',
        category: 'conflict',
        message: `路径冲突: ${c}/ 目录与同名根级 .vue 文件共存`,
      });
    }
  }

  if (await fs.pathExists(pagesJsonPath)) {
    const raw = await fs.readFile(pagesJsonPath, 'utf-8');
    for (const ri of checkRouteConsistency(projectRoot, raw)) {
      issues.push({
        severity: ri.type === 'tabbar-broken' ? 'error' : 'warn',
        category: 'route',
        message: ri.message,
      });
    }
  } else {
    issues.push({
      severity: 'warn',
      category: 'route',
      message: '未找到 pages.json',
    });
  }

  const pathsMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapPaths, mode);
  const shouldCheckResidual = mode === 'clone' || mode === 'full';

  if (shouldCheckResidual) {
    if (pathsMapPath) {
      const pathData = await fs.readJson(pathsMapPath);
      const mappings = pathData.mappings ?? [];
      const residuals = await scanResidualPaths(projectRoot, mappings, pathWhitelist);
      for (const r of residuals.slice(0, 50)) {
        issues.push({
          severity: 'warn',
          category: 'residual',
          message: `残留旧路径「${r.pattern}」`,
          file: r.file,
          line: r.line,
        });
      }
      if (residuals.length > 50) {
        issues.push({
          severity: 'info',
          category: 'residual',
          message: `另有 ${residuals.length - 50} 处残留路径未列出`,
        });
      }
    } else if (mode === 'clone') {
      issues.push({
        severity: 'info',
        category: 'residual',
        message: 'clone 模式未找到 obfuscation-map-paths.json，跳过残留路径扫描',
      });
    }
  }

  return { issues, pathsMapPath };
}
