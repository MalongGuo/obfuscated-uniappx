import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { obfuscatedConfigLabel } from '../output/obfuscated-config.js';
import { preloadLogFilename } from './logs.js';
import { runPreloadVocab } from './vocab.js';
import { runPreloadSymbols } from './symbols.js';
import { runPreloadSensitive } from './sensitive.js';
import { runPreloadPaths } from './paths.js';

export { extractVocab, runPreloadVocab } from './vocab.js';
export { extractSymbols, runPreloadSymbols, formatFileSymbols } from './symbols.js';
export { scanSensitive, runPreloadSensitive } from './sensitive.js';
export { extractPathsPreload, runPreloadPaths } from './paths.js';
export { preloadLogFilename } from './logs.js';
export type { PreloadLogTask } from './logs.js';

export interface PreloadPipelineResult {
  mode: ObfuscatorConfig['mode'];
  vocab?: Awaited<ReturnType<typeof runPreloadVocab>>['result'];
  symbols?: Awaited<ReturnType<typeof runPreloadSymbols>>['result'];
  sensitive: Awaited<ReturnType<typeof runPreloadSensitive>>['result'];
  paths?: Awaited<ReturnType<typeof runPreloadPaths>>['result'];
  logPaths: {
    vocab?: string;
    symbols?: string;
    sensitive: string;
    paths?: string;
    /** full 模式下 clone 段产物 */
    cloneSensitive?: string;
    codeSensitive?: string;
  };
  durationMs: number;
}

function phaseKey(mode: string): string {
  return `Preload (${mode})`;
}

type PreloadArtifactMode = 'clone' | 'code';

async function runClonePreloadSteps(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
  artifactMode: Extract<PreloadArtifactMode, 'clone'> = 'clone',
): Promise<{
  sensitive: Awaited<ReturnType<typeof runPreloadSensitive>>['result'];
  paths: Awaited<ReturnType<typeof runPreloadPaths>>['result'];
  logPaths: { sensitive: string; paths: string };
}> {
  logger.info('  clone 预分析: 路径审计 + 敏感字符串');
  logger.info('  [1/2] 路径审计（tabBar / 冲突 / 路径白名单）...');
  const pathsOut = await runPreloadPaths(projectPath, config, artifactMode);
  logger.info(`    tabBar ${pathsOut.result.tabBarPaths.length} 条 | 冲突 ${pathsOut.result.pathConflicts.length} 条`);
  logger.info(`    路径白名单合并 ${pathsOut.result.pathWhitelist.mergedCount} 条`);
  logger.info(`    文件: ${obfuscatedConfigLabel(projectPath, preloadLogFilename(artifactMode, 'paths'))}`);

  logger.info('  [2/2] 扫描敏感字符串...');
  const sensitiveOut = await runPreloadSensitive(projectPath, config, artifactMode);
  logger.info(`    发现 ${sensitiveOut.result.count} 处`);
  logger.info(`    文件: ${obfuscatedConfigLabel(projectPath, preloadLogFilename(artifactMode, 'sensitive'))}`);

  return {
    sensitive: sensitiveOut.result,
    paths: pathsOut.result,
    logPaths: { sensitive: sensitiveOut.logPath, paths: pathsOut.logPath },
  };
}

async function runCodePreloadSteps(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
  artifactMode: Extract<PreloadArtifactMode, 'code'> = 'code',
): Promise<{
  vocab: Awaited<ReturnType<typeof runPreloadVocab>>['result'];
  symbols: Awaited<ReturnType<typeof runPreloadSymbols>>['result'];
  sensitive: Awaited<ReturnType<typeof runPreloadSensitive>>['result'];
  logPaths: { vocab: string; symbols: string; sensitive: string };
}> {
  logger.info('  code 预分析: 词汇表 + 符号表 + 敏感字符串');

  logger.info('  [1/3] 提取词汇...');
  const vocabOut = await runPreloadVocab(projectPath, config, artifactMode);
  logger.info(
    `    函数 ${vocabOut.result.functions.length} | 类 ${vocabOut.result.classes.length} | 属性 ${vocabOut.result.properties.length}`,
  );
  logger.info(`    文件: ${obfuscatedConfigLabel(projectPath, preloadLogFilename(artifactMode, 'vocab'))}`);

  logger.info('  [2/3] 构建符号表...');
  const symbolsOut = await runPreloadSymbols(projectPath, config, undefined, artifactMode);
  logger.info(
    `    符号 ${symbolsOut.result.symbolCount} | 可重命名 ${symbolsOut.result.renameableCount}`,
  );
  if (symbolsOut.result.parseErrorCount > 0) {
    logger.warn(`    解析警告: ${symbolsOut.result.parseErrorCount} 个文件`);
  }
  logger.info(`    文件: ${obfuscatedConfigLabel(projectPath, preloadLogFilename(artifactMode, 'symbols'))}`);

  logger.info('  [3/3] 扫描敏感字符串...');
  const sensitiveOut = await runPreloadSensitive(projectPath, config, artifactMode);
  logger.info(`    发现 ${sensitiveOut.result.count} 处`);
  logger.info(`    文件: ${obfuscatedConfigLabel(projectPath, preloadLogFilename(artifactMode, 'sensitive'))}`);

  return {
    vocab: vocabOut.result,
    symbols: symbolsOut.result,
    sensitive: sensitiveOut.result,
    logPaths: {
      vocab: vocabOut.logPath,
      symbols: symbolsOut.logPath,
      sensitive: sensitiveOut.logPath,
    },
  };
}

/** clone：路径 + 敏感字符串；code：词汇 + 符号 + 敏感字符串；full：依次执行 clone + code */
export async function runModePreloadPipeline(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<PreloadPipelineResult> {
  const start = Date.now();
  const mode = config.mode;

  logger.phase(phaseKey(mode));

  switch (mode) {
    case 'clone': {
      const cloneOut = await runClonePreloadSteps(projectPath, config, logger, 'clone');
      logger.endPhase(phaseKey(mode));
      return {
        mode,
        sensitive: cloneOut.sensitive,
        paths: cloneOut.paths,
        logPaths: cloneOut.logPaths,
        durationMs: Date.now() - start,
      };
    }

    case 'code': {
      const codeOut = await runCodePreloadSteps(projectPath, config, logger, 'code');
      logger.endPhase(phaseKey(mode));
      return {
        mode,
        vocab: codeOut.vocab,
        symbols: codeOut.symbols,
        sensitive: codeOut.sensitive,
        logPaths: codeOut.logPaths,
        durationMs: Date.now() - start,
      };
    }

    case 'full': {
      logger.info('  full 预分析: clone 路径项 + code 符号项');
      const cloneOut = await runClonePreloadSteps(projectPath, config, logger, 'clone');
      const codeOut = await runCodePreloadSteps(projectPath, config, logger, 'code');

      logger.endPhase(phaseKey(mode));
      return {
        mode,
        vocab: codeOut.vocab,
        symbols: codeOut.symbols,
        sensitive: codeOut.sensitive,
        paths: cloneOut.paths,
        logPaths: {
          vocab: codeOut.logPaths.vocab,
          symbols: codeOut.logPaths.symbols,
          sensitive: codeOut.logPaths.sensitive,
          paths: cloneOut.logPaths.paths,
          cloneSensitive: cloneOut.logPaths.sensitive,
          codeSensitive: codeOut.logPaths.sensitive,
        },
        durationMs: Date.now() - start,
      };
    }

    default:
      throw new Error(`preload 不支持 mode: ${mode}`);
  }
}

/** @deprecated 使用 runModePreloadPipeline */
export const runPreloadPipeline = runModePreloadPipeline;
