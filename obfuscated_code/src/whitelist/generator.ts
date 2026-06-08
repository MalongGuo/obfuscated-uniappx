import path from 'node:path';
import fs from 'fs-extra';
import { resolveObfuscatedConfigFile } from '../output/obfuscated-config.js';

export interface GeneratedWhitelist {
  generatedAt: string;
  note: string;
  symbols: string[];
  pathPatterns: string[];
}

const DEFAULT_WHITELIST_NOTE =
  '首次运行自动生成；symbols 填项目额外保留符号，pathPatterns 填项目路径白名单；UniApp-X 内置词表见 whitelist-symbols-uniappx.json';

/** 旧版自动生成格式（含 frameworkPrefixes / 内置 symbols / tabBar pathPatterns） */
export function isLegacyGeneratedWhitelist(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'frameworkPrefixes' in data;
}

export function normalizeProjectWhitelist(data: unknown): GeneratedWhitelist {
  if (typeof data !== 'object' || data === null) {
    return {
      generatedAt: new Date().toISOString(),
      note: DEFAULT_WHITELIST_NOTE,
      symbols: [],
      pathPatterns: [],
    };
  }

  const record = data as Record<string, unknown>;

  if (isLegacyGeneratedWhitelist(record)) {
    return {
      generatedAt: new Date().toISOString(),
      note: DEFAULT_WHITELIST_NOTE,
      symbols: [],
      pathPatterns: [],
    };
  }

  return {
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : new Date().toISOString(),
    note: typeof record.note === 'string' ? record.note : DEFAULT_WHITELIST_NOTE,
    symbols: Array.isArray(record.symbols) ? [...record.symbols].filter((v): v is string => typeof v === 'string') : [],
    pathPatterns: Array.isArray(record.pathPatterns)
      ? [...record.pathPatterns].filter((v): v is string => typeof v === 'string')
      : [],
  };
}

async function writeNormalizedWhitelist(outPath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(outPath));
  await fs.writeJson(outPath, normalizeProjectWhitelist(data), { spaces: 2 });
}

export async function ensureWhitelistJson(projectPath: string): Promise<string | null> {
  const outPath = await resolveObfuscatedConfigFile(projectPath, 'whitelist.json');
  if (await fs.pathExists(outPath)) {
    const existing = await fs.readJson(outPath);
    if (isLegacyGeneratedWhitelist(existing)) {
      await writeNormalizedWhitelist(outPath, existing);
      return outPath;
    }
    return null;
  }

  const legacyPath = path.join(projectPath, 'whitelist.json');
  if (await fs.pathExists(legacyPath)) {
    const legacy = await fs.readJson(legacyPath);
    await writeNormalizedWhitelist(outPath, legacy);
    return outPath;
  }

  const whitelist: GeneratedWhitelist = {
    generatedAt: new Date().toISOString(),
    note: DEFAULT_WHITELIST_NOTE,
    symbols: [],
    pathPatterns: [],
  };

  await fs.writeJson(outPath, whitelist, { spaces: 2 });
  return outPath;
}
