import path from 'node:path';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

let cachedPackageRoot: string | undefined;

/** 定位 obfuscated_code 包根目录（含 config/ 目录） */
export function getPackageRoot(): string {
  if (cachedPackageRoot) return cachedPackageRoot;

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const configDir = path.join(dir, 'config');
    if (fs.existsSync(path.join(configDir, 'whitelist-symbols-uniappx.json'))) {
      cachedPackageRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('无法定位 obfuscated_code 包根目录（缺少 config/whitelist-symbols-uniappx.json）');
}

export function getPackageConfigPath(filename: string): string {
  return path.join(getPackageRoot(), 'config', filename);
}
