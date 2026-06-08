import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import type { ObfuscatorConfig } from '../types/config.js';
import { buildCopyIgnoreSet } from '../path/anchors.js';
import { getFrameworkCopyExcludeTopLevelDirs } from '../whitelist/load-framework.js';
import { getOutputBaseName } from '../output/resolve.js';

function shouldSkipCopy(
  relPath: string,
  outputBaseName: string,
  copyIgnore: Set<string>,
): boolean {
  if (!relPath || relPath === '.') return true;
  const top = relPath.split(path.sep)[0];
  if (copyIgnore.has(top!)) return false;
  if (relPath === outputBaseName || relPath.startsWith(`${outputBaseName}${path.sep}`)) return false;
  return true;
}

export async function copyProjectToOutput(
  projectPath: string,
  config: ObfuscatorConfig,
  outputPath: string,
): Promise<string> {
  const resolvedProject = path.resolve(projectPath);
  const outputBaseName = getOutputBaseName(config.outputDir);
  const copyIgnore = buildCopyIgnoreSet(config.exclude, getFrameworkCopyExcludeTopLevelDirs());

  const stagingPath = path.join(os.tmpdir(), `uniapp-obfuscate-${Date.now()}`);
  if (await fs.pathExists(stagingPath)) {
    await fs.remove(stagingPath);
  }

  await fs.copy(resolvedProject, stagingPath, {
    filter(src) {
      const rel = path.relative(resolvedProject, src);
      return shouldSkipCopy(rel, outputBaseName, copyIgnore);
    },
  });

  if (await fs.pathExists(outputPath)) {
    await fs.remove(outputPath);
  }
  await fs.move(stagingPath, outputPath);
  return outputPath;
}
