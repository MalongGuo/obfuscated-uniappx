import fg from 'fast-glob';
import { analyzeCoverage, type CoverageReport } from './coverage.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifact-resolve.js';
import type { CheckIssue } from '../check/types.js';
import type { ObfuscationMode } from '../types/config.js';

export interface CodeCheckGateResult {
  issues: CheckIssue[];
  coverage: CoverageReport;
}

/** code 阶段质量门禁：符号映射存在性 + 覆盖率启发式 */
export async function runCodeCheckGate(
  projectRoot: string,
  mode: ObfuscationMode,
): Promise<CodeCheckGateResult> {
  const issues: CheckIssue[] = [];
  const sampleFiles = ['main.js'];
  sampleFiles.push(
    ...await fg('pages/**/details/details.vue', { cwd: projectRoot, onlyFiles: true }).then((f) => f.slice(0, 1)),
  );

  const coverage = await analyzeCoverage(projectRoot, sampleFiles, mode);
  const shouldCheckSymbols = mode === 'code' || mode === 'full';

  if (shouldCheckSymbols) {
    const symbolsMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapSymbols, mode);
    const hasSplitMaps = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapFunctions, mode);

    if (mode === 'code' && !symbolsMapPath && !hasSplitMaps) {
      issues.push({
        severity: 'warn',
        category: 'coverage',
        message: 'code 模式未找到符号映射 JSON，请确认已对输出目录执行 run --mode code',
      });
    }

    if (coverage.symbolMappings === 0 && (symbolsMapPath || hasSplitMaps)) {
      issues.push({
        severity: 'info',
        category: 'coverage',
        message: '符号映射文件存在但未解析到分类数据',
      });
    }

    if (coverage.unobfuscatedSamples.length > 0 && coverage.symbolMappings > 0) {
      issues.push({
        severity: 'info',
        category: 'coverage',
        message: `仍检测到可读业务符号样本: ${coverage.unobfuscatedSamples.slice(0, 5).join(', ')}`,
      });
    }
  }

  return { issues, coverage };
}

/** clone 模式路径映射为空时的提示 */
export function clonePathMappingIssues(
  mode: ObfuscationMode,
  pathsMapPath: string | null,
  coverage: CoverageReport,
): CheckIssue[] {
  if (mode !== 'clone' || coverage.pathMappings > 0 || !pathsMapPath) return [];
  return [{
    severity: 'info',
    category: 'coverage',
    message: 'clone 模式路径映射为空，请确认 run --mode clone 已正确执行',
  }];
}
