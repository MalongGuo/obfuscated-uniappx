import path from 'node:path';
import chalk from 'chalk';
import { obfuscatedConfigLabel } from '../output/obfuscated-config.js';
import { preloadLogFilename } from '../preload/logs.js';
import {
  runModePreloadPipeline,
  runPreloadSensitive,
  runPreloadSymbols,
  runPreloadVocab,
  runPreloadPaths,
  formatFileSymbols,
} from '../preload/index.js';
import { Logger } from '../logger/index.js';
import type { ObfuscationMode } from '../types/config.js';
import {
  loadPreloadProjectContext,
  printWhitelistLoadSummary,
} from '../whitelist/project-whitelist.js';

export type PreloadRunMode = Exclude<ObfuscationMode, 'preload'>;

export const PRELOAD_MODE_HELP = 'clone | code | full（默认 full）';

export function parsePreloadRunMode(mode: string): PreloadRunMode {
  if (mode === 'clone' || mode === 'code' || mode === 'full') return mode;
  throw new Error(`preload --mode 仅支持 clone | code | full，收到: ${mode}`);
}

/** 未显式传 --mode 时默认 full */
export function resolvePreloadMode(cliMode?: string): PreloadRunMode {
  if (cliMode) return parsePreloadRunMode(cliMode);
  return 'full';
}

/** @deprecated 使用 resolvePreloadMode */
export function requirePreloadMode(mode?: string): PreloadRunMode {
  return resolvePreloadMode(mode);
}

async function loadPreloadModeContext(projectPath: string, mode: PreloadRunMode) {
  const resolved = path.resolve(projectPath);
  const ctx = await loadPreloadProjectContext(resolved, { mode });
  return { resolved, ...ctx };
}

export async function preloadVocabCommand(projectPath: string, mode: PreloadRunMode): Promise<void> {
  const { resolved, config, whitelist } = await loadPreloadModeContext(projectPath, mode);
  printWhitelistLoadSummary((message) => console.log(chalk.dim(message)), config, whitelist?.whitelist ?? null);
  const { result, logPath } = await runPreloadVocab(resolved, config);

  console.log(chalk.green(`✔ 词汇已导出: ${obfuscatedConfigLabel(resolved, preloadLogFilename(mode, 'vocab'))}`));
  console.log(`  函数: ${result.functions.length} | 类: ${result.classes.length} | 属性: ${result.properties.length}`);
  console.log(chalk.dim(`  写入: ${logPath}`));
}

export async function preloadSymbolsCommand(
  projectPath: string,
  mode: PreloadRunMode,
  fileFilter?: string,
): Promise<void> {
  const { resolved, config, whitelist } = await loadPreloadModeContext(projectPath, mode);
  printWhitelistLoadSummary((message) => console.log(chalk.dim(message)), config, whitelist?.whitelist ?? null);
  const { result, table, logPath } = await runPreloadSymbols(resolved, config, fileFilter);

  console.log(chalk.green(`✔ 符号表已导出: ${obfuscatedConfigLabel(resolved, preloadLogFilename(mode, 'symbols'))}`));
  console.log(`  符号: ${result.symbolCount} | 可重命名: ${result.renameableCount}`);
  if (result.parseErrorCount > 0) {
    console.log(chalk.yellow(`  解析警告: ${result.parseErrorCount} 个文件`));
  }
  console.log(chalk.dim(`  写入: ${logPath}`));

  if (fileFilter) {
    const normalized = fileFilter.replace(/\\/g, '/');
    const fileSymbols = formatFileSymbols(table, normalized);
    console.log(chalk.cyan(`\n文件 ${normalized} 符号 (${fileSymbols.length}):`));
    for (const { name, kind, rename } of fileSymbols) {
      console.log(`  ${name} [${kind}] -> ${rename}`);
    }
  }
}

export async function preloadSensitiveCommand(projectPath: string, mode: PreloadRunMode): Promise<void> {
  const { resolved, config, whitelist } = await loadPreloadModeContext(projectPath, mode);
  printWhitelistLoadSummary((message) => console.log(chalk.dim(message)), config, whitelist?.whitelist ?? null);
  const { result, logPath } = await runPreloadSensitive(resolved, config);

  console.log(chalk.green(`✔ 敏感字符串扫描完成: ${result.count} 处`));
  console.log(`  报告: ${obfuscatedConfigLabel(resolved, preloadLogFilename(mode, 'sensitive'))}`);
  console.log(chalk.dim(`  写入: ${logPath}`));
  for (const item of result.findings.slice(0, 10)) {
    console.log(chalk.gray(`  [${item.type}] ${item.file}: ${item.value}`));
  }
  if (result.count > 10) {
    console.log(chalk.dim(`  ... 还有 ${result.count - 10} 处，见日志文件`));
  }
}

export async function preloadPathsCommand(projectPath: string, mode: PreloadRunMode): Promise<void> {
  const { resolved, config, whitelist } = await loadPreloadModeContext(projectPath, mode);
  printWhitelistLoadSummary((message) => console.log(chalk.dim(message)), config, whitelist?.whitelist ?? null);
  const { result, logPath } = await runPreloadPaths(resolved, config);

  console.log(chalk.green(`✔ 路径审计完成: ${obfuscatedConfigLabel(resolved, preloadLogFilename(mode, 'paths'))}`));
  console.log(`  tabBar: ${result.tabBarPaths.length} 条 | 冲突: ${result.pathConflicts.length} 条 | 路径白名单: ${result.pathWhitelist.mergedCount} 条`);
  console.log(chalk.dim(`  写入: ${logPath}`));
}

export async function preloadModeCommand(projectPath: string, mode: PreloadRunMode): Promise<void> {
  const { resolved, config, whitelist } = await loadPreloadModeContext(projectPath, mode);
  const logger = new Logger({ verbose: false });

  logger.info(chalk.bold('\nUniApp-X Obfuscator v0.1.0'));
  logger.info(`项目: ${resolved}`);
  logger.info(`命令: preload --mode ${mode}`);
  if (mode === 'full') {
    logger.info('内容: clone 路径项 + code 符号项（全部预分析）');
  } else if (mode === 'clone') {
    logger.info('内容: 路径审计 + 敏感字符串');
  } else if (mode === 'code') {
    logger.info('内容: 词汇 + 符号 + 敏感字符串');
  }
  logger.info(`预设: ${config.preset} | 平台: ${config.platform}\n`);
  printWhitelistLoadSummary((message) => logger.info(message), config, whitelist?.whitelist ?? null);

  const result = await runModePreloadPipeline(resolved, config, logger);
  const preloadKey = `Preload (${mode})`;
  const timings = logger.getPhaseTimings();
  const timingStr = Object.entries(timings)
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}s`)
    .join(' | ');

  const summary: string[] = [chalk.green.bold(`✔ Preload (${mode}) 完成`)];

  if (result.vocab) {
    summary.push(
      `  词汇: 函数 ${result.vocab.functions.length} | 类 ${result.vocab.classes.length} | 属性 ${result.vocab.properties.length}`,
    );
  }
  if (result.symbols) {
    summary.push(`  符号: ${result.symbols.symbolCount} 个（可重命名 ${result.symbols.renameableCount}）`);
  }
  summary.push(`  敏感字符串: ${result.sensitive.count} 处`);
  if (result.paths) {
    summary.push(
      `  路径: tabBar ${result.paths.tabBarPaths.length} 条 | 白名单合并 ${result.paths.pathWhitelist.mergedCount} 条`,
    );
  }

  const logNames = mode === 'full'
    ? ([
        preloadLogFilename('clone', 'paths'),
        preloadLogFilename('clone', 'sensitive'),
        preloadLogFilename('code', 'vocab'),
        preloadLogFilename('code', 'symbols'),
        preloadLogFilename('code', 'sensitive'),
      ] as const)
    : ([
        result.logPaths.vocab && preloadLogFilename(mode, 'vocab'),
        result.logPaths.symbols && preloadLogFilename(mode, 'symbols'),
        result.logPaths.sensitive && preloadLogFilename(mode, 'sensitive'),
        result.logPaths.paths && preloadLogFilename(mode, 'paths'),
      ].filter(Boolean) as string[]);
  summary.push('  文件:');
  for (const filename of logNames) {
    summary.push(`    ${obfuscatedConfigLabel(resolved, filename)}`);
  }
  summary.push(`  耗时: ${(timings[preloadKey] ?? result.durationMs) / 1000}s (${timingStr})`);
  summary.push(chalk.dim(`  run --mode ${mode} 将另行执行解析 + 混淆（与 preload 不同）`));
  if (mode === 'full') {
    summary.push(chalk.dim('  full = clone 路径项 + code 符号项'));
  }

  logger.summary(summary);
}

/** @deprecated 使用 preloadModeCommand */
export const preloadAllCommand = preloadModeCommand;
