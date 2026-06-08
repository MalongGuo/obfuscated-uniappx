import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { formatResourceHashDetail, refreshResourceHash } from '../transforms/resource-hash.js';
import { renameStaticImages } from '../transforms/rename-images.js';
import { syncTsconfigContent } from './tsconfig-sync.js';

const RESOURCE_HASH_GLOB = 'static/**/*.{png,jpg,jpeg,webp,gif,mp3,mp4}';

export interface StaticResourceCloneResult {
  imageRenameCount: number;
  imageDirCount: number;
  resourceHashCount: number;
  imageRenameLog: Array<{ from: string; to: string }>;
}

/** clone 阶段：static/ 图片重命名 + 资源 hash；manifest 引用由后续统一内容替换同步 */
export async function runStaticResourceClonePhase(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<StaticResourceCloneResult> {
  const result: StaticResourceCloneResult = {
    imageRenameCount: 0,
    imageDirCount: 0,
    resourceHashCount: 0,
    imageRenameLog: [],
  };

  if (config.features.renameImageNames) {
    logger.info('  图片重命名: 规划 static/ 目录与图片...');
    const { imageCount, dirCount, renameLog } = await renameStaticImages(workPath, config, {
      skipReferenceSync: true,
      onImageProgress: (index, total, detail) => {
        logger.progress('图片重命名', index, total, detail, 1);
      },
    });
    result.imageRenameCount = imageCount;
    result.imageDirCount = dirCount;
    result.imageRenameLog = renameLog;
    logger.info(`  图片重命名完成: ${imageCount} 张图片, ${dirCount} 个目录`);
  }

  if (config.features.resourceHash) {
    const files = await fg(RESOURCE_HASH_GLOB, { cwd: workPath, onlyFiles: true });
    const total = files.length;
    const interval = Math.max(5, Math.floor(total / 10));
    logger.info(`  资源 hash 刷新: ${total} 个文件`);
    let index = 0;
    for (const rel of files) {
      index++;
      const hashResult = await refreshResourceHash(path.join(workPath, rel));
      if (hashResult.changed) {
        result.resourceHashCount++;
      }
      logger.progress('资源 hash', index, total, formatResourceHashDetail(rel, hashResult), interval);
    }
    logger.info(`  资源 hash 完成: ${result.resourceHashCount} 个已刷新`);
  }

  if (result.imageRenameLog.length > 0) {
    const tsconfigPath = path.join(workPath, 'tsconfig.json');
    if (await fs.pathExists(tsconfigPath)) {
      logger.info('  同步 tsconfig paths（图片路径）...');
      const raw = await fs.readFile(tsconfigPath, 'utf-8');
      await fs.writeFile(tsconfigPath, syncTsconfigContent(raw, result.imageRenameLog), 'utf-8');
    }
  }

  return result;
}
