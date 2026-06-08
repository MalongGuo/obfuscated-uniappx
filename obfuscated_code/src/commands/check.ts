import path from 'node:path';
import chalk from 'chalk';
import { runCheck } from '../check/index.js';
import { obfuscatedConfigLabel } from '../output/obfuscated-config.js';
import type { CommandLoadOptions } from '../types/command-options.js';
import { pickLoadOptions } from '../types/command-options.js';
import type { ObfuscationMode } from '../types/config.js';

const CATEGORY_LABELS: Record<string, string> = {
  conflict: '路径冲突',
  route: '路由一致性',
  residual: '残留旧路径',
  coverage: '混淆覆盖率',
  preset: '预设告警',
};

const MODE_LABELS: Record<ObfuscationMode, string> = {
  clone: '路径混淆',
  code: '代码混淆',
  full: '完整混淆',
  preload: '预分析',
};

export async function checkCommand(
  projectPath: string,
  options: CommandLoadOptions = {},
): Promise<void> {
  const resolved = path.resolve(projectPath);
  const report = await runCheck(resolved, pickLoadOptions(options));

  console.log(chalk.bold('\n检查结果:'));
  console.log(`  项目: ${resolved}`);
  console.log(`  模式: ${report.mode}（${MODE_LABELS[report.mode]}）`);
  console.log(`  问题: ${report.issueCount} 项`);

  if (report.coverage) {
    console.log(chalk.dim(
      `  覆盖率: 路径 ${report.coverage.pathMappings} | 符号 ${report.coverage.symbolMappings}`
      + ` (函数 ${report.coverage.functions} / 属性 ${report.coverage.properties})`,
    ));
  }

  const grouped = new Map<string, typeof report.issues>();
  for (const issue of report.issues) {
    const list = grouped.get(issue.category) ?? [];
    list.push(issue);
    grouped.set(issue.category, list);
  }

  for (const [category, issues] of grouped) {
    console.log(chalk.bold(`\n  [${CATEGORY_LABELS[category] ?? category}]`));
    for (const issue of issues) {
      const icon = issue.severity === 'error'
        ? chalk.red('✗')
        : issue.severity === 'warn'
          ? chalk.yellow('⚠')
          : chalk.blue('ℹ');
      const loc = issue.file ? chalk.dim(` (${issue.file}${issue.line ? `:${issue.line}` : ''})`) : '';
      console.log(`  ${icon} ${issue.message}${loc}`);
    }
  }

  console.log(chalk.dim(`\n  报告已保存: ${obfuscatedConfigLabel(resolved, 'obfuscation-check-report.json')}`));

  if (report.passed) {
    console.log(chalk.green.bold('\n✔ check 通过（无 error 级问题）\n'));
  } else {
    console.log(chalk.red.bold('\n✗ check 未通过，请修复 error 级问题\n'));
    process.exitCode = 1;
  }
}
