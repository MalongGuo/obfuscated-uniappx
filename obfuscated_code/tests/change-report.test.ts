import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { createDefaultConfig } from '../src/config/defaults.js';
import {
  buildChangeReportMarkdown,
  writeChangeReportArtifacts,
} from '../src/output/change-report.js';
import { ARTIFACT_JSON, modeArtifactName } from '../src/output/artifact-names.js';

describe('change-report', () => {
  it('buildChangeReportMarkdown 包含汇总、CSS class 与逐文件明细', () => {
    const config = createDefaultConfig();
    config.features.renameFuncPropVarEnum = true;
    config.features.enhancedUiJunkCode = true;

    const md = buildChangeReportMarkdown({
      sourceProjectPath: '/src/project',
      outputPath: '/out/project_token',
      mode: 'code',
      config,
      classified: {
        functions: { onLoad: 'AbCdEf' },
        properties: { menuList: 'XyZ123' },
        classes: { CartRow: 'eTIBrbhM' },
        locals: { count: 'nXKtB' },
        totalMappings: 4,
      },
      fileEntries: [
        {
          file: 'pages/u/home/home.uvue',
          identifierRenamed: true,
          commentsStripped: false,
          changed: true,
          renames: [{ from: 'onLoad', to: 'AbCdEf' }],
          astTransformed: true,
          stringMappings: new Map(),
        },
        {
          file: 'pages/index.uvue',
          identifierRenamed: false,
          commentsStripped: false,
          changed: true,
          renames: [],
          astTransformed: false,
          stringMappings: new Map(),
        },
      ],
      cssClassMap: new Map([['category-page', 'c62d352729c']]),
      stylesheetClassFiles: 3,
    });

    expect(md).toContain('# 混淆全部变更清单');
    expect(md).toContain('category-page');
    expect(md).toContain('c62d352729c');
    expect(md).toContain('pages/u/home/home.uvue');
    expect(md).toContain('onLoad');
    expect(md).toContain('业务页面速览');
    expect(md).toContain('已启用层级');
  });

  it('第二层/第三层章节在对应开关开启时出现', () => {
    const config = createDefaultConfig();
    config.features.renameFuncPropVarEnum = true;
    config.features.stripComments = true;
    config.commentStrip.enabled = true;
    config.features.encryptAllStrings = true;

    const md = buildChangeReportMarkdown({
      sourceProjectPath: '/src',
      outputPath: '/out',
      mode: 'code',
      config,
      classified: {
        functions: {},
        properties: {},
        classes: {},
        locals: {},
        totalMappings: 0,
      },
      fileEntries: [
        {
          file: 'pages/a.uvue',
          identifierRenamed: false,
          commentsStripped: true,
          changed: true,
          renames: [],
          astTransformed: false,
          stringMappings: new Map([['hello', 'String.fromCharCode(104,101,108,108,111)']]),
        },
      ],
      cssClassMap: new Map(),
      stylesheetClassFiles: 0,
      stringMappings: { hello: 'String.fromCharCode(104,101,108,108,111)' },
    });

    expect(md).toContain('第二层：注释清理');
    expect(md).toContain('第三层：字符串加密');
    expect(md).toContain('pages/a.uvue');
  });

  it('writeChangeReportArtifacts 写出 mode 前缀 md 与 css json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-change-'));
    const config = createDefaultConfig();
    config.mode = 'code';

    const written = await writeChangeReportArtifacts({
      sourceProjectPath: root,
      outputPath: path.join(root, 'out'),
      mode: 'code',
      config,
      classified: {
        functions: {},
        properties: {},
        classes: {},
        locals: {},
        totalMappings: 0,
      },
      fileEntries: [],
      cssClassMap: new Map([['search-bar', 'c498fa43982']]),
      stylesheetClassFiles: 1,
    });

    expect(written).toEqual([
      modeArtifactName('code', ARTIFACT_JSON.allChanges),
      modeArtifactName('code', ARTIFACT_JSON.cssClassMap),
    ]);

    const mdPath = path.join(root, 'obfuscated', 'config', written[0]!);
    const cssPath = path.join(root, 'obfuscated', 'config', written[1]!);
    expect(await fs.pathExists(mdPath)).toBe(true);
    expect(await fs.pathExists(cssPath)).toBe(true);
    const cssData = await fs.readJson(cssPath);
    expect(cssData.mappings['search-bar']).toBe('c498fa43982');
  });
});
