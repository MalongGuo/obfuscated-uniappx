import path from 'node:path';
import chalk from 'chalk';
import { runFix } from '../fix/index.js';
import type { CommandLoadOptions } from '../types/command-options.js';
import { pickLoadOptions } from '../types/command-options.js';
import type { ObfuscationMode } from '../types/config.js';

const MODE_LABELS: Record<ObfuscationMode, string> = {
  clone: '路径混淆',
  code: '代码混淆',
  full: '完整混淆',
  preload: '预分析',
};

export async function fixCommand(
  projectPath: string,
  options: CommandLoadOptions = {},
): Promise<void> {
  const resolved = path.resolve(projectPath);
  const result = await runFix(resolved, pickLoadOptions(options));

  console.log(chalk.bold('\n修复结果:'));
  console.log(`  项目: ${resolved}`);
  console.log(`  模式: ${result.mode}（${MODE_LABELS[result.mode]}）`);
  if (result.skipped) {
    console.log(chalk.dim(`  ${result.skipReason}`));
    console.log(chalk.green.bold('\n✔ code 模式无需路径修复\n'));
    return;
  }

  console.log(`  pages.json 修复: ${result.pagesJsonFixed} 处`);
  console.log(`  组件标签同步: ${result.componentTagsSynced} 个`);
  console.log(`  相对 import 修复: ${result.importFilesFixed} 个文件`);
  console.log(`  路由问题: ${result.routeIssuesBefore} → ${result.routeIssuesAfter}`);

  if (result.fixes.length > 0) {
    console.log(chalk.bold('\n  修复明细（前 20 条）:'));
    for (const fix of result.fixes.slice(0, 20)) {
      const scope = fix.subPackageRoot ? chalk.dim(` @ ${fix.subPackageRoot}`) : '';
      console.log(`  ${chalk.green('✓')} ${fix.key}: ${fix.oldValue} → ${fix.newValue}${scope}`);
    }
    if (result.fixes.length > 20) {
      console.log(chalk.dim(`  ... 另有 ${result.fixes.length - 20} 处`));
    }
  } else {
    console.log(chalk.yellow('\n  未发现可自动修复的 pages.json 路由问题'));
  }

  if (result.routeIssuesAfter === 0) {
    console.log(chalk.green.bold('\n✔ 路由问题已全部修复\n'));
  } else if (result.routeIssuesAfter < result.routeIssuesBefore) {
    console.log(chalk.yellow.bold(`\n⚠ 仍有 ${result.routeIssuesAfter} 个路由问题，请重新 check 查看详情\n`));
  } else {
    console.log(chalk.yellow.bold('\n⚠ 未能减少路由问题，请确认 obfuscation-map-paths.json 是否存在\n'));
  }
}
