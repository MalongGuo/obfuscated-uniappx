import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  buildParseLog,
  buildParseLogs,
  createLogSession,
  sessionLogFilename,
  modeSessionLogFilename,
} from '../src/output/session.js';
import { writeFileObfuscateLog } from '../src/output/session-logs.js';

describe('createLogSession', () => {
  it('session.dir 指向 obfuscated/config/', () => {
    const at = new Date(2026, 5, 6, 13, 55, 30);
    const session = createLogSession('/workspace/uni-test', 'abcToken123', at);
    expect(session.baseName).toBe(`uni-test_${at.getTime()}_abcToken123`);
    expect(session.dir).toMatch(/\/uni-test\/obfuscated\/config$/);
    expect(session.projectPath).toMatch(/\/uni-test$/);
    expect(session.token).toBe('abcToken123');
  });
});

describe('modeSessionLogFilename', () => {
  it('naming-allocate 带 mode 前缀', () => {
    expect(modeSessionLogFilename('clone', 'naming-allocate')).toBe('clone-naming-allocate.log.txt');
  });

  it('writeFileObfuscateLog 写出 mode 前缀文件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-session-'));
    await writeFileObfuscateLog(root, 'code', [
      {
        file: 'pages/a.uvue',
        identifierRenamed: true,
        commentsStripped: false,
        changed: true,
        renames: [{ from: 'onLoad', to: 'AbCdEf' }],
      },
    ]);
    const logPath = path.join(root, 'obfuscated', 'config', 'code-file-obfuscate.log.txt');
    expect(await fs.pathExists(logPath)).toBe(true);
  });
});

describe('sessionLogFilename', () => {
  it('诊断日志 *.log.txt，obfuscation-log → obfuscation-log.txt', () => {
    expect(sessionLogFilename('symbols-collect')).toBe('symbols-collect.log.txt');
    expect(sessionLogFilename('obfuscation-log')).toBe('obfuscation-log.txt');
  });
});

describe('buildParseLog', () => {
  it('summarizes parsed files and errors', () => {
    const log = buildParseLog([
      {
        kind: 'module',
        relativePath: 'main.uts',
        lang: 'uts',
        ast: null,
        parseError: undefined,
      },
      {
        kind: 'uvue',
        relativePath: 'pages/index.uvue',
        template: '<view />',
        scripts: [{ lang: 'uts', content: '', ast: null, parseError: 'syntax error' }],
        templateIdentifiers: [],
      },
    ]);
    expect(log.fileCount).toBe(2);
    expect(log.errorCount).toBe(1);
    expect(log.successCount).toBe(1);
  });
});

describe('buildParseLogs', () => {
  it('拆分 other-parse.json 与 uts-parse.json', () => {
    const { parse, utsParse } = buildParseLogs([
      {
        kind: 'module',
        relativePath: 'utils.js',
        lang: 'js',
        ast: null,
      },
      {
        kind: 'module',
        relativePath: 'main.uts',
        lang: 'uts',
        ast: null,
      },
      {
        kind: 'uvue',
        relativePath: 'pages/a.uvue',
        template: null,
        scripts: [{ lang: 'uts', content: '', ast: null }],
        templateIdentifiers: [],
      },
      {
        kind: 'vue',
        relativePath: 'pages/b.vue',
        template: null,
        scripts: [{ lang: 'ts', content: '', ast: null }],
        templateIdentifiers: [],
      },
    ]);
    expect(parse.fileCount).toBe(2);
    expect(utsParse.fileCount).toBe(2);
    expect((parse.files as Array<{ file: string }>).map((f) => f.file)).toEqual(
      expect.arrayContaining(['utils.js', 'pages/b.vue']),
    );
    expect((utsParse.files as Array<{ file: string }>).map((f) => f.file)).toEqual(
      expect.arrayContaining(['main.uts', 'pages/a.uvue']),
    );
  });
});
