import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import fg from 'fast-glob';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { obfuscateDirName } from './token.js';
import { matchesIncludeScope, matchesPathWhitelist, normalizePath } from './whitelist.js';
import type { ObfuscationScope } from '../types/config.js';
import { detectPathConflicts, extractTabBarPaths } from './conflicts.js';
import { applyReplacements, buildContentReplacements, isTextFile } from './replacer.js';
import {
  buildEasycomMappings,
  isTemplateFile,
  stripEasycomBlock,
  syncComponentTags,
} from './easycom-sync.js';
import { syncPagesJsonContent } from './pages-json-sync.js';
import { syncManifestJsonContent } from './manifest-sync.js';
import { syncMatchingFilenamesForDir } from './file-rename.js';
import { isProtectedPath } from './protected-names.js';
import {
  buildContentReplacementGuard,
  buildCopyIgnoreSet,
  isImmutableConfigFile,
  isRootAnchorDir,
} from './anchors.js';
import { getFrameworkCopyExcludeTopLevelDirs } from '../whitelist/load-framework.js';
import { getOutputBaseName, resolveOutputPath, resolvePathToken } from '../output/resolve.js';
import type { LogSession } from '../output/session.js';
import { writeCloneArtifacts } from './artifacts.js';
import { defaultConcurrency, mapPool } from '../worker/pool.js';
import { runStaticResourceClonePhase } from './static-resources.js';
import { isObfuscatedSnapshotPath } from '../output/obfuscated-config.js';
import { copyObfuscatedConfigToOutput } from '../output/sync-preload-rules.js';
import { describePathWhitelist, resolvePathWhitelistForClone } from '../whitelist/project-whitelist.js';

export interface CloneResult {
  outputPath: string;
  token: string;
  renamedCount: number;
  replacedFileCount: number;
  fileRenameCount: number;
  imageRenameCount: number;
  resourceHashCount: number;
  renameLog: Array<{ from: string; to: string }>;
}

async function collectDirectories(root: string): Promise<string[]> {
  const dirs = await fg('**/', {
    cwd: root,
    onlyDirectories: true,
    dot: false,
  });
  return dirs
    .map((d) => d.replace(/\/$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.split('/').length - a.split('/').length);
}

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

interface CopyTask {
  srcAbs: string;
  destAbs: string;
  srcRel: string;
}

async function collectCopyTasks(
  resolvedProject: string,
  stagingPath: string,
  outputBaseName: string,
  copyIgnore: Set<string>,
): Promise<CopyTask[]> {
  const allFiles = await fg('**/*', { cwd: resolvedProject, onlyFiles: true, dot: false });
  const tasks: CopyTask[] = [];
  for (const rel of allFiles) {
    const relNorm = normalizePath(rel);
    if (!shouldSkipCopy(relNorm, outputBaseName, copyIgnore)) continue;
    tasks.push({
      srcAbs: path.join(resolvedProject, rel),
      destAbs: path.join(stagingPath, rel),
      srcRel: relNorm,
    });
  }
  return tasks;
}

function groupDirectoriesByDepth(directories: string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const relDir of directories) {
    const depth = relDir.split('/').length;
    const list = groups.get(depth) ?? [];
    list.push(relDir);
    groups.set(depth, list);
  }
  return groups;
}

interface DirRenameResult {
  rename?: { from: string; to: string };
  fileRenames: Array<{ from: string; to: string }>;
  skip?: { path: string; reason: string };
  renamed?: boolean;
}

async function processDirectoryRename(
  workPath: string,
  relDir: string,
  token: string,
  whitelist: string[],
  rootAnchorDirs: readonly string[],
  rootAnchorFiles: readonly string[],
  scope: ObfuscationScope,
  include: string[],
  logger: Logger,
): Promise<DirRenameResult> {
  const parentRel = path.dirname(relDir);
  const dirName = path.basename(relDir);
  const parentNorm = parentRel === '.' ? '' : normalizePath(parentRel);
  const fullNorm = parentNorm ? `${parentNorm}/${dirName}` : dirName;
  const empty: DirRenameResult = { fileRenames: [] };

  if (scope === 'precise' && !matchesIncludeScope(fullNorm, include)) {
    return { ...empty, skip: { path: fullNorm, reason: '不在混淆范围（precise）' } };
  }
  if (isRootAnchorDir(relDir, dirName, rootAnchorDirs)) {
    const reason = parentNorm === '' ? '顶级锚点目录（不可改名）' : '锚点规则';
    return { ...empty, skip: { path: fullNorm, reason } };
  }
  if (matchesPathWhitelist(fullNorm, whitelist)) {
    return { ...empty, skip: { path: fullNorm, reason: '路径白名单' } };
  }
  if (isProtectedPath(fullNorm)) {
    return { ...empty, skip: { path: fullNorm, reason: '受保护路径（uni_modules/uni-* 或 uni_modules/uts-*）' } };
  }

  const newName = obfuscateDirName(dirName, token);
  if (newName === dirName) return empty;

  const oldAbs = path.join(workPath, relDir);
  const newAbs = path.join(workPath, parentRel, newName);
  if (await fs.pathExists(newAbs)) {
    logger.warn(`  目标已存在，跳过: ${relDir} -> ${newName}`);
    return empty;
  }

  await fs.move(oldAbs, newAbs);
  const newRel = parentNorm ? `${parentNorm}/${newName}` : newName;
  const fileRenames = await syncMatchingFilenamesForDir(
    workPath,
    fullNorm,
    newRel,
    logger,
    rootAnchorFiles,
  );
  if (logger.isVerbose()) {
    logger.info(`  目录重命名: ${fullNorm} -> ${newRel}`);
  }
  return {
    rename: { from: fullNorm, to: newRel },
    fileRenames,
    renamed: true,
  };
}

async function replaceFileContent(
  workPath: string,
  relFile: string,
  contentReplacements: ReturnType<typeof buildContentReplacements>,
  allRenames: Array<{ from: string; to: string }>,
  easycomMappings: ReturnType<typeof buildEasycomMappings>,
): Promise<boolean> {
  const absFile = path.join(workPath, relFile);
  let original: string;
  try {
    original = await fs.readFile(absFile, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    throw err;
  }

  if (isImmutableConfigFile(relFile) || isProtectedPath(relFile) || isObfuscatedSnapshotPath(relFile)) {
    return false;
  }

  const baseName = path.basename(relFile);
  let updated: string;
  if (baseName === 'pages.json') {
    // 必须先 sync 再替换：applyReplacements 会提前改写 root，导致分包相对 path 无法匹配 renameLog
    updated = stripEasycomBlock(syncPagesJsonContent(original, allRenames));
  } else if (baseName === 'manifest.json') {
    // 仅同步 icons / splashScreens 等图片路径，与 static/ 目录映射一致
    updated = syncManifestJsonContent(original, allRenames);
  } else {
    updated = applyReplacements(original, contentReplacements);
    if (isTemplateFile(relFile)) {
      updated = syncComponentTags(updated, easycomMappings);
    }
  }

  if (updated !== original) {
    await fs.writeFile(absFile, updated, 'utf-8');
    return true;
  }
  return false;
}

export interface PathCloneOptions {
  token?: string;
  outputPath?: string;
  session?: LogSession;
  /** 复制源目录；默认与 projectPath 相同。混淆输出目录再次 run 时回退到原始源项目 */
  copySourcePath?: string;
}

export async function runPathClone(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
  options: PathCloneOptions = {},
): Promise<CloneResult> {
  const resolvedProject = path.resolve(projectPath);
  const copySource = path.resolve(options.copySourcePath ?? projectPath);
  const { token: configToken, auto: useAutoToken } = resolvePathToken(config);
  const token = options.token ?? configToken;
  const outputPath = options.outputPath ?? resolveOutputPath(resolvedProject, config.outputDir, token);
  const outputLabel = path.basename(outputPath);
  const outputBaseName = getOutputBaseName(config.outputDir);

  logger.info(
    useAutoToken
      ? `  Token 前缀: ${token}（随机生成，每次运行不同）`
      : `  Token 前缀: ${token}（配置指定）`,
  );
  logger.info(`  输出目录: ${outputLabel}`);

  const concurrency = defaultConcurrency();

  const copyIgnore = buildCopyIgnoreSet(config.exclude, getFrameworkCopyExcludeTopLevelDirs());
  const copyIgnoreList = [...copyIgnore].sort();
  for (const dir of copyIgnoreList) {
    logger.info(`  复制忽略目录: ${dir}`);
  }

  const stagingPath = path.join(os.tmpdir(), `uniapp-obfuscate-${Date.now()}`);
  if (await fs.pathExists(stagingPath)) {
    await fs.remove(stagingPath);
  }

  if (copySource !== resolvedProject) {
    logger.info(`  复制源项目: ${path.basename(copySource)}（由混淆目录 ${path.basename(resolvedProject)} 回退）`);
  }
  logger.info('  开始复制项目文件...');
  await fs.ensureDir(stagingPath);
  const copyTasks = await collectCopyTasks(copySource, stagingPath, outputBaseName, copyIgnore);
  logger.info(`  并行复制 ${copyTasks.length} 个文件...`);

  const copyResults = await mapPool(copyTasks, concurrency, async (task, index) => {
    await fs.ensureDir(path.dirname(task.destAbs));
    await fs.copy(task.srcAbs, task.destAbs);
    const destRel = task.srcRel;
    logger.progress('复制文件', index + 1, copyTasks.length, `${task.srcRel}->${destRel}`, 200);
    return { from: task.srcRel, to: destRel };
  });
  const copyLog = copyResults;
  logger.info(`  复制完成：${copyLog.length} 个文件`);

  if (await fs.pathExists(outputPath)) {
    await fs.remove(outputPath);
  }
  await fs.move(stagingPath, outputPath);

  const syncedConfig = await copyObfuscatedConfigToOutput(resolvedProject, outputPath);
  if (syncedConfig.length > 0) {
    logger.info(`  obfuscated 配置已同步到输出: ${syncedConfig.length} 个文件（同步后只读）`);
    for (const name of syncedConfig) {
      logger.detail(`    obfuscated/${name}`);
    }
  }

  const { patterns: pathWhitelistPatterns, loaded: projectWhitelistLoaded } =
    await resolvePathWhitelistForClone(resolvedProject, config);
  const paths = describePathWhitelist(config, projectWhitelistLoaded?.whitelist ?? null);
  logger.info(
    `  路径白名单: config ${paths.configCount} + 项目 ${paths.projectCount} = 合计 ${paths.mergedCount} 条`,
  );

  const whitelist = [...pathWhitelistPatterns];
  const rootAnchorDirs = config.rootAnchorDirs;
  const rootAnchorFiles = config.rootAnchorFiles;
  for (const dir of rootAnchorDirs) {
    logger.detail(`  根锚点目录: ${dir}`);
  }
  for (const file of rootAnchorFiles) {
    logger.detail(`  根锚点文件: ${file}`);
  }
  if (config.pathConflictCheck) {
    const conflicts = await detectPathConflicts(path.join(copySource, 'pages'));
    for (const c of conflicts) {
      if (!whitelist.includes(c)) {
        whitelist.push(c);
        logger.detail(`  自动白名单（路径冲突）: ${c}`);
      }
    }
    const tabBarPaths = await extractTabBarPaths(path.join(copySource, 'pages.json'));
    for (const pagePath of tabBarPaths) {
      const normalized = normalizePath(pagePath);
      if (!whitelist.includes(normalized)) {
        whitelist.push(normalized);
        logger.detail(`  自动白名单（tabBar）: ${normalized}`);
      }
    }
  }

  const renameLog: Array<{ from: string; to: string }> = [];
  const fileRenameLog: Array<{ from: string; to: string }> = [];
  const skipLog: Array<{ path: string; reason: string }> = [];
  const workPath = outputPath;
  const directories = await collectDirectories(workPath);
  logger.info(`  开始目录重命名（共 ${directories.length} 个，按深度并行）...`);

  const depthGroups = groupDirectoriesByDepth(directories);
  const depths = [...depthGroups.keys()].sort((a, b) => b - a);
  let dirProcessed = 0;

  for (const depth of depths) {
    const group = depthGroups.get(depth)!;
    const results = await mapPool(group, concurrency, async (relDir) => {
      return processDirectoryRename(
        workPath,
        relDir,
        token,
        whitelist,
        rootAnchorDirs,
        rootAnchorFiles,
        config.scope,
        config.include,
        logger,
      );
    });

    for (const result of results) {
      dirProcessed++;
      if (result.skip) {
        skipLog.push(result.skip);
        if (logger.isVerbose()) {
          logger.info(`  跳过目录: ${result.skip.path}（${result.skip.reason}）`);
        }
      }
      if (result.rename) {
        renameLog.push(result.rename);
        if (!logger.isVerbose()) {
          logger.info(`  目录重命名: ${result.rename.from} -> ${result.rename.to}`);
        }
      }
      fileRenameLog.push(...result.fileRenames);
      logger.progress('目录扫描', dirProcessed, directories.length, result.rename?.from ?? result.skip?.path, 20);
    }
  }

  logger.info(`  目录扫描完成：${dirProcessed}/${directories.length}，重命名 ${renameLog.length} 个`);

  if (fileRenameLog.length > 0) {
    logger.info(`  同名文件重命名: ${fileRenameLog.length} 个`);
  }

  const staticResources =
    config.features.renameImageNames || config.features.resourceHash
      ? await runStaticResourceClonePhase(workPath, config, logger)
      : {
          imageRenameCount: 0,
          imageDirCount: 0,
          resourceHashCount: 0,
          imageRenameLog: [] as Array<{ from: string; to: string }>,
        };

  const allRenames = [...renameLog, ...fileRenameLog, ...staticResources.imageRenameLog];
  const easycomMappings = buildEasycomMappings(renameLog, fileRenameLog);
  const contentReplacements = buildContentReplacements(
    allRenames,
    buildContentReplacementGuard(rootAnchorFiles, rootAnchorDirs),
  );

  const files = await fg('**/*', { cwd: workPath, onlyFiles: true, dot: false });
  const textFiles = files.filter(
    (f) => isTextFile(f) && !isObfuscatedSnapshotPath(f),
  );

  logger.info(`  并行内容路径替换（${textFiles.length} 个文本文件）...`);

  const replaceResults = await mapPool(textFiles, concurrency, async (relFile, index) => {
    let changed = false;
    try {
      changed = await replaceFileContent(workPath, relFile, contentReplacements, allRenames, easycomMappings);
      if (changed && logger.isVerbose()) {
        logger.info(`  内容已替换: ${relFile}`);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        logger.warn(`  文件不存在，跳过内容替换: ${relFile}`);
      } else {
        throw err;
      }
    }
    logger.progress('内容替换', index + 1, textFiles.length, relFile, 100);
    return changed;
  });

  const replacedFileCount = replaceResults.filter(Boolean).length;
  logger.info(`  内容替换完成：扫描 ${textFiles.length} 个，修改 ${replacedFileCount} 个`);
  logger.info('  正在写入路径混淆日志与映射...');

  const cloneLogLines = [
    '开始进行路径混淆克隆。。。。',
    '',
    `源项目：${copySource}${copySource !== resolvedProject ? `（CLI: ${resolvedProject}）` : ''}`,
    `Token：${token}${useAutoToken ? '（随机生成）' : '（配置指定）'}`,
    `输出目录：${outputLabel}`,
    '',
    '--- 复制忽略目录（未进入输出） ---',
    ...copyIgnoreList.map((d) => `忽略：${d}`),
    '',
    '--- 文件复制 ---',
    ...copyLog.map((c) => `源文件：${c.from} --> 复制到：${c.to}`),
    '',
    `复制文件：${copyLog.length} 个`,
    '',
    '--- 跳过重命名目录 ---',
    ...skipLog.map((s) => `原目录：${s.path} --> 新目录：${s.path}（${s.reason}）`),
    '',
    '--- 目录重命名 ---',
    ...renameLog.map((r) => `原目录：${r.from} --> 新目录：${r.to}`),
    '',
    '--- 同名文件重命名 ---',
    ...fileRenameLog.map((r) => `原文件：${r.from} --> 新文件：${r.to}`),
    '',
    `目录重命名：${renameLog.length} 个`,
    `同名文件重命名：${fileRenameLog.length} 个`,
    `图片重命名：${staticResources.imageRenameCount} 张（${staticResources.imageDirCount} 个 static 子目录）`,
    `资源 hash 刷新：${staticResources.resourceHashCount} 个`,
    `跳过重命名：${skipLog.length} 个`,
    `内容替换文件：${replacedFileCount} 个`,
    `组件标签映射：${easycomMappings.length} 个`,
    ...easycomMappings.map((m) => `  <${m.from}> --> <${m.to}>`),
    '处理包引用新路径。。。。。 ✌️100%',
  ];
  await writeCloneArtifacts(
    resolvedProject,
    config.mode,
    cloneLogLines.join('\n'),
    config.generateMap
      ? {
          token,
          mappings: renameLog,
          fileMappings: fileRenameLog,
          easycomMappings,
          replacedFileCount,
        }
      : null,
  );

  return {
    outputPath,
    token,
    renamedCount: renameLog.length,
    replacedFileCount,
    fileRenameCount: fileRenameLog.length,
    imageRenameCount: staticResources.imageRenameCount,
    resourceHashCount: staticResources.resourceHashCount,
    renameLog,
  };
}
