import type { ObfuscatorConfig } from '../types/config.js';
import type { SymbolTable } from '../symbols/types.js';
import { symbolTableToJson } from '../symbols/table.js';
import type { ClassifiedMappings } from './maps.js';
import type { ObfuscationMode } from '../types/config.js';
import type { ParsedFile } from '../parser/types.js';
import type { FileObfuscateEntry } from '../code/obfuscate.js';
import { writeSymbolsMapArtifact, symbolMapArtifactNames } from '../code/artifacts.js';
import { ARTIFACT_JSON } from './artifact-names.js';
import { modeArtifactName } from './artifact-names.js';
import {
  buildParseLogs,
  writeModeSessionDataLog,
  writeSessionJson,
} from './session.js';

export async function writeAnalyzeLogs(
  projectPath: string,
  mode: ObfuscationMode,
  parsed: ParsedFile[],
  table: SymbolTable,
): Promise<string[]> {
  const paths: string[] = [];
  const { parse, utsParse } = buildParseLogs(parsed);
  paths.push(await writeSessionJson(projectPath, modeArtifactName(mode, ARTIFACT_JSON.utsParse), utsParse));
  paths.push(await writeSessionJson(projectPath, modeArtifactName(mode, ARTIFACT_JSON.parse), parse));
  paths.push(await writeSessionJson(projectPath, modeArtifactName(mode, ARTIFACT_JSON.symbolsCollect), {
    phase: 'Analyze',
    mode,
    ...symbolTableToJson(table),
  }));
  return paths;
}

export async function writeNamingAllocateLog(
  projectPath: string,
  table: SymbolTable,
  config: ObfuscatorConfig,
): Promise<string> {
  const mappings: Record<string, string> = {};
  for (const entry of table.symbols.values()) {
    if (entry.renameable && entry.obfuscatedName) {
      mappings[entry.name] = entry.obfuscatedName;
    }
  }
  return writeModeSessionDataLog(projectPath, config.mode, 'naming-allocate', {
    phase: 'Transform',
    mode: config.mode,
    namingStyle: config.namingStyle,
    namePrefix: config.namePrefix,
    seed: config.seed,
    outputDirNaming: config.outputDirNaming,
    mappingCount: Object.keys(mappings).length,
    mappings,
  });
}

export async function writeFileObfuscateLog(
  projectPath: string,
  mode: ObfuscationMode,
  entries: Array<{
    file: string;
    identifierRenamed: boolean;
    commentsStripped: boolean;
    changed: boolean;
    renames?: Array<{ from: string; to: string }>;
    astTransformed?: boolean;
  }>,
): Promise<string> {
  const changedCount = entries.filter((e) => e.changed).length;
  return writeModeSessionDataLog(projectPath, mode, 'file-obfuscate', {
    phase: 'Transform',
    mode,
    fileCount: entries.length,
    changedCount,
    identifierRenamedCount: entries.filter((e) => e.identifierRenamed).length,
    commentsStrippedCount: entries.filter((e) => e.commentsStripped).length,
    files: entries.map((e) => ({
      ...e,
      renameCount: e.renames?.length ?? 0,
    })),
  });
}

const STRING_ENCRYPT_SAMPLE_PER_FILE = 5;

/** 第二层：注释清理逐文件日志 */
export async function writeCommentStripLog(
  projectPath: string,
  mode: ObfuscationMode,
  entries: FileObfuscateEntry[],
): Promise<string | null> {
  const stripped = entries.filter((e) => e.commentsStripped);
  if (stripped.length === 0) return null;
  return writeModeSessionDataLog(projectPath, mode, 'comment-strip', {
    phase: 'Transform',
    mode,
    layer: 2,
    feature: 'stripComments',
    fileCount: entries.length,
    commentsStrippedCount: stripped.length,
    files: stripped.map((e) => e.file).sort(),
  });
}

/** 第三层：字符串加密逐文件摘要（完整映射见 obfuscation-map-strings.json） */
export async function writeStringEncryptLog(
  projectPath: string,
  mode: ObfuscationMode,
  entries: FileObfuscateEntry[],
): Promise<string | null> {
  const withStrings = entries
    .filter((e) => e.stringMappings.size > 0)
    .map((e) => {
      const samples = [...e.stringMappings.entries()]
        .slice(0, STRING_ENCRYPT_SAMPLE_PER_FILE)
        .map(([literal, encrypted]) => ({ literal, encrypted }));
      return {
        file: e.file,
        count: e.stringMappings.size,
        samples,
      };
    });
  if (withStrings.length === 0) return null;

  const totalStrings = withStrings.reduce((sum, f) => sum + f.count, 0);
  return writeModeSessionDataLog(projectPath, mode, 'string-encrypt', {
    phase: 'Transform',
    mode,
    layer: 3,
    feature: 'encryptAllStrings',
    fileCount: entries.length,
    encryptedFileCount: withStrings.length,
    totalStringsEncrypted: totalStrings,
    note: '完整字面量映射见同目录 obfuscation-map-strings.json',
    files: withStrings.sort((a, b) => a.file.localeCompare(b.file)),
  });
}

export async function writeSymbolsMapLog(
  projectPath: string,
  mode: ObfuscationMode,
  classified: ClassifiedMappings,
  renamedFileCount: number,
): Promise<string[]> {
  await writeSymbolsMapArtifact(projectPath, mode, { ...classified, renamedFileCount });
  return symbolMapArtifactNames(mode);
}
