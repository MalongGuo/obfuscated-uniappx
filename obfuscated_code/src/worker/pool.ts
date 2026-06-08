import os from 'node:os';

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, item: T, index: number, result: R) => void,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index]!;
      results[index] = await worker(item, index);
      completed++;
      onProgress?.(completed, items.length, item, index, results[index]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

/** 并行数 = ceil(核数/2)；结果为 1 时保持 1，否则向上取偶 */
export function computeConcurrency(cpuCount: number): number {
  let n = Math.ceil(cpuCount / 2);
  if (n === 1) return 1;
  if (n % 2 !== 0) n += 1;
  return n;
}

export function defaultConcurrency(): number {
  return computeConcurrency(os.cpus().length);
}

export interface StageConcurrencyRow {
  stage: string;
  concurrency: string;
}

export function formatConcurrencyLabel(concurrency: number): string {
  return concurrency === 1 ? '1 线程' : `${concurrency} 并发`;
}

export function buildPathCloneConcurrencyRows(concurrency: number): StageConcurrencyRow[] {
  const label = formatConcurrencyLabel(concurrency);
  return [
    { stage: '文件复制', concurrency: label },
    { stage: '目录重命名', concurrency: label },
    { stage: '内容路径替换', concurrency: label },
  ];
}

export function buildModeConcurrencyRows(
  concurrency: number,
  options: { runPathClone: boolean; runCodeObfuscate: boolean },
): StageConcurrencyRow[] {
  const label = formatConcurrencyLabel(concurrency);
  const skip = '不执行';
  return [
    { stage: '文件复制', concurrency: options.runPathClone ? label : skip },
    { stage: '目录重命名', concurrency: options.runPathClone ? label : skip },
    { stage: '内容路径替换', concurrency: options.runPathClone ? label : skip },
    {
      stage: '代码符号混淆',
      concurrency: options.runCodeObfuscate ? label : skip,
    },
  ];
}
