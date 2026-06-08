#!/usr/bin/env node
/**
 * npm run preload[:mode] / npm run run[:mode]
 * 从 npm_lifecycle_event 解析 mode；preload 无后缀时 CLI 默认 full，run 沿用 obfuscator.config.json。
 *
 * 示例:
 *   npm run preload:code
 *   npm run run:full -- --seed my-seed --verbose
 *   PROJECT=../samples/foo npm run run:clone
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_MODES = new Set(['clone', 'code', 'full']);

export function parseNpmModeEvent(event) {
  const match = /^(preload|run)(?::(\w+))?$/.exec(event);
  if (!match) return null;
  const [, cmd, mode] = match;
  if (mode && !VALID_MODES.has(mode)) {
    throw new Error(`未知 mode: ${mode}，支持 clone | code | full`);
  }
  return { cmd, mode: mode ?? null };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cli = path.join(root, 'dist/cli.js');
const defaultProject = path.resolve(root, process.env.PROJECT ?? '../uni-test');

function resolveInvocation() {
  const fromEvent = parseNpmModeEvent(process.env.npm_lifecycle_event ?? '');
  if (fromEvent) return { ...fromEvent, rest: process.argv.slice(2) };

  const rest = process.argv.slice(2);
  if (rest.length === 0) return null;
  const cmd = rest[0];
  if (cmd !== 'preload' && cmd !== 'run') return null;
  let offset = 1;
  let mode = null;
  if (rest[1] && VALID_MODES.has(rest[1])) {
    mode = rest[1];
    offset = 2;
  }
  return { cmd, mode, rest: rest.slice(offset) };
}

function main() {
  let invocation;
  try {
    invocation = resolveInvocation();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!invocation) {
    console.error('用法: npm run preload[:clone|code|full] [-- [project] [flags...]]');
    console.error('      npm run run[:clone|code|full] [-- [project] [flags...]]');
    process.exit(1);
  }

  const { cmd, mode, rest } = invocation;
  let project = defaultProject;
  const extraArgs = [];

  if (rest.length > 0 && !rest[0].startsWith('-')) {
    project = path.resolve(process.cwd(), rest[0]);
    extraArgs.push(...rest.slice(1));
  } else {
    extraArgs.push(...rest);
  }

  const args = [cli, cmd, project];
  const effectiveMode = mode ?? (cmd === 'preload' ? 'full' : null);
  if (effectiveMode) args.push('--mode', effectiveMode);
  args.push(...extraArgs);

  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
