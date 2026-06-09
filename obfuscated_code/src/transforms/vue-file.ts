import { parse as parseSfc } from '@vue/compiler-sfc';
import { extensionToLang, parseScript } from '../parser/babel.js';
import { runScriptTransformPipeline } from './script-pipeline.js';
import { renameTemplate } from './rename-template.js';
import { insertTemplateJunk } from './template-junk.js';
import { obfuscateVueUiEnhanced } from './color-obfuscate.js';
import type { StringEncryptCollector } from './string-encryption.js';
import type { RenameMap } from './rename-map.js';
import type { ObfuscatorConfig } from '../types/config.js';
import { createDefaultConfig } from '../config/defaults.js';

interface BlockLoc {
  loc: { start: { offset: number }; end: { offset: number } };
}

/** 按 @vue/compiler-sfc 解析出的 loc 替换块内正文，避免嵌套 <template> 被正则截断 */
function replaceBlockContent(
  content: string,
  block: BlockLoc,
  newBody: string,
): string {
  const start = block.loc.start.offset;
  const end = block.loc.end.offset;
  return content.slice(0, start) + newBody + content.slice(end);
}

function applyBlockReplacements(
  content: string,
  replacements: Array<{ block: BlockLoc; newBody: string }>,
): string {
  const sorted = [...replacements].sort(
    (a, b) => b.block.loc.start.offset - a.block.loc.start.offset,
  );
  let result = content;
  for (const { block, newBody } of sorted) {
    result = replaceBlockContent(result, block, newBody);
  }
  return result;
}

function hasScriptPipeline(config: ObfuscatorConfig): boolean {
  const f = config.features;
  return Boolean(
    f.shuffleFuncOrder ||
    f.disruptExecOrder ||
    f.controlFlowFlatten ||
    f.insertJunkFuncProp ||
    f.encryptAllStrings ||
    f.ciphertextStrings ||
    (f.renameFuncPropVarEnum && f.renameProtocol),
  );
}

export function transformVueFileContent(
  content: string,
  relativePath: string,
  extension: string,
  renameMap: RenameMap,
  config: ObfuscatorConfig,
  stringCollector?: StringEncryptCollector,
  globalClassRenameMap?: Map<string, string>,
): string {
  const willRename = renameMap.size > 0 && config.features.renameFuncPropVarEnum;
  const willPipeline = hasScriptPipeline(config);
  const willTemplateJunk = config.features.useNewJunkCode;
  const willEnhancedUi = config.features.enhancedUiJunkCode;
  const willColorNudge = config.features.colorNudge;

  if (!willRename && !willPipeline && !willTemplateJunk && !willEnhancedUi && !willColorNudge) return content;

  const { descriptor } = parseSfc(content, { filename: relativePath });
  const blockReplacements: Array<{ block: BlockLoc; newBody: string }> = [];

  const scriptBlocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean);
  for (const block of scriptBlocks) {
    const lang = extensionToLang(
      block!.lang === 'ts' ? '.ts' : block!.lang === 'uts' ? '.uts' : '.js',
    );
    const parsed = parseScript(block!.content, lang, relativePath);
    if (!parsed.ast) continue;

    const transformed = runScriptTransformPipeline(
      parsed.ast,
      willRename ? renameMap : new Map(),
      config,
      block!.content,
      stringCollector,
      relativePath,
    );
    if (transformed !== block!.content) {
      blockReplacements.push({ block: block!, newBody: transformed });
    }
  }

  if (descriptor.template?.content) {
    let templateBody = descriptor.template.content;
    if (willRename) {
      templateBody = renameTemplate(templateBody, renameMap);
    }
    if (willTemplateJunk) {
      templateBody = insertTemplateJunk(templateBody, config.seed, relativePath);
    }
    if (templateBody !== descriptor.template.content) {
      blockReplacements.push({ block: descriptor.template, newBody: templateBody });
    }
  }

  let result = blockReplacements.length > 0
    ? applyBlockReplacements(content, blockReplacements)
    : content;

  if (willEnhancedUi || willColorNudge) {
    const ui = obfuscateVueUiEnhanced(result, config.seed, relativePath, {
      renameClasses: willEnhancedUi,
      nudgeColors: willColorNudge,
      globalClassMap: globalClassRenameMap,
    });
    if (ui.changed) result = ui.content;
  }

  return result;
}

/** 兼容旧 API：仅标识符重命名 + template 联动 */
export function renameVueFileContent(
  content: string,
  relativePath: string,
  extension: string,
  renameMap: RenameMap,
): string {
  const config = createDefaultConfig();
  for (const key of Object.keys(config.features) as Array<keyof ObfuscatorConfig['features']>) {
    config.features[key] = false;
  }
  config.features.renameFuncPropVarEnum = renameMap.size > 0;
  return transformVueFileContent(content, relativePath, extension, renameMap, config);
}
