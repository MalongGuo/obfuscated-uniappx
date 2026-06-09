#!/usr/bin/env node
/**
 * 移除 controlFlowFlatten 产生的 if (true) { ... } 包裹。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import _traverseModule from '@babel/traverse';
import _generateModule from '@babel/generator';
import { parseScript } from '../dist/parser/babel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const traverse = (_traverseModule.default ?? _traverseModule);
const generate = (_generateModule.default ?? _generateModule);

function unwrapIfTrue(ast) {
  traverse(ast, {
    IfStatement(path) {
      const test = path.node.test;
      if (test.type !== 'BooleanLiteral' || test.value !== true) return;
      const cons = path.node.consequent;
      if (cons.type !== 'BlockStatement') return;
      path.replaceWithMultiple(cons.body);
    },
  });
}

function repairScriptContent(code) {
  if (!code.includes('if (true)')) return { code, changed: false };
  const parsed = parseScript(code, 'typescript', 'repair.uvue');
  if (!parsed.ast) return { code, changed: false };
  try {
    unwrapIfTrue(parsed.ast);
    const out = generate(parsed.ast, { comments: true }).code;
    return { code: out, changed: out !== code };
  } catch {
    return { code, changed: false };
  }
}

function repairUvueFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('if (true)')) return false;
  const tagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let result = content;
  let changed = false;
  let match;
  while ((match = tagRe.exec(content)) !== null) {
    const attrs = match[1];
    const body = match[2];
    if (!/\blang\s*=\s*["']uts["']/.test(attrs) && !/\blang\s*=\s*["']ts["']/.test(attrs)) continue;
    const repaired = repairScriptContent(body);
    if (!repaired.changed) continue;
    result = result.replace(match[0], `<script${attrs}>${repaired.code}</script>`);
    changed = true;
  }
  if (changed) fs.writeFileSync(filePath, result);
  return changed;
}

function repairUtsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('if (true)')) return false;
  const repaired = repairScriptContent(content);
  if (!repaired.changed) return false;
  fs.writeFileSync(filePath, repaired.code);
  return true;
}

function walk(root) {
  let fixed = 0;
  const skip = new Set(['node_modules', 'unpackage']);
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!skip.has(name)) stack.push(full);
        continue;
      }
      if (full.endsWith('.uvue') || full.endsWith('.vue')) {
        if (repairUvueFile(full)) {
          fixed++;
          console.log(`[unwrap] ${path.relative(root, full)}`);
        }
      } else if (full.endsWith('.uts')) {
        if (repairUtsFile(full)) {
          fixed++;
          console.log(`[unwrap] ${path.relative(root, full)}`);
        }
      }
    }
  }
  return fixed;
}

const root = process.argv[2];
if (!root) {
  console.error('Usage: node repair-unwrap-if-true.mjs <project-root>');
  process.exit(1);
}
const n = walk(path.resolve(root));
console.log(`\nUnwrap complete: ${n} files fixed`);
