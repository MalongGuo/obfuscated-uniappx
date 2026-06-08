import { describe, expect, it } from 'vitest';
import {
  buildModeConcurrencyRows,
  buildPathCloneConcurrencyRows,
  computeConcurrency,
  formatConcurrencyLabel,
} from '../src/worker/pool.js';

describe('computeConcurrency', () => {
  it('uses ceil(cores/2) rounded up to even', () => {
    expect(computeConcurrency(1)).toBe(1);
    expect(computeConcurrency(2)).toBe(1);
    expect(computeConcurrency(3)).toBe(2);
    expect(computeConcurrency(4)).toBe(2);
    expect(computeConcurrency(8)).toBe(4);
    expect(computeConcurrency(10)).toBe(6);
    expect(computeConcurrency(16)).toBe(8);
  });
});

describe('concurrency labels', () => {
  it('formats single thread vs parallel', () => {
    expect(formatConcurrencyLabel(1)).toBe('1 线程');
    expect(formatConcurrencyLabel(4)).toBe('4 并发');
  });

  it('builds clone path rows', () => {
    expect(buildPathCloneConcurrencyRows(4)).toEqual([
      { stage: '文件复制', concurrency: '4 并发' },
      { stage: '目录重命名', concurrency: '4 并发' },
      { stage: '内容路径替换', concurrency: '4 并发' },
    ]);
  });

  it('builds full mode rows with skip', () => {
    expect(buildModeConcurrencyRows(4, { runPathClone: true, runCodeObfuscate: false })).toEqual([
      { stage: '文件复制', concurrency: '4 并发' },
      { stage: '目录重命名', concurrency: '4 并发' },
      { stage: '内容路径替换', concurrency: '4 并发' },
      { stage: '代码符号混淆', concurrency: '不执行' },
    ]);
  });
});
