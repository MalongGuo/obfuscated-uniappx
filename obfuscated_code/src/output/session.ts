import path from 'node:path';
import type { ParsedFile } from '../parser/types.js';
import { buildOutputFolderName } from './resolve.js';
import {
  resolveObfuscatedConfigDir,
  writeConfigJson,
  writeConfigText,
} from './obfuscated-config.js';

export interface LogSession {
  /** 与输出目录同规则的基名：{项目名}_{unixMs}_{token} */
  baseName: string;
  token: string;
  /** 源项目根目录 */
  projectPath: string;
  /** 产物目录：{project}/obfuscated/config/ */
  dir: string;
}

export function createLogSession(
  projectPath: string,
  token: string,
  at = new Date(),
  baseNameOverride?: string,
): LogSession {
  const resolved = path.resolve(projectPath);
  const baseName = baseNameOverride ?? buildOutputFolderName(resolved, token, at);
  return {
    baseName,
    token,
    projectPath: resolved,
    dir: resolveObfuscatedConfigDir(resolved),
  };
}

export async function writeSessionJson(
  projectPath: string,
  filename: string,
  data: unknown,
): Promise<string> {
  return writeConfigJson(projectPath, filename, data);
}

export async function writeSessionText(
  projectPath: string,
  filename: string,
  content: string,
): Promise<string> {
  return writeConfigText(projectPath, filename, content);
}

/** 阶段诊断日志：`*` → `{name}.log.txt`；已含 `-log` 后缀 → `{name}.txt` */
export function sessionLogFilename(name: string): string {
  return name.endsWith('-log') ? `${name}.txt` : `${name}.log.txt`;
}

/** 结构化阶段日志（JSON 内容，`.log.txt` / `-log.txt` 扩展名） */
export async function writeSessionDataLog(
  projectPath: string,
  name: string,
  data: unknown,
): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  return writeSessionText(projectPath, sessionLogFilename(name), content);
}

/** `{mode}-symbols-collect.log.txt` 等 mode 前缀诊断日志 */
export function modeSessionLogFilename(mode: string, name: string): string {
  return `${mode}-${sessionLogFilename(name)}`;
}

export async function writeModeSessionDataLog(
  projectPath: string,
  mode: string,
  name: string,
  data: unknown,
): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  return writeSessionText(projectPath, modeSessionLogFilename(mode, name), content);
}

export function buildParseLog(parsed: ParsedFile[]): Record<string, unknown> {
  return wrapParsePayload(parsed.map(formatParseFileEntry));
}

function isUtsParseFile(file: ParsedFile): boolean {
  if (file.kind === 'module') {
    return file.lang === 'uts' || file.relativePath.endsWith('.uts');
  }
  return file.kind === 'uvue' || file.kind === 'nvue'
    || file.scripts.some((s) => s.lang === 'uts');
}

/** 拆分通用解析与 UTS/uvue 解析日志 */
export function buildParseLogs(parsed: ParsedFile[]): {
  parse: Record<string, unknown>;
  utsParse: Record<string, unknown>;
} {
  const utsFiles = parsed.filter(isUtsParseFile);
  const generalFiles = parsed.filter((f) => !isUtsParseFile(f));
  return {
    parse: wrapParsePayload(generalFiles.map(formatParseFileEntry)),
    utsParse: wrapParsePayload(utsFiles.map(formatParseFileEntry)),
  };
}

function formatParseFileEntry(file: ParsedFile): Record<string, unknown> {
  if (file.kind === 'module') {
    return {
      file: file.relativePath,
      kind: file.kind,
      lang: file.lang,
      parsed: !file.parseError,
      error: file.parseError ?? null,
    };
  }
  return {
    file: file.relativePath,
    kind: file.kind,
    template: file.template !== null,
    templateIdentifierCount: file.templateIdentifiers.length,
    scripts: file.scripts.map((script) => ({
      lang: script.lang,
      parsed: !script.parseError,
      error: script.parseError ?? null,
    })),
    parsed: file.scripts.every((s) => !s.parseError),
  };
}

function wrapParsePayload(files: Array<Record<string, unknown>>): Record<string, unknown> {
  const errorCount = files.filter((f) => !f.parsed).length;
  return {
    timestamp: new Date().toISOString(),
    fileCount: files.length,
    successCount: files.length - errorCount,
    errorCount,
    files,
  };
}
