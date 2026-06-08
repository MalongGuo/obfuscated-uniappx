import { createHash } from 'node:crypto';
import fs from 'fs-extra';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export interface ResourceHashRefreshResult {
  changed: boolean;
  hashBefore?: string;
  hashAfter?: string;
  reason?: string;
}

function isApng(buffer: Buffer): boolean {
  return buffer.includes(Buffer.from('acTL'));
}

function shortHash(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex').slice(0, 8);
}

/** 微调静态资源文件末尾字节以改变 hash（跳过 APNG） */
export async function refreshResourceHash(filePath: string): Promise<ResourceHashRefreshResult> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    return { changed: false, reason: '非图片格式' };
  }

  const buffer = await fs.readFile(filePath);
  if (buffer.length < 8) {
    return { changed: false, reason: '文件过小' };
  }
  if (ext === '.png' && isApng(buffer)) {
    return { changed: false, reason: 'APNG 跳过' };
  }

  const hashBefore = shortHash(buffer);
  const next = Buffer.from(buffer);
  next[next.length - 1] = (next[next.length - 1]! + 1) & 0xff;
  if (next.equals(buffer)) {
    return { changed: false, hashBefore, reason: '无变更' };
  }

  const hashAfter = shortHash(next);
  await fs.writeFile(filePath, next);
  return { changed: true, hashBefore, hashAfter };
}

export function formatResourceHashDetail(relPath: string, result: ResourceHashRefreshResult): string {
  if (result.changed && result.hashBefore && result.hashAfter) {
    return `${relPath} | hash ${result.hashBefore} → ${result.hashAfter}`;
  }
  if (result.reason) {
    return `${relPath} | ${result.reason}`;
  }
  return `${relPath} | 无变更`;
}
