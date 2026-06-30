import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { isTextFile } from './replacer.js';
import { matchesPathWhitelist, normalizePath } from './whitelist.js';
import { isArtifactJsonFile } from '../output/artifact-names.js';

export interface ResidualPathIssue {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

interface PathMapping {
  from: string;
  to: string;
}

const SKIP_FILES = new Set([
  'clone-log.txt',
  'cloneLog.txt',
  'obfuscation-log.txt',
  'symbols-collect.log.txt',
  'symbols-collect.json',
  'naming-allocate.log.txt',
  'file-obfuscate.log.txt',
  'whitelist.json',
  'extracted-symbols.json',
  'extracted-vocab.json',
  'sensitive-scan-report.json',
]);

function isSkippedToolArtifact(basename: string): boolean {
  if (SKIP_FILES.has(basename)) return true;
  if (/^(clone|code|full)-symbols-collect\.(log\.txt|json)$/.test(basename)) return true;
  if (/^(clone|code|full)-(naming-allocate|file-obfuscate|comment-strip|string-encrypt)\.log\.txt$/.test(basename)) return true;
  return false;
}

function isPathLikePattern(pattern: string): boolean {
  return pattern.includes('/') || pattern.startsWith('./') || pattern.startsWith('\'./') || pattern.startsWith('"./');
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** Avoid flagging `store.uts` / `service/request.uts` when the pattern is a directory segment. */
function isFilenameSuffixFalsePositive(line: string, pattern: string): boolean {
  const core = pattern.replace(/^['"`./]+|['"`]+$/g, '');
  if (!core || core.includes('/')) return false;
  const idx = line.indexOf(pattern);
  if (idx < 0) return false;
  const after = line[idx + pattern.length];
  return after === '.';
}

function buildSearchPatterns(mappings: PathMapping[]): string[] {
  const patterns = new Set<string>();

  for (const { from, to } of mappings) {
    if (!from || from === to) continue;

    const variants = [
      from,
      `/${from}`,
      `./${from}`,
      `'${from}'`,
      `"${from}"`,
      `\`${from}\``,
      `'./${from}'`,
      `"./${from}"`,
      `'/${from}'`,
      `"/${from}"`,
      `\`/${from}\``,
    ];

    for (const v of variants) {
      if (isPathLikePattern(v)) patterns.add(v);
    }

    const base = from.split('/').pop();
    if (base && from.includes('/')) {
      for (const v of [
        `pages/${from}`, `/pages/${from}`,
        `'pages/${from}'`, `"/pages/${from}"`, `\`/pages/${from}\``,
        `pages/${base}`, `/pages/${base}`,
        `'/pages/${base}'`, `"/pages/${base}"`, `\`/pages/${base}\``,
      ]) {
        patterns.add(v);
      }
    }
  }

  return [...patterns].sort((a, b) => b.length - a.length);
}

function extractPathFromPattern(pattern: string): string {
  return normalizePath(pattern.replace(/^['"`./]+|['"`]+$/g, ''));
}

function isWhitelistedContext(pattern: string, pathWhitelist: string[]): boolean {
  const normalized = extractPathFromPattern(pattern);
  if (matchesPathWhitelist(normalized, pathWhitelist)) return true;

  const parts = normalized.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join('/');
    if (matchesPathWhitelist(prefix, pathWhitelist)) return true;
  }
  return false;
}

export async function scanResidualPaths(
  projectRoot: string,
  mappings: PathMapping[],
  pathWhitelist: string[] = [],
): Promise<ResidualPathIssue[]> {
  if (mappings.length === 0) return [];

  const patterns = buildSearchPatterns(mappings);
  const issues: ResidualPathIssue[] = [];

  const files = await fg('**/*', {
    cwd: projectRoot,
    onlyFiles: true,
    dot: false,
    ignore: ['node_modules/**', 'unpackage/**', 'dist/**'],
  });

  for (const relFile of files) {
    if (isSkippedToolArtifact(path.basename(relFile)) || isArtifactJsonFile(path.basename(relFile))) continue;
    if (!isTextFile(relFile)) continue;

    const content = await fs.readFile(path.join(projectRoot, relFile), 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      for (const pattern of patterns) {
        if (!line.includes(pattern)) continue;
        if (isFilenameSuffixFalsePositive(line, pattern)) continue;
        if (isWhitelistedContext(pattern, pathWhitelist)) continue;

        const mapping = mappings.find((m) => m.from !== m.to && (
          pattern.includes(m.from) || pattern.endsWith(m.from.split('/').pop() ?? '')
        ));
        if (mapping && line.includes(mapping.to)) continue;

        issues.push({
          file: relFile,
          line: i + 1,
          pattern,
          snippet: line.trim().slice(0, 120),
        });
        break;
      }
    }
  }

  return issues;
}
