import path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { Logger } from '../logger/index.js';
import { createLogSession } from '../output/session.js';
import { resolveRunOutputPlan } from '../output/resolve.js';
import { runPreloadPhase, runTransformPhase } from '../pipeline/index.js';
import type { CliOptions } from '../types/config.js';
import type { FeatureFlags } from '../types/config.js';

const FEATURE_LABELS: Partial<Record<keyof FeatureFlags, string>> = {
  simulateManual: '模拟人工命名',
  resourceHash: '资源 hash 翻新',
  classFilePrefix: '目录 token 前缀',
  stripComments: '注释清理',
  renameFilenames: '文件名混淆',
  renameImageNames: '图片名混淆',
  encryptAllStrings: '字符串加密',
  insertJunkFuncProp: '垃圾函数/属性',
  renameFuncPropVarEnum: '标识符重命名',
  enhancedUiJunkCode: 'UI class/样式加强',
  colorNudge: '颜色值扰动',
  shuffleFuncOrder: '打乱定义顺序',
  disruptExecOrder: '扰乱执行顺序',
  controlFlowFlatten: '控制流平坦化',
  useNewJunkCode: '新垃圾代码引擎',
  ciphertextStrings: '密文字符串',
  renameProtocol: '协议名混淆',
};

export async function logRunPathPlan(projectPath: string, options: CliOptions): Promise<void> {
  const resolved = path.resolve(projectPath);
  const config = await loadConfig(resolved, options);
  const outputPlan = resolveRunOutputPlan(resolved, config);
  console.log(chalk.dim(`  源目录: ${resolved}`));
  console.log(chalk.dim(`  目标目录: ${outputPlan.outputPath}`));
}

export async function runCommand(projectPath: string, options: CliOptions): Promise<void> {
  const resolved = path.resolve(projectPath);
  const config = await loadConfig(resolved, options);
  const logger = new Logger({ verbose: options.verbose, debug: options.debug });

  logger.info(chalk.bold(`\nUniApp-X Obfuscator v0.1.0`));
  logger.info(`项目: ${resolved}`);
  if (config.mode === 'full') {
    logger.info('命令: run --mode full（Preload 解析 + 路径 clone + 代码混淆 + 资源处理）');
  }
  logger.info(`模式: ${config.mode} | 预设: ${config.preset} | 平台: ${config.platform}\n`);

  const sessionAt = new Date();
  const outputPlan = resolveRunOutputPlan(resolved, config, sessionAt);
  const logSession = config.generateLog
    ? createLogSession(resolved, outputPlan.token, sessionAt, path.basename(outputPlan.outputPath))
    : null;

  const start = Date.now();
  const preload = await runPreloadPhase(resolved, config, logger);
  const transform = await runTransformPhase(resolved, config, logger, {
    preload,
    token: outputPlan.token,
    outputPath: outputPlan.outputPath,
    tokenAuto: outputPlan.tokenAuto,
    seedFromSourceDir: outputPlan.seedFromSourceDir,
    logSession,
    sessionAt,
  });
  const result = { ...transform, durationMs: Date.now() - start };
  const timings = logger.getPhaseTimings();
  const timingStr = Object.entries(timings)
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}s`)
    .join(' | ');

  const featureLines = result.executedFeatures.map(({ key, executed, reason }) => {
    const label = FEATURE_LABELS[key] ?? key;
    const mark = executed ? chalk.green('[✓]') : chalk.gray('[✗]');
    const suffix = reason && !executed ? chalk.dim(` (${reason})`) : '';
    return `  ${mark} ${label}${suffix}`;
  });

  const cloneLines = result.cloneStats
    ? [
        `  Token: ${result.cloneStats.token}`,
        `  目录重命名: ${result.cloneStats.renamedCount} 个`,
        `  内容替换: ${result.cloneStats.replacedFileCount} 个文件`,
      ]
    : [];

  const codeLines = result.codeStats
    ? [
        `  代码混淆: ${result.codeStats.renamedFileCount} 个文件`,
        `  可重命名符号: ${result.codeStats.renameableCount} 个`,
      ]
    : [];

  const hasOutput = result.cloneStats || result.codeStats;

  logger.summary([
    chalk.green.bold('✔ 混淆流水线执行完成'),
    `  输出路径: ${result.outputPath}`,
    `  扫描文件: ${result.fileCount} 个`,
    ...cloneLines,
    ...codeLines,
    ...(hasOutput ? ['  运行日志: obfuscation-log.txt'] : []),
    `  耗时: ${(result.durationMs / 1000).toFixed(2)}s (${timingStr})`,
    chalk.bold('\n  实际执行:'),
    ...featureLines,
  ]);
}
