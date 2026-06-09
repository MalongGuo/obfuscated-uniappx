#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand, logRunPathPlan } from './commands/run.js';
import { initCommand } from './commands/init.js';
import { checkCommand } from './commands/check.js';
import { fixCommand } from './commands/fix.js';
import {
  preloadModeCommand,
  preloadPathsCommand,
  resolvePreloadMode,
  PRELOAD_MODE_HELP,
  preloadSensitiveCommand,
  preloadSymbolsCommand,
  preloadVocabCommand,
} from './commands/preload.js';
import type { CliOptions } from './types/config.js';
import type { CommandLoadOptions } from './types/command-options.js';
import type { PreloadRunMode } from './commands/preload.js';
import { ensureProjectInit } from './commands/init.js';

const MODE_HELP = '混淆模式: clone | code | full（覆盖 obfuscator.config.json，默认 full）';

async function runWithProjectInit(
  project: string,
  opts: CommandLoadOptions,
  task: () => Promise<void>,
): Promise<void> {
  await ensureProjectInit(project, opts);
  await task();
}

function addModeOptions(cmd: Command): Command {
  return cmd
    .option('-c, --config <path>', '配置文件路径')
    .option('--mode <mode>', MODE_HELP)
    .option('--seed [seed]', '随机种子；留空、none 或 null 表示不使用 seed')
    .option('--preset <level>', '混淆预设: light | medium | heavy');
}

function addPreloadModeOption(cmd: Command): Command {
  return cmd.option('--mode <mode>', PRELOAD_MODE_HELP);
}

async function resolvePreloadModeForProject(
  project: string,
  opts: CommandLoadOptions,
): Promise<PreloadRunMode> {
  return resolvePreloadMode(opts.mode);
}

const program = new Command();

program
  .name('uniapp-obfuscate')
  .description('UniApp / UniApp-X 源码混淆 CLI 工具')
  .version('0.1.0');

program
  .command('run')
  .description('执行混淆流水线')
  .argument('<project>', '项目目录路径')
  .option('-c, --config <path>', '配置文件路径')
  .option('--preset <level>', '混淆预设: light | medium | heavy')
  .option('--mode <mode>', MODE_HELP)
  .option('--scope <scope>', '混淆范围: precise | full')
  .option('--platform <platform>', '目标平台')
  .option('-o, --output <dir>', '输出目录名')
  .option('--seed [seed]', '随机种子；留空、none 或 null 表示不使用 seed')
  .option('--no-seed', '不使用 seed（覆盖配置文件）')
  .option('--output-dir-naming <mode>', '已废弃：目录由 seed / --no-seed 决定')
  .option('--force-new', '强制生成新混淆名')
  .option('--stable', '固定混淆模式')
  .option('-v, --verbose', '详细日志')
  .option('--debug', '调试日志')
  .option('--no-map', '不生成映射文件')
  .option('--no-log', '不生成 obfuscated/config/ 分阶段诊断日志')
  .action(async (project: string, opts) => {
    await runWithProjectInit(project, opts, async () => {
      await logRunPathPlan(project, opts as CliOptions);
      await runCommand(project, opts as CliOptions);
    });
  });

addModeOptions(
  program
    .command('init')
    .description('生成 obfuscated/obfuscator.config.json（features 全开）')
    .argument('[project]', '项目目录路径', '.'),
).action(async (project: string, opts: CommandLoadOptions) => {
  await initCommand(project, opts);
});

addModeOptions(
  program
    .command('check')
    .description('提交前自查（按 mode 检查路径或代码层）')
    .argument('<project>', '项目或混淆输出目录'),
).action(async (project: string, opts: CommandLoadOptions) => {
  await runWithProjectInit(project, opts, () => checkCommand(project, opts));
});

addModeOptions(
  program
    .command('fix')
    .description('修复混淆输出（clone/full：路由与 import；code 模式跳过）')
    .argument('<project>', '混淆后的项目目录路径'),
).action(async (project: string, opts: CommandLoadOptions) => {
  await runWithProjectInit(project, opts, () => fixCommand(project, opts));
});

const preloadCmd = addPreloadModeOption(
  program
    .command('preload')
    .description('按 mode 预分析（clone/code/full 内容不同；与 run 的解析阶段不同）')
    .argument('<project>', '项目目录路径'),
).action(async (project: string, opts: CommandLoadOptions) => {
  const mode = await resolvePreloadModeForProject(project, opts);
  await runWithProjectInit(project, opts, () => preloadModeCommand(project, mode));
});

addPreloadModeOption(
  preloadCmd
    .command('vocab')
    .description('提取类名/函数名/属性名词汇表')
    .argument('<project>', '项目目录路径'),
).action(async (project: string, opts: CommandLoadOptions) => {
  const mode = await resolvePreloadModeForProject(project, opts);
  await runWithProjectInit(project, opts, () => preloadVocabCommand(project, mode));
});

addPreloadModeOption(
  preloadCmd
    .command('symbols')
    .description('解析源码并构建符号表（Babel + Vue SFC）')
    .argument('<project>', '项目目录路径')
    .option('-f, --file <path>', '终端额外打印指定文件的符号'),
).action(async (project: string, opts: CommandLoadOptions & { file?: string }) => {
  const mode = await resolvePreloadModeForProject(project, opts);
  await runWithProjectInit(project, opts, () => preloadSymbolsCommand(project, mode, opts.file));
});

addPreloadModeOption(
  preloadCmd
    .command('sensitive')
    .description('扫描敏感字符串（URL/API Key/手机号等）')
    .argument('<project>', '项目目录路径'),
).action(async (project: string, opts: CommandLoadOptions) => {
  const mode = await resolvePreloadModeForProject(project, opts);
  await runWithProjectInit(project, opts, () => preloadSensitiveCommand(project, mode));
});

addPreloadModeOption(
  preloadCmd
    .command('paths')
    .description('路径审计（tabBar / 冲突 / 路径白名单）')
    .argument('<project>', '项目目录路径'),
).action(async (project: string, opts: CommandLoadOptions) => {
  const mode = await resolvePreloadModeForProject(project, opts);
  await runWithProjectInit(project, opts, () => preloadPathsCommand(project, mode));
});

program.parse();
