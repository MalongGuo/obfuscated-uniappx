import type { ObfuscatorConfig } from '../types/config.js';
import type { ObfuscationMode } from '../types/config.js';
import type { ClassifiedMappings } from './maps.js';
import type { FileObfuscateEntry } from '../code/obfuscate.js';
import { ARTIFACT_JSON, modeArtifactName } from './artifact-names.js';
import { writeConfigJson, writeConfigText } from './obfuscated-config.js';

export interface ChangeReportInput {
  sourceProjectPath: string;
  outputPath: string;
  mode: ObfuscationMode;
  config: ObfuscatorConfig;
  classified: ClassifiedMappings;
  fileEntries: FileObfuscateEntry[];
  cssClassMap: Map<string, string>;
  stylesheetClassFiles: number;
  stringMappings?: Record<string, string>;
}

function detectObfuscationLayers(config: ObfuscatorConfig): string[] {
  const layers: string[] = [];
  if (config.features.renameFuncPropVarEnum) {
    layers.push('第一层：标识符重命名');
  }
  if (config.features.stripComments && config.commentStrip.enabled) {
    layers.push('第二层：注释清理');
  }
  if (config.features.encryptAllStrings || config.features.ciphertextStrings) {
    layers.push('第三层：字符串加密');
  }
  return layers;
}

function sortedPairs(record: Record<string, string>): Array<[string, string]> {
  return Object.entries(record).sort((a, b) => a[0].localeCompare(b[0]));
}

function mapSection(title: string, pairs: Array<[string, string]>): string[] {
  const lines = [`## ${title}`, '', `共 **${pairs.length}** 项`, ''];
  if (pairs.length === 0) {
    lines.push('_（无）_', '');
    return lines;
  }
  lines.push('| 原名 | 混淆名 |', '|------|--------|');
  for (const [from, to] of pairs) {
    lines.push(`| \`${from}\` | \`${to}\` |`);
  }
  lines.push('');
  return lines;
}

function enabledFeatureLines(config: ObfuscatorConfig): string[] {
  const f = config.features;
  const lines = ['## 实际执行的功能', ''];
  const items: Array<[boolean, string]> = [
    [f.renameFuncPropVarEnum, '标识符重命名 (`renameFuncPropVarEnum`)'],
    [f.enhancedUiJunkCode, 'UI class/样式加强 (`enhancedUiJunkCode`)'],
    [f.stripComments && config.commentStrip.enabled, '注释清理'],
    [f.encryptAllStrings || f.ciphertextStrings, '字符串加密'],
    [f.shuffleFuncOrder, '打乱定义顺序 (`shuffleFuncOrder`)'],
    [f.disruptExecOrder, '扰乱执行顺序 (`disruptExecOrder`)'],
    [f.controlFlowFlatten, '控制流平坦化 (`controlFlowFlatten`)'],
    [f.insertJunkFuncProp, '垃圾函数/属性 (`insertJunkFuncProp`)'],
    [f.useNewJunkCode, 'Template 垃圾节点 (`useNewJunkCode`)'],
    [f.renameProtocol, '协议名混淆 (`renameProtocol`)'],
  ];
  for (const [on, label] of items) {
    lines.push(`- [${on ? 'x' : ' '}] ${label}`);
  }
  lines.push('');
  return lines;
}

/** 生成可读的全部变更 Markdown */
export function buildChangeReportMarkdown(input: ChangeReportInput): string {
  const {
    sourceProjectPath,
    outputPath,
    mode,
    config,
    classified,
    fileEntries,
    cssClassMap,
    stylesheetClassFiles,
    stringMappings = {},
  } = input;

  const changedFiles = fileEntries.filter((f) => f.changed);
  const commentStrippedFiles = fileEntries.filter((f) => f.commentsStripped);
  const stringEncryptedFiles = fileEntries.filter((f) => f.stringMappings.size > 0);
  const stringPairCount = Object.keys(stringMappings).length;
  const layers = detectObfuscationLayers(config);
  const cssPairs = [...cssClassMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const lines: string[] = [];
  lines.push('# 混淆全部变更清单');
  lines.push('');
  lines.push(`- **源项目**: \`${sourceProjectPath}\``);
  lines.push(`- **产物目录**: \`${outputPath}\``);
  lines.push(`- **模式**: ${mode}`);
  lines.push(`- **生成时间**: ${new Date().toISOString()}`);
  if (layers.length > 0) {
    lines.push(`- **已启用层级**: ${layers.join('、')}`);
  }
  lines.push('');

  lines.push('## 汇总统计');
  lines.push('');
  lines.push('| 类别 | 数量 |');
  lines.push('|------|------|');
  lines.push(`| 扫描文件 | ${fileEntries.length} |`);
  lines.push(`| 有变更的文件 | ${changedFiles.length} |`);
  lines.push(`| 标识符重命名文件 | ${changedFiles.filter((f) => f.identifierRenamed).length} |`);
  lines.push(`| 注释清理文件 | ${commentStrippedFiles.length} |`);
  lines.push(`| 字符串加密文件 | ${stringEncryptedFiles.length} |`);
  lines.push(`| 加密字符串总数 | ${stringPairCount} |`);
  lines.push(`| 函数名映射 | ${Object.keys(classified.functions).length} |`);
  lines.push(`| 属性名映射 | ${Object.keys(classified.properties).length} |`);
  lines.push(`| CSS class 映射 | ${cssPairs.length} |`);
  lines.push(`| 局部变量映射 | ${Object.keys(classified.locals).length} |`);
  lines.push(`| TypeScript 类型/class 名 | ${Object.keys(classified.classes).length} |`);
  lines.push(`| 标识符映射合计 | ${classified.totalMappings} |`);
  lines.push(`| 样式 class 处理文件 | ${stylesheetClassFiles} |`);
  lines.push('');

  lines.push(...enabledFeatureLines(config));

  lines.push('## 第二层：注释清理');
  lines.push('');
  if (commentStrippedFiles.length === 0) {
    lines.push('_未开启 `stripComments` + `commentStrip.enabled`，或无注释被清理_');
    lines.push('');
  } else {
    lines.push(`共 **${commentStrippedFiles.length}** 个文件已清理注释。`);
    lines.push('');
    lines.push('详细列表见 `{mode}-comment-strip.log.txt`。');
    lines.push('');
    for (const file of commentStrippedFiles.map((f) => f.file).sort()) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  lines.push('## 第三层：字符串加密');
  lines.push('');
  if (stringPairCount === 0) {
    lines.push('_未开启 `encryptAllStrings`，或无字符串被加密_');
    lines.push('');
  } else {
    lines.push(`共 **${stringEncryptedFiles.length}** 个文件、**${stringPairCount}** 条字符串已加密。`);
    lines.push('');
    lines.push('完整映射见 `{mode}-obfuscation-map-strings.json`；逐文件摘要见 `{mode}-string-encrypt.log.txt`。');
    lines.push('');
    for (const file of stringEncryptedFiles.sort((a, b) => a.file.localeCompare(b.file))) {
      lines.push(`- \`${file.file}\` — ${file.stringMappings.size} 条`);
    }
    lines.push('');
  }

  lines.push('## CSS class 映射');
  lines.push('');
  if (cssPairs.length === 0) {
    lines.push('_未开启 `enhancedUiJunkCode` 或无 class 变更_');
    lines.push('');
  } else {
    lines.push(`共 **${cssPairs.length}** 项`);
    lines.push('');
    lines.push('| 原 class | hash class |');
    lines.push('|----------|------------|');
    for (const [from, to] of cssPairs) {
      lines.push(`| \`${from}\` | \`${to}\` |`);
    }
    lines.push('');
  }

  lines.push(...mapSection('函数名 (functions)', sortedPairs(classified.functions)));
  lines.push(...mapSection('属性名 (properties)', sortedPairs(classified.properties)));
  lines.push(...mapSection('TypeScript 类型/class (classes)', sortedPairs(classified.classes)));
  lines.push(...mapSection('局部变量 (locals)', sortedPairs(classified.locals)));

  lines.push('## 按文件变更明细');
  lines.push('');
  lines.push(`共 **${changedFiles.length}** 个文件有改动。`);
  lines.push('');

  for (const file of [...changedFiles].sort((a, b) => a.file.localeCompare(b.file))) {
    lines.push(`### \`${file.file}\``);
    lines.push('');
    const flags: string[] = [];
    if (file.identifierRenamed) flags.push('标识符重命名');
    if (file.commentsStripped) flags.push('注释清理');
    if (file.stringMappings.size > 0) flags.push(`字符串加密×${file.stringMappings.size}`);
    if (flags.length > 0) {
      lines.push(`变换：${flags.join('、')}`);
      lines.push('');
    }
    if (file.renames.length > 0) {
      lines.push(`标识符重命名 **${file.renames.length}** 项：`);
      lines.push('');
      lines.push('| 原名 | 混淆名 |');
      lines.push('|------|--------|');
      for (const rename of [...file.renames].sort((a, b) => a.from.localeCompare(b.from))) {
        lines.push(`| \`${rename.from}\` | \`${rename.to}\` |`);
      }
    } else if (flags.length === 0) {
      lines.push('- 样式/class 或其它变换（无 script 记录）');
    }
    lines.push('');
  }

  const bizPages = changedFiles
    .filter((f) => f.file.startsWith('pages/u/'))
    .sort((a, b) => a.file.localeCompare(b.file));
  if (bizPages.length > 0) {
    lines.push('## 业务页面速览 (pages/u/**)');
    lines.push('');
    for (const file of bizPages) {
      lines.push(`- \`${file.file}\` — ${file.renames.length} 项标识符重命名`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** 写入 `{mode}-all-changes.md` 与 `{mode}-css-class-map.json` */
export async function writeChangeReportArtifacts(input: ChangeReportInput): Promise<string[]> {
  const { sourceProjectPath, mode, cssClassMap } = input;
  const written: string[] = [];

  const mdName = modeArtifactName(mode, ARTIFACT_JSON.allChanges);
  await writeConfigText(sourceProjectPath, mdName, buildChangeReportMarkdown(input));
  written.push(mdName);

  const cssName = modeArtifactName(mode, ARTIFACT_JSON.cssClassMap);
  const cssRecord = Object.fromEntries([...cssClassMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  await writeConfigJson(sourceProjectPath, cssName, {
    generatedAt: new Date().toISOString(),
    count: cssClassMap.size,
    mappings: cssRecord,
  });
  written.push(cssName);

  return written;
}
