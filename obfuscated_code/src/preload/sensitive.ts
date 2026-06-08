import fs from 'fs-extra';
import type { ObfuscatorConfig } from '../types/config.js';
import { scanProject } from '../scanner/index.js';
import { writePreloadLog } from './logs.js';

const SENSITIVE_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'url', regex: /https?:\/\/[^\s'"`]+/g },
  { type: 'apiKey', regex: /(?:api[_-]?key|apikey|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/gi },
  { type: 'phone', regex: /1[3-9]\d{9}/g },
  { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
];

export interface SensitiveFinding {
  file: string;
  type: string;
  value: string;
}

export interface SensitiveResult {
  findings: SensitiveFinding[];
  count: number;
}

export async function scanSensitive(
  projectPath: string,
  config: ObfuscatorConfig,
): Promise<SensitiveResult> {
  const files = await scanProject(projectPath, config);
  const findings: SensitiveFinding[] = [];

  for (const file of files) {
    const content = await fs.readFile(file.absolutePath, 'utf-8');
    for (const { type, regex } of SENSITIVE_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        findings.push({ file: file.relativePath, type, value: match[0].slice(0, 80) });
      }
    }
  }

  return { findings, count: findings.length };
}

export async function runPreloadSensitive(
  projectPath: string,
  config: ObfuscatorConfig,
  logMode: ObfuscatorConfig['mode'] = config.mode,
): Promise<{ result: SensitiveResult; logPath: string }> {
  const result = await scanSensitive(projectPath, config);
  const logPath = await writePreloadLog(projectPath, logMode, 'sensitive', {
    scope: config.scope,
    count: result.count,
    findings: result.findings,
  });
  return { result, logPath };
}
