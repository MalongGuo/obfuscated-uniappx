import path from 'node:path';
import fs from 'fs-extra';
import { loadConfig } from '../config/loader.js';
import { checkPresetWarnings } from '../config/preset-warnings.js';
import { runPathCheckGate } from '../path/check-gate.js';
import { clonePathMappingIssues, runCodeCheckGate } from '../code/check-gate.js';
import { ARTIFACT_JSON, modeArtifactName } from '../output/artifact-names.js';
import { resolveArtifactProjectRoot } from '../output/artifact-resolve.js';
import { resolveObfuscatedConfigFile } from '../output/obfuscated-config.js';
import type { CliOptions } from '../types/config.js';
import type { CheckIssue, CheckReport } from './types.js';

export type { CheckIssue, CheckReport } from './types.js';

/** 聚合 clone + code + 预设门禁（Sprint 6 端到端验收入口） */
export async function runCheck(
  projectPath: string,
  options: Partial<CliOptions> = {},
): Promise<CheckReport> {
  const resolved = path.resolve(projectPath);
  const config = await loadConfig(resolved, options);
  const mode = config.mode;
  const issues: CheckIssue[] = [];

  const pathGate = await runPathCheckGate(resolved, mode, config.pathWhitelist);
  issues.push(...pathGate.issues);

  for (const w of checkPresetWarnings(config)) {
    issues.push({
      severity: w.level === 'warn' ? 'warn' : 'info',
      category: 'preset',
      message: w.message,
    });
  }

  const codeGate = await runCodeCheckGate(resolved, mode);
  issues.push(...codeGate.issues);
  issues.push(...clonePathMappingIssues(mode, pathGate.pathsMapPath, codeGate.coverage));

  const hasError = issues.some((i) => i.severity === 'error');
  const report: CheckReport = {
    project: resolved,
    mode,
    passed: !hasError,
    issueCount: issues.length,
    issues,
    coverage: codeGate.coverage,
    checkedAt: new Date().toISOString(),
  };

  const artifactRoot = resolveArtifactProjectRoot(resolved);
  const reportPath = await resolveObfuscatedConfigFile(
    artifactRoot,
    modeArtifactName(mode, ARTIFACT_JSON.checkReport),
  );
  await fs.writeJson(reportPath, report, { spaces: 2 });

  return report;
}

export { checkRouteConsistency, parsePagesJsonRoutes, resolvePageFile } from '../path/route-check.js';
export { scanResidualPaths } from '../path/residual-check.js';
export { analyzeCoverage } from '../code/coverage.js';
export { checkPresetWarnings } from '../config/preset-warnings.js';
