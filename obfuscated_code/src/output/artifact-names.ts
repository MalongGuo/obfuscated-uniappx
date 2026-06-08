import type { ObfuscationMode } from '../types/config.js';

export const OBFUSCATION_MODES: ObfuscationMode[] = ['clone', 'code', 'full'];

/** 会话/映射 JSON 基础文件名（不含 mode 前缀） */
export const ARTIFACT_JSON = {
  parse: 'other-parse.json',
  utsParse: 'uts-parse.json',
  mapPaths: 'obfuscation-map-paths.json',
  mapResources: 'obfuscation-map-resources.json',
  mapFunctions: 'obfuscation-map-functions.json',
  mapProperties: 'obfuscation-map-properties.json',
  mapSymbols: 'obfuscation-map-symbols.json',
  mapStrings: 'obfuscation-map-strings.json',
  checkReport: 'obfuscation-check-report.json',
  symbolsCollect: 'symbols-collect.json',
  /** 可读的全部变更 Markdown */
  allChanges: 'all-changes.md',
  /** CSS class 原名 → hash 映射 */
  cssClassMap: 'css-class-map.json',
  /** 第二层：注释清理逐文件明细 */
  commentStrip: 'comment-strip.log.txt',
  /** 第三层：字符串加密逐文件摘要（完整映射见 mapStrings） */
  stringEncrypt: 'string-encrypt.log.txt',
} as const;

export type ArtifactJsonBasename = typeof ARTIFACT_JSON[keyof typeof ARTIFACT_JSON];

export const ARTIFACT_JSON_BASENAMES: ArtifactJsonBasename[] = Object.values(ARTIFACT_JSON);

/** `{mode}-{basename}`，如 `full-obfuscation-map-symbols.json` */
export function modeArtifactName(mode: ObfuscationMode, basename: string): string {
  return `${mode}-${basename}`;
}

/** 解析时优先 mode 前缀，再回退无前缀（兼容旧会话） */
export function artifactFilenameCandidates(
  basename: string,
  mode?: ObfuscationMode,
): string[] {
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!seen.has(name)) seen.add(name);
  };
  if (mode) add(modeArtifactName(mode, basename));
  add(basename);
  if (basename === 'other-parse.json') {
    add('parse.json');
    if (mode) add(modeArtifactName(mode, 'parse.json'));
  }
  if (mode) {
    for (const m of OBFUSCATION_MODES) {
      if (m !== mode) add(modeArtifactName(m, basename));
    }
  }
  return [...seen];
}

export function isArtifactJsonFile(basename: string): boolean {
  if (ARTIFACT_JSON_BASENAMES.includes(basename as ArtifactJsonBasename)) return true;
  for (const mode of OBFUSCATION_MODES) {
    for (const base of ARTIFACT_JSON_BASENAMES) {
      if (basename === modeArtifactName(mode, base)) return true;
    }
  }
  return false;
}
