#!/usr/bin/env node
/**
 * 修复 shuffleFuncOrder 导致的 script 顺序错误（}import）。
 * 用法: node scripts/repair-shuffle-script.mjs <project-root>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import _generateModule from '@babel/generator';
import { parseScript } from '../dist/parser/babel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generate = (_generateModule.default ?? _generateModule);

function isFnLike(stmt) {
  return stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration';
}

function repairScriptContent(code) {
  if (!code.includes('import')) return { code, changed: false };

  const parsed = parseScript(code, 'typescript', 'repair.uvue');
  if (!parsed.ast) return { code, changed: false };

  const body = parsed.ast.program.body;
  const firstImportIdx = body.findIndex((n) => n.type === 'ImportDeclaration');
  const firstFnIdx = body.findIndex(isFnLike);

  if (firstFnIdx < 0 || firstImportIdx < 0 || firstFnIdx >= firstImportIdx) {
    return { code, changed: false };
  }

  const fnLike = body.filter(isFnLike);
  const rest = body.filter((n) => !isFnLike(n));
  parsed.ast.program.body = [...rest, ...fnLike];

  const out = generate(parsed.ast, { comments: true }).code;
  return { code: out, changed: true };
}

function repairUvueFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('}import')) return false;

  const tagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let result = content;
  let changed = false;
  let match;

  while ((match = tagRe.exec(content)) !== null) {
    const attrs = match[1];
    const body = match[2];
    if (!/\blang\s*=\s*["']uts["']/.test(attrs) && !/\blang\s*=\s*["']ts["']/.test(attrs)) {
      continue;
    }
    const repaired = repairScriptContent(body);
    if (!repaired.changed) continue;
    const full = match[0];
    const replacement = `<script${attrs}>${repaired.code}</script>`;
    result = result.replace(full, replacement);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, result);
  }
  return changed;
}

function repairUtsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('}import')) return false;
  const repaired = repairScriptContent(content);
  if (!repaired.changed) return false;
  fs.writeFileSync(filePath, repaired.code);
  return true;
}

function collectTargets(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (name === 'node_modules' || name === 'unpackage') continue;
        walk(full);
        continue;
      }
      if (!/\.(uvue|vue|uts)$/.test(name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes('}import')) out.push(full);
    }
  };
  walk(root);
  return out;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: node scripts/repair-shuffle-script.mjs <project-root>');
    process.exit(1);
  }

  const absRoot = path.resolve(root);
  const targets = collectTargets(absRoot);
  let fixed = 0;

  for (const file of targets) {
    const ok = file.endsWith('.uts') ? repairUtsFile(file) : repairUvueFile(file);
    if (ok) {
      fixed++;
      console.log(`[fixed] ${path.relative(absRoot, file)}`);
    }
  }

  console.log(`\nRepair complete: ${fixed}/${targets.length} files fixed`);
}

main();
