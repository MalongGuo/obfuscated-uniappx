import path from 'node:path';
import os from 'node:os';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { resolveExecutedFeatures } from '../output/feature-report.js';
import { runPathClone } from '../path/clone.js';
import { copyProjectToOutput } from '../code/copy.js';
import { hasScriptTransforms, runCodeObfuscate } from '../code/obfuscate.js';
import { runColorNudgeTransforms, runStylesheetClassTransforms, writeProguardTemplate } from '../transforms/resource-phase.js';
import { writeObfuscationLog } from '../output/log.js';
import { obfuscatedConfigLabel } from '../output/obfuscated-config.js';
import { copyObfuscatedConfigToOutput } from '../output/sync-preload-rules.js';
import { resolveArtifactProjectRoot } from '../output/artifacts.js';
import { ARTIFACT_JSON, modeArtifactName } from '../output/artifact-names.js';
import type { LogSession } from '../output/session.js';
import type { AnalyzePhaseResult } from './analyze.js';
import { buildModeConcurrencyRows, defaultConcurrency } from '../worker/pool.js';

export interface TransformPhaseResult {
  outputPath: string;
  fileCount: number;
  extensionCounts: Record<string, number>;
  executedFeatures: ReturnType<typeof resolveExecutedFeatures>;
  cloneStats?: {
    token: string;
    renamedCount: number;
    replacedFileCount: number;
    fileRenameCount: number;
    imageRenameCount: number;
    resourceHashCount: number;
  };
  symbolStats?: AnalyzePhaseResult['symbolStats'];
  codeStats?: {
    renamedFileCount: number;
    renameableCount: number;
  };
  resourceStats?: {
    resourceHashCount: number;
    imageRenameCount: number;
    filenameRenameCount: number;
    colorFiles: number;
    stylesheetClassFiles: number;
  };
}

export interface RunTransformOptions {
  preload: AnalyzePhaseResult;
  token: string;
  outputPath: string;
  tokenAuto?: boolean;
  seedFromSourceDir?: string | null;
  logSession: LogSession | null;
  sessionAt: Date;
}

function codeObfuscateEnabled(config: ObfuscatorConfig): boolean {
  return hasScriptTransforms(config) ||
    (config.features.stripComments && config.commentStrip.enabled);
}

function resourceTransformsEnabled(config: ObfuscatorConfig): boolean {
  return Boolean(config.features.enhancedUiJunkCode || config.features.colorNudge);
}

/** clone / code / full 各 mode 的 Transform 阶段开关 */
export function resolveTransformStages(config: ObfuscatorConfig): {
  shouldRunPathClone: boolean;
  shouldRunCodeObfuscate: boolean;
  shouldRunResourcePhase: boolean;
} {
  return {
    shouldRunPathClone: config.mode === 'clone' || config.mode === 'full',
    shouldRunCodeObfuscate:
      (config.mode === 'code' || config.mode === 'full') && codeObfuscateEnabled(config),
    shouldRunResourcePhase:
      (config.mode === 'code' || config.mode === 'full') && resourceTransformsEnabled(config),
  };
}

/** run 流水线 Transform + Output：clone / code / full 实际混淆执行 */
export async function runTransformPhase(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
  options: RunTransformOptions,
): Promise<TransformPhaseResult> {
  const resolvedProject = path.resolve(projectPath);
  const copySourceProject = resolveArtifactProjectRoot(resolvedProject);
  const { preload, token, logSession, sessionAt, outputPath: plannedOutputPath, tokenAuto, seedFromSourceDir } = options;
  const { extensionCounts, symbolStats } = preload;

  let outputPath = '';
  let ranPathClone = false;
  let ranCodeObfuscate = false;
  let ranResourceTransforms = false;
  let ranStripComments = false;
  let cloneStats: TransformPhaseResult['cloneStats'];
  let codeStats: TransformPhaseResult['codeStats'];
  let resourceStats: TransformPhaseResult['resourceStats'];

  const { shouldRunPathClone, shouldRunCodeObfuscate, shouldRunResourcePhase } =
    resolveTransformStages(config);

  logger.phase('Transform');
  if (config.mode === 'full') {
    logger.info('  full 混淆: 路径 clone + 代码混淆 + 资源处理');
  }
  logger.info(`  模式: ${config.mode} | 范围: ${config.scope} | 预设: ${config.preset}`);
  const concurrency = defaultConcurrency();
  logger.stageConcurrencyTable('总结', buildModeConcurrencyRows(concurrency, {
    runPathClone: shouldRunPathClone,
    runCodeObfuscate: shouldRunCodeObfuscate,
  }));
  logger.detail(`  CPU ${os.cpus().length} 核`);

  if (shouldRunPathClone) {
    const cloneResult = await runPathClone(resolvedProject, config, logger, {
      token,
      outputPath: plannedOutputPath,
      session: logSession ?? undefined,
      copySourcePath: copySourceProject,
    });
    outputPath = cloneResult.outputPath;
    ranPathClone = true;
    cloneStats = {
      token: cloneResult.token,
      renamedCount: cloneResult.renamedCount,
      replacedFileCount: cloneResult.replacedFileCount,
      fileRenameCount: cloneResult.fileRenameCount,
      imageRenameCount: cloneResult.imageRenameCount,
      resourceHashCount: cloneResult.resourceHashCount,
    };
    logger.info(`  目录重命名: ${cloneResult.renamedCount} 个`);
    logger.info(`  内容替换: ${cloneResult.replacedFileCount} 个文件`);
  } else if (shouldRunCodeObfuscate || shouldRunResourcePhase) {
    outputPath = plannedOutputPath;
    if (copySourceProject !== resolvedProject) {
      logger.info(
        `  复制源项目: ${path.basename(copySourceProject)}（由混淆目录 ${path.basename(resolvedProject)} 回退）`,
      );
    }
    logger.info('  复制项目到输出目录...');
    await copyProjectToOutput(copySourceProject, config, outputPath);
    logger.info(`  已复制项目到: ${path.basename(outputPath)}`);
    const syncedConfig = await copyObfuscatedConfigToOutput(resolvedProject, outputPath);
    if (syncedConfig.length > 0) {
      logger.info(`  obfuscated 配置已同步到输出: ${syncedConfig.length} 个文件（同步后只读）`);
      for (const name of syncedConfig) {
        logger.detail(`    obfuscated/${name}`);
      }
    }
  }

  if (seedFromSourceDir) {
    logger.detail(`  源目录 token（作 seed）: ${seedFromSourceDir}`);
  }
  if (tokenAuto === false && seedFromSourceDir && token === seedFromSourceDir) {
    logger.detail(`  Token 前缀: ${token}（沿用源目录名）`);
  }

  let globalClassRenameMap = new Map<string, string>();
  let stylesheetClassFileCount = 0;
  if (shouldRunResourcePhase && config.features.enhancedUiJunkCode && outputPath) {
    const sheet = await runStylesheetClassTransforms(outputPath, config, logger);
    globalClassRenameMap = sheet.globalClassRenameMap;
    if (sheet.stylesheetClassFiles > 0) {
      stylesheetClassFileCount = sheet.stylesheetClassFiles;
      resourceStats = {
        ...(resourceStats ?? {
          resourceHashCount: 0,
          imageRenameCount: 0,
          filenameRenameCount: 0,
          colorFiles: 0,
          stylesheetClassFiles: 0,
        }),
        stylesheetClassFiles: sheet.stylesheetClassFiles,
      };
    }
  }

  if (shouldRunCodeObfuscate && outputPath) {
    const codeResult = await runCodeObfuscate(outputPath, config, logger, {
      session: logSession ?? undefined,
      sourceProjectPath: resolvedProject,
      globalClassRenameMap,
      stylesheetClassFiles: stylesheetClassFileCount,
    });
    ranCodeObfuscate = true;
    ranStripComments = config.features.stripComments && config.commentStrip.enabled;
    codeStats = {
      renamedFileCount: codeResult.renamedFileCount,
      renameableCount: codeResult.renameableCount,
    };
    if (config.features.renameFuncPropVarEnum) {
      logger.info(`  标识符重命名: ${codeResult.renamedFileCount} 个文件`);
      logger.info(`  可重命名符号: ${codeResult.renameableCount} 个`);
    }
  }

  if (shouldRunResourcePhase && outputPath) {
    if (config.features.colorNudge) {
      const colorFiles = await runColorNudgeTransforms(outputPath, config, logger);
      resourceStats = {
        resourceHashCount: resourceStats?.resourceHashCount ?? 0,
        imageRenameCount: resourceStats?.imageRenameCount ?? 0,
        filenameRenameCount: resourceStats?.filenameRenameCount ?? 0,
        colorFiles,
        stylesheetClassFiles: resourceStats?.stylesheetClassFiles ?? 0,
      };
    }
    ranResourceTransforms = Boolean(
      config.features.enhancedUiJunkCode || config.features.colorNudge,
    );
    await writeProguardTemplate(outputPath, config, logger);
  }

  logger.endPhase('Transform');

  if (outputPath && (ranCodeObfuscate || ranPathClone)) {
    const syncedFinal = await copyObfuscatedConfigToOutput(resolvedProject, outputPath);
    if (syncedFinal.length > 0) {
      logger.detail(`  映射/日志已同步到输出 obfuscated/config/: ${syncedFinal.length} 个文件`);
    }
  }

  logger.phase('Output');
  const executedFeatures = resolveExecutedFeatures(config, {
    ranPathClone,
    ranCodeObfuscate,
    ranResourceTransforms,
    ranStripComments,
    fileRenameCount: cloneStats?.fileRenameCount ?? 0,
    codeFileRenameCount: resourceStats?.filenameRenameCount ?? 0,
    resourceHashCount: cloneStats?.resourceHashCount ?? resourceStats?.resourceHashCount ?? 0,
    imageRenameCount: cloneStats?.imageRenameCount ?? resourceStats?.imageRenameCount ?? 0,
    colorFiles: resourceStats?.colorFiles ?? 0,
    stylesheetClassFiles: resourceStats?.stylesheetClassFiles ?? 0,
  });
  const phaseTimings = logger.getPhaseTimings();

  if (ranPathClone || shouldRunCodeObfuscate || shouldRunResourcePhase) {
    logger.info(`  输出目录: ${outputPath}`);

    if (logSession) {
      logger.info('  产物目录: obfuscated/config/');
      if (ranPathClone) {
        logger.info(`  路径日志: ${obfuscatedConfigLabel(resolvedProject, 'clone-log.txt')}`);
        logger.info(`  路径映射: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.mapPaths))}`);
      }
      if (ranCodeObfuscate) {
        logger.info(`  命名分配: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, 'naming-allocate.log.txt'))}`);
        logger.info(`  文件混淆: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, 'file-obfuscate.log.txt'))}`);
        logger.info(`  符号映射: ${obfuscatedConfigLabel(resolvedProject, `${config.mode}-obfuscation-map-{functions,properties,symbols,strings}.json`)}`);
        logger.info(`  变更清单: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.allChanges))}`);
        logger.info(`  CSS class 映射: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.cssClassMap))}`);
        if (config.features.stripComments && config.commentStrip.enabled) {
          logger.info(`  注释清理: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.commentStrip))}`);
        }
        if (config.features.encryptAllStrings || config.features.ciphertextStrings) {
          logger.info(`  字符串加密: ${obfuscatedConfigLabel(resolvedProject, modeArtifactName(config.mode, ARTIFACT_JSON.stringEncrypt))}`);
        }
      }
    } else {
      logger.detail('  分阶段日志已关闭（generateLog: false）');
    }

    const resultSoFar: TransformPhaseResult = {
      outputPath,
      fileCount: preload.fileCount,
      extensionCounts,
      executedFeatures,
      cloneStats,
      symbolStats,
      codeStats,
      resourceStats,
    };
    if (logSession) {
      const logPath = await writeObfuscationLog(
        resolvedProject,
        config,
        { ...resultSoFar, durationMs: 0 },
        phaseTimings,
      );
      logger.info(`  运行摘要: ${obfuscatedConfigLabel(resolvedProject, path.basename(logPath))}`);
    }
  } else {
    logger.info(`  计划输出目录: {项目名称}_{unixMs}_{token}`);
  }
  logger.endPhase('Output');

  return {
    outputPath,
    fileCount: preload.fileCount,
    extensionCounts,
    executedFeatures,
    cloneStats,
    symbolStats,
    codeStats,
    resourceStats,
  };
}
