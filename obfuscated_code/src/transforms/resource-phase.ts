import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import {
  formatColorObfuscateDetail,
  obfuscateColorValuesDetailed,
} from './color-obfuscate.js';
import {
  runEnhancedStylesheetObfuscation,
  STYLESHEET_GLOB,
} from './stylesheet-obfuscate.js';

const STYLESHEET_SCAN_IGNORE = ['**/node_modules/**', '**/unpackage/**', '**/dist/**', '**/obfuscated/**'];

export { runEnhancedStylesheetObfuscation } from './stylesheet-obfuscate.js';

export interface ResourceTransformResult {
  resourceHashCount: number;
  imageRenameCount: number;
  filenameRenameCount: number;
  colorFiles: number;
  stylesheetClassFiles: number;
  globalClassRenameMap: Map<string, string>;
}

export async function runStylesheetClassTransforms(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<Pick<ResourceTransformResult, 'stylesheetClassFiles' | 'globalClassRenameMap'>> {
  if (!config.features.enhancedUiJunkCode) {
    return { stylesheetClassFiles: 0, globalClassRenameMap: new Map() };
  }
  const sheetResult = await runEnhancedStylesheetObfuscation(workPath, config, logger);
  return {
    stylesheetClassFiles: sheetResult.filesChanged,
    globalClassRenameMap: sheetResult.classRenameMap,
  };
}

export async function runColorNudgeTransforms(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<number> {
  if (!config.features.colorNudge) return 0;

  const styleFiles: string[] = [];
  for (const pattern of STYLESHEET_GLOB) {
    styleFiles.push(
      ...(await fg(pattern, {
        cwd: workPath,
        onlyFiles: true,
        ignore: STYLESHEET_SCAN_IGNORE,
      })),
    );
  }
  const total = styleFiles.length;
  const interval = Math.max(10, Math.floor(total / 15));
  logger.info(`  颜色值扰动: ${total} 个样式文件`);
  let index = 0;
  let colorFiles = 0;
  for (const rel of styleFiles) {
    index++;
    const abs = path.join(workPath, rel);
    const original = await fs.readFile(abs, 'utf-8');
    const detailed = obfuscateColorValuesDetailed(original);
    const changed = detailed.content !== original;
    if (changed) {
      await fs.writeFile(abs, detailed.content, 'utf-8');
      colorFiles++;
    }
    logger.progress(
      '颜色扰动',
      index,
      total,
      formatColorObfuscateDetail(rel, detailed.sample, changed),
      interval,
    );
  }
  logger.info(`  颜色值扰动完成: ${colorFiles} 个文件已修改`);
  return colorFiles;
}

export async function runResourceTransforms(
  workPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<ResourceTransformResult> {
  const result: ResourceTransformResult = {
    resourceHashCount: 0,
    imageRenameCount: 0,
    filenameRenameCount: 0,
    colorFiles: 0,
    stylesheetClassFiles: 0,
    globalClassRenameMap: new Map(),
  };

  if (!config.features.enhancedUiJunkCode && !config.features.colorNudge) return result;

  logger.info('  资源变换开始...');

  const sheet = await runStylesheetClassTransforms(workPath, config, logger);
  result.stylesheetClassFiles = sheet.stylesheetClassFiles;
  result.globalClassRenameMap = sheet.globalClassRenameMap;

  result.colorFiles = await runColorNudgeTransforms(workPath, config, logger);

  logger.info('  资源变换完成');
  return result;
}

export async function writeProguardTemplate(
  workPath: string,
  config: ObfuscatorConfig,
  logger?: Logger,
): Promise<void> {
  if (config.platform !== 'app-android') return;
  const templatePath = path.join(workPath, 'proguard-rules.obf.pro');
  if (await fs.pathExists(templatePath)) return;
  const template = `# UniApp-X obfuscator generated ProGuard rules
-keep class io.dcloud.** { *; }
-keep class uni.** { *; }
-dontwarn **
`;
  await fs.writeFile(templatePath, template, 'utf-8');
  logger?.info('  已写入 ProGuard 模板: proguard-rules.obf.pro');
}
