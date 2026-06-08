import path from 'node:path';
import fs from 'fs-extra';

export async function detectPathConflicts(pagesDir: string): Promise<string[]> {
  const conflicts: string[] = [];
  if (!(await fs.pathExists(pagesDir))) return conflicts;

  const entries = await fs.readdir(pagesDir);
  for (const entry of entries) {
    const full = path.join(pagesDir, entry);
    const stat = await fs.stat(full);
    if (!stat.isDirectory()) continue;

    const extensions = ['.vue', '.uvue', '.nvue'];
    for (const ext of extensions) {
      const rootPage = path.join(pagesDir, `${entry}${ext}`);
      if (await fs.pathExists(rootPage)) {
        conflicts.push(`pages/${entry}`);
        break;
      }
    }
  }
  return conflicts;
}

export async function extractTabBarPaths(pagesJsonPath: string): Promise<string[]> {
  if (!(await fs.pathExists(pagesJsonPath))) return [];
  try {
    const raw = await fs.readFile(pagesJsonPath, 'utf-8');
    const jsonLike = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const data = JSON.parse(jsonLike);
    const tabBar = data?.tabBar?.list ?? [];
    return tabBar
      .map((item: { pagePath?: string }) => item.pagePath)
      .filter((p: string | undefined): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}
