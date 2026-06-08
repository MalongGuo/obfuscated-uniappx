import chalk from 'chalk';

export type LogLevel = 'info' | 'detail' | 'debug' | 'summary';

export interface LoggerOptions {
  verbose?: boolean;
  debug?: boolean;
}

export class Logger {
  private verbose: boolean;
  private debugEnabled: boolean;
  private phaseStart = 0;
  private phaseTimings: Record<string, number> = {};

  constructor(options: LoggerOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.debugEnabled = options.debug ?? false;
  }

  phase(name: string): void {
    this.phaseStart = Date.now();
    this.info(chalk.cyan(`[${name}]`) + ' 开始...');
  }

  endPhase(name: string): void {
    const elapsed = Date.now() - this.phaseStart;
    this.phaseTimings[name] = elapsed;
    this.info(chalk.cyan(`[${name}]`) + ` 完成 (${(elapsed / 1000).toFixed(2)}s)`);
  }

  info(message: string): void {
    console.log(message);
  }

  isVerbose(): boolean {
    return this.verbose;
  }

  detail(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('  ') + message);
    }
  }

  /** 长任务进度：默认每 interval 条或首尾打印；verbose 时每条都打印 */
  progress(
    label: string,
    current: number,
    total: number,
    detail?: string,
    interval = 50,
  ): void {
    const shouldPrint =
      this.verbose ||
      current === 1 ||
      current === total ||
      current % interval === 0;
    if (!shouldPrint) return;

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const suffix = detail ? ` ${detail}` : '';
    console.log(`  [${label}] ${current}/${total} (${pct}%)${suffix}`);
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      console.log(chalk.dim('[debug] ') + message);
    }
  }

  warn(message: string): void {
    console.log(chalk.yellow('⚠ ') + message);
  }

  error(message: string): void {
    console.error(chalk.red('✖ ') + message);
  }

  summary(lines: string[]): void {
    console.log('');
    for (const line of lines) {
      console.log(line);
    }
    console.log('');
  }

  /** 阶段并发一览表（启动时展示） */
  stageConcurrencyTable(
    title: string,
    rows: Array<{ stage: string; concurrency: string }>,
  ): void {
    const stageW = Math.max('阶段'.length, ...rows.map((r) => r.stage.length));
    const concW = Math.max('并发'.length, ...rows.map((r) => r.concurrency.length));

    console.log('');
    console.log(chalk.bold(`  ${title}`));
    console.log(`  ${'阶段'.padEnd(stageW)}  ${'并发'.padEnd(concW)}`);
    for (const row of rows) {
      const padded = row.concurrency.padEnd(concW);
      const value =
        row.concurrency === '不执行' ? chalk.gray(padded) : chalk.cyan(padded);
      console.log(`  ${row.stage.padEnd(stageW)}  ${value}`);
    }
    console.log('');
  }

  getPhaseTimings(): Record<string, number> {
    return { ...this.phaseTimings };
  }
}
