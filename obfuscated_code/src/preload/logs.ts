import type { ObfuscationMode } from '../types/config.js';
import { writeConfigJson } from '../output/obfuscated-config.js';

export type PreloadLogTask = 'vocab' | 'symbols' | 'sensitive' | 'paths';

/** `{mode}-{task}.json`，如 `code-symbols.json` */
export function preloadLogFilename(mode: ObfuscationMode, task: PreloadLogTask): string {
  return `${mode}-${task}.json`;
}

export async function writePreloadLog(
  projectPath: string,
  mode: ObfuscationMode,
  task: PreloadLogTask,
  data: Record<string, unknown>,
): Promise<string> {
  return writeConfigJson(projectPath, preloadLogFilename(mode, task), {
    timestamp: new Date().toISOString(),
    mode,
    task,
    ...data,
  });
}
