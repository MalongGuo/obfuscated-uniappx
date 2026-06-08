import path from 'node:path';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import type { ParsedFile } from '../parser/types.js';
import type { SymbolTable } from '../symbols/types.js';
import { scanProject, groupFilesByExtension } from '../scanner/index.js';
import { parseProject } from '../parser/index.js';
import { buildSymbolTable } from '../symbols/index.js';
import { obfuscatedConfigLabel } from '../output/obfuscated-config.js';
import { ARTIFACT_JSON, modeArtifactName } from '../output/artifact-names.js';
import { writeAnalyzeLogs } from '../output/session-logs.js';
import {
  buildSymbolWhitelistOptions,
  loadProjectWhitelist,
  printWhitelistLoadSummary,
} from '../whitelist/project-whitelist.js';

export interface AnalyzePhaseResult {
  files: Awaited<ReturnType<typeof scanProject>>;
  parsed: ParsedFile[];
  symbolTable: SymbolTable;
  fileCount: number;
  extensionCounts: Record<string, number>;
  symbolStats: {
    total: number;
    renameable: number;
    parseErrors: number;
  };
}

/** run / preload --mode：扫描、解析、符号表、分析日志（与 run 第一阶段相同） */
export async function runPreloadPhase(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<AnalyzePhaseResult> {
  const resolvedProject = path.resolve(projectPath);

  logger.phase(`Preload (${config.mode})`);
  logger.info('  说明:');
  logger.info(`    分析阶段 preload --mode ${config.mode}`);
  logger.info(`    运行阶段 run --mode ${config.mode}`);
  const projectWhitelistResolved = await loadProjectWhitelist(resolvedProject);
  const projectWhitelist = projectWhitelistResolved?.whitelist ?? null;
  printWhitelistLoadSummary((message) => logger.info(message), config, projectWhitelist);

  const symbolWhitelistOpts = buildSymbolWhitelistOptions(projectWhitelist, config.sensitiveStrings);

  const files = await scanProject(resolvedProject, config);
  const extensionCounts = groupFilesByExtension(files);
  logger.info(`  扫描到 ${files.length} 个源文件`);
  for (const [ext, count] of Object.entries(extensionCounts)) {
    logger.detail(`  ${ext}: ${count}`);
  }

  const parsed = await parseProject(files);
  const symbolTable = buildSymbolTable(parsed, {
    keepExports: config.keepExports,
    customWhitelist: symbolWhitelistOpts.customWhitelist,
  });
  const symbolStats = {
    total: symbolTable.symbols.size,
    renameable: [...symbolTable.symbols.values()].filter((s) => s.renameable).length,
    parseErrors: symbolTable.parseErrors.length,
  };
  logger.info(`  符号表: ${symbolStats.total} 个符号，${symbolStats.renameable} 个可重命名`);
  if (symbolStats.parseErrors > 0) {
    logger.warn(`  解析警告: ${symbolStats.parseErrors} 个文件`);
  }

  if (config.generateLog) {
    await writeAnalyzeLogs(resolvedProject, config.mode, parsed, symbolTable);
    logger.info(`  uniappx解析日志: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.utsParse))}`);
    logger.info(`  其它文件解析日志: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.parse))}`);
    logger.info(`  符号收集: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.symbolsCollect))}`);
  }
  logger.endPhase(`Preload (${config.mode})`);

  return {
    files,
    parsed,
    symbolTable,
    fileCount: files.length,
    extensionCounts,
    symbolStats,
  };
}

/** @deprecated 使用 runPreloadPhase */
export const runAnalyzePhase = runPreloadPhase;
