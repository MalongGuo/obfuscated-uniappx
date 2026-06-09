import path from 'node:path';
import fs from 'fs-extra';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { scanProject } from '../scanner/index.js';
import { parseProject, isVueExtension } from '../parser/index.js';
import { allocateSymbolTable, buildSymbolTable } from '../symbols/index.js';
import { applyStableMappings, loadStableMappings } from '../symbols/stable-mappings.js';
import { buildFileRenameMap, formatFileObfuscateDetail, renameMapToPairs } from '../transforms/rename-map.js';
import { transformVueFileContent } from '../transforms/vue-file.js';
import { runScriptTransformPipeline } from '../transforms/script-pipeline.js';
import { stripJsComments, stripVueComments } from '../transforms/strip-comments.js';
import { extensionToLang, parseScript } from '../parser/babel.js';
import { buildClassifiedMappings, type ClassifiedMappings } from '../output/maps.js';
import type { LogSession } from '../output/session.js';
import { writeSymbolsMapArtifact, writeStringsMapArtifact } from './artifacts.js';
import { mergeStringEncryptCollectors } from '../transforms/string-encryption.js';
import {
  writeCommentStripLog,
  writeFileObfuscateLog,
  writeNamingAllocateLog,
  writeStringEncryptLog,
} from '../output/session-logs.js';
import { writeChangeReportArtifacts } from '../output/change-report.js';
import { resolveSymbolTableWhitelistOptions } from '../whitelist/project-whitelist.js';
import { mapPool, defaultConcurrency } from '../worker/pool.js';
import type { ScannedFile } from '../scanner/index.js';
import type { SymbolTable } from '../symbols/types.js';

export interface CodeObfuscateResult {
  renamedFileCount: number;
  symbolCount: number;
  renameableCount: number;
  mappings: ClassifiedMappings;
}

const SKIP_FILES = new Set(['pages.json', 'manifest.json', 'androidPrivacy.json']);

export interface FileObfuscateEntry {
  file: string;
  identifierRenamed: boolean;
  commentsStripped: boolean;
  changed: boolean;
  renames: Array<{ from: string; to: string }>;
  astTransformed: boolean;
  stringMappings: Map<string, string>;
}

function shouldCollectStringMappings(config: ObfuscatorConfig): boolean {
  return Boolean(config.features.encryptAllStrings || config.features.ciphertextStrings);
}

function hasScriptTransforms(config: ObfuscatorConfig): boolean {
  const f = config.features;
  return Boolean(
    f.renameFuncPropVarEnum ||
    f.shuffleFuncOrder ||
    f.disruptExecOrder ||
    f.controlFlowFlatten ||
    f.insertJunkFuncProp ||
    f.encryptAllStrings ||
    f.ciphertextStrings ||
    f.useNewJunkCode ||
    f.enhancedUiJunkCode ||
    f.colorNudge ||
    f.renameProtocol,
  );
}

async function obfuscateFile(
  file: ScannedFile,
  table: SymbolTable,
  config: ObfuscatorConfig,
  globalClassRenameMap?: Map<string, string>,
): Promise<FileObfuscateEntry> {
  const renameMap = buildFileRenameMap(table, file.relativePath);
  const renames = renameMapToPairs(renameMap);
  const willTransform = hasScriptTransforms(config);
  const willStrip = config.features.stripComments && config.commentStrip.enabled;

  if (!willTransform && !willStrip) {
    return {
      file: file.relativePath,
      identifierRenamed: false,
      commentsStripped: false,
      changed: false,
      renames: [],
      astTransformed: false,
      stringMappings: new Map(),
    };
  }

  const original = await fs.readFile(file.absolutePath, 'utf-8');
  let updated = original;
  let identifierRenamed = false;
  let commentsStripped = false;
  let astTransformed = false;
  const stringMappings = shouldCollectStringMappings(config) ? new Map<string, string>() : new Map();

  if (willTransform) {
    if (isVueExtension(file.extension)) {
      const next = transformVueFileContent(
        updated,
        file.relativePath,
        file.extension,
        renameMap,
        config,
        stringMappings,
        globalClassRenameMap,
      );
      astTransformed = next !== updated;
      identifierRenamed = astTransformed && renames.length > 0;
      updated = next;
    } else if (['.js', '.ts', '.uts', '.jsx', '.tsx'].includes(file.extension)) {
      const lang = extensionToLang(file.extension);
      const parsedFile = parseScript(updated, lang, file.relativePath);
      if (parsedFile.ast) {
        const mapForFile = config.features.renameFuncPropVarEnum ? renameMap : new Map();
        const next = runScriptTransformPipeline(
          parsedFile.ast,
          mapForFile,
          config,
          updated,
          stringMappings,
          file.relativePath,
        );
        astTransformed = next !== updated;
        identifierRenamed = astTransformed && renames.length > 0;
        updated = next;
      }
    }
  }

  if (willStrip) {
    const safeMode = config.commentStrip.safeMode;
    if (isVueExtension(file.extension)) {
      const next = stripVueComments(updated, safeMode);
      commentsStripped = next !== updated;
      updated = next;
    } else if (['.js', '.ts', '.uts'].includes(file.extension)) {
      const next = stripJsComments(updated, safeMode);
      commentsStripped = next !== updated;
      updated = next;
    }
  }

  const changed = updated !== original;
  if (changed) {
    await fs.writeFile(file.absolutePath, updated, 'utf-8');
  }

  return {
    file: file.relativePath,
    identifierRenamed,
    commentsStripped,
    changed,
    renames,
    astTransformed: astTransformed || (changed && !commentsStripped && renames.length === 0),
    stringMappings,
  };
}

export interface CodeObfuscateOptions {
  session?: LogSession;
  /** 源项目路径，用于 obfuscated/config 回退写入 */
  sourceProjectPath?: string;
  /** css/scss 全局 class 映射，联动 uvue template/style */
  globalClassRenameMap?: Map<string, string>;
  /** 样式 class 变换文件数（写入变更报告） */
  stylesheetClassFiles?: number;
}

export async function runCodeObfuscate(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
  options: CodeObfuscateOptions = {},
): Promise<CodeObfuscateResult> {
  const files = await scanProject(workPath, config);
  const sourceFiles = files.filter((f) => !SKIP_FILES.has(path.basename(f.relativePath)));
  logger.info(`  解析源码: ${sourceFiles.length} 个文件...`);
  const parsed = await parseProject(sourceFiles);
  const whitelistProjectPath = options.sourceProjectPath ?? workPath;
  const { options: whitelistOpts, loaded: projectWhitelistLoaded } =
    await resolveSymbolTableWhitelistOptions(whitelistProjectPath, config);
  if (projectWhitelistLoaded) {
    logger.info(
      `  项目白名单: ${projectWhitelistLoaded.whitelist.symbols.length} 个符号, ${projectWhitelistLoaded.whitelist.pathPatterns.length} 条路径`,
    );
  }

  const table = buildSymbolTable(parsed, {
    customWhitelist: whitelistOpts.customWhitelist,
    keepExports: config.keepExports,
  });

  const sourceForStable = options.sourceProjectPath ?? workPath;
  if (config.stableMode && !config.forceNew) {
    logger.info(`  加载稳定映射...`);
    const stable = await loadStableMappings(sourceForStable, config.mode);
    applyStableMappings(table, stable);
    logger.info(`  稳定映射: ${stable.size} 条`);
  }

  logger.info(`  命名分配: ${[...table.symbols.values()].filter((s) => s.renameable).length} 个可重命名符号`);
  allocateSymbolTable(table, config.namingStyle, config.seed, config.namePrefix);
  const classified = buildClassifiedMappings(table);

  if (options.session) {
    await writeNamingAllocateLog(sourceForStable, table, config);
  }

  const concurrency = defaultConcurrency();
  const total = sourceFiles.length;
  const progressInterval = Math.max(10, Math.floor(total / 20));
  logger.info(`  代码混淆: ${total} 个文件 (${concurrency} 并发)`);

  const results = await mapPool(
    sourceFiles,
    concurrency,
    async (file) => {
      const entry = await obfuscateFile(file, table, config, options.globalClassRenameMap);
      if (entry.changed) logger.debug(`  已混淆: ${file.relativePath}`);
      return entry;
    },
    (done, _total, file, _index, entry) => {
      const detail = formatFileObfuscateDetail(file.relativePath, entry);
      logger.progress('代码混淆', done, _total, detail, progressInterval);
    },
  );

  const renamedFileCount = results.filter((entry) => entry.changed).length;

  if (options.session) {
    await writeFileObfuscateLog(sourceForStable, config.mode, results);
  }

  const mergedStringMappings = shouldCollectStringMappings(config)
    ? mergeStringEncryptCollectors(results.map((entry) => entry.stringMappings))
    : {};

  if (config.generateMap) {
    await writeSymbolsMapArtifact(
      sourceForStable,
      config.mode,
      { ...classified, renamedFileCount },
    );
    if (shouldCollectStringMappings(config)) {
      await writeStringsMapArtifact(
        sourceForStable,
        config.mode,
        mergedStringMappings,
        renamedFileCount,
      );
    }
    if (options.session) {
      await writeCommentStripLog(sourceForStable, config.mode, results);
      await writeStringEncryptLog(sourceForStable, config.mode, results);
    }
    await writeChangeReportArtifacts({
      sourceProjectPath: sourceForStable,
      outputPath: workPath,
      mode: config.mode,
      config,
      classified,
      fileEntries: results,
      cssClassMap: options.globalClassRenameMap ?? new Map(),
      stylesheetClassFiles: options.stylesheetClassFiles ?? 0,
      stringMappings: mergedStringMappings,
    });
  }

  return {
    renamedFileCount,
    symbolCount: table.symbols.size,
    renameableCount: classified.totalMappings,
    mappings: classified,
  };
}

export { hasScriptTransforms };
