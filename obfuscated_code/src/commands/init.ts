import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { createInitConfig } from '../config/defaults.js';
import { resolveArtifactProjectRoot } from '../output/artifacts.js';
import {
  ensureObfuscatedRoot,
  obfuscatedConfigLabel,
  obfuscatorConfigLabel,
  resolveObfuscatorConfigPath,
} from '../output/obfuscated-config.js';
import { ensureWhitelistJson } from '../whitelist/generator.js';
import type { CommandLoadOptions } from '../types/command-options.js';
import type { ObfuscationMode } from '../types/config.js';

const MODE_LABELS: Record<ObfuscationMode, string> = {
  clone: '路径混淆',
  code: '代码混淆（标识符+注释）',
  full: '完整混淆（路径+代码）',
  preload: '预分析（词汇/符号/敏感字符串）',
};

export interface EnsureInitResult {
  initRoot: string;
  configPath: string;
  configCreated: boolean;
}

/**
 * 任务命令（run / preload / check / fix）执行前确保 obfuscated/ 已初始化。
 * 配置已存在时 warn 并继续，不阻断后续命令。
 */
export async function ensureProjectInit(
  projectPath: string,
  options: CommandLoadOptions = {},
): Promise<EnsureInitResult> {
  const resolved = path.resolve(projectPath);
  const initRoot = resolveArtifactProjectRoot(resolved);
  if (initRoot !== resolved) {
    console.log(
      chalk.dim(
        `  init 目标: ${initRoot}（由 ${path.basename(resolved)} 回退到源项目）`,
      ),
    );
  }

  await ensureObfuscatedRoot(initRoot);

  const whitelistPath = await ensureWhitelistJson(initRoot);
  if (whitelistPath) {
    console.log(chalk.green(`✔ 已生成白名单: ${obfuscatedConfigLabel(initRoot, 'whitelist.json')}`));
  }

  const configPath = resolveObfuscatorConfigPath(initRoot);

  if (await fs.pathExists(configPath)) {
    console.log(chalk.yellow(`⚠ 配置文件已存在: ${obfuscatorConfigLabel()}（${configPath}）`));
    return { initRoot, configPath, configCreated: false };
  }

  const config = createInitConfig();
  if (options.mode && options.mode !== 'preload') {
    config.mode = options.mode;
  }

  await fs.writeJson(configPath, config, { spaces: 2 });
  console.log(chalk.green(`✔ 已生成配置文件: ${obfuscatorConfigLabel()}`));
  console.log(chalk.dim(`  路径: ${configPath}`));
  console.log(
    chalk.dim(
      `  mode: ${config.mode}（${MODE_LABELS[config.mode]}）| preset: ${config.preset}（features 全开）`,
    ),
  );

  return { initRoot, configPath, configCreated: true };
}

export async function initCommand(
  projectPath: string,
  options: CommandLoadOptions = {},
): Promise<void> {
  await ensureProjectInit(projectPath, options);
}
