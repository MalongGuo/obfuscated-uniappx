import path from 'node:path';
import fg from 'fast-glob';
import type { ObfuscatorConfig } from '../types/config.js';

export const SOURCE_EXTENSIONS = ['.uts', '.uvue', '.vue', '.js', '.ts', '.jsx', '.tsx', '.nvue'];
export const CONFIG_FILES = ['pages.json', 'manifest.json', 'main.uts', 'main.js', 'App.uvue', 'App.vue'];

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
}

export async function scanProject(projectPath: string, config: ObfuscatorConfig): Promise<ScannedFile[]> {
  const cwd = path.resolve(projectPath);
  const patterns = config.include.length > 0 ? config.include : ['**/*'];

  const entries = await fg(patterns, {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: config.exclude,
    dot: false,
  });

  return entries
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return SOURCE_EXTENSIONS.includes(ext) || CONFIG_FILES.includes(path.basename(file));
    })
    .map((absolutePath) => ({
      absolutePath,
      relativePath: path.relative(cwd, absolutePath),
      extension: path.extname(absolutePath).toLowerCase(),
    }));
}

export function groupFilesByExtension(files: ScannedFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    counts[file.extension] = (counts[file.extension] ?? 0) + 1;
  }
  return counts;
}
