import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { parseScript } from '../src/parser/babel.js';
import { runScriptTransformPipeline } from '../src/transforms/script-pipeline.js';
import { encryptStringLiterals, formatFromCharCodeExpr, mergeStringEncryptCollectors } from '../src/transforms/string-encryption.js';
import { writeStringsMapArtifact } from '../src/code/artifacts.js';
import { ARTIFACT_JSON, modeArtifactName } from '../src/output/artifact-names.js';
import { createDefaultConfig } from '../src/config/defaults.js';

describe('string encryption map', () => {
  it('formatFromCharCodeExpr 生成可读表达式', () => {
    expect(formatFromCharCodeExpr('hi')).toBe('String.fromCharCode(104,105)');
  });

  it('runScriptTransformPipeline 收集字面量映射', () => {
    const code = 'const s = "hello";';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.encryptAllStrings = true;

    const collector = new Map<string, string>();
    runScriptTransformPipeline(parsed.ast!, new Map(), config, code, collector);
    expect(collector.get('hello')).toBe('String.fromCharCode(104,101,108,108,111)');
  });

  it('mergeStringEncryptCollectors 合并多文件映射', () => {
    const a = new Map([['a', 'String.fromCharCode(97)']]);
    const b = new Map([['b', 'String.fromCharCode(98)']]);
    expect(mergeStringEncryptCollectors([a, b])).toEqual({
      a: 'String.fromCharCode(97)',
      b: 'String.fromCharCode(98)',
    });
  });

  it('uni.showToast position 等 API 枚举参数不参与加密', () => {
    const code = `
uni.showToast({ title: "hi", position: "bottom" });`;
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    const config = createDefaultConfig();
    config.features.encryptAllStrings = true;
    const collector = new Map<string, string>();
    encryptStringLiterals(parsed.ast!, config, collector);
    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code, collector);
    expect(out).toContain('position: "bottom"');
    expect(collector.has('bottom')).toBe(false);
    expect(collector.get('hi')).toBeTruthy();
  });

  it('ObjectMethod 字符串方法名（如 Vue watch）不参与加密', () => {
    const code = `
export default {
  watch: {
    "uForm.errorType"(val) {
      const msg = "hello";
      console.log(msg, val);
    }
  }
};`;
    const parsed = parseScript(code, 'javascript', 'demo.vue');
    const config = createDefaultConfig();
    config.features.encryptAllStrings = true;
    expect(() => encryptStringLiterals(parsed.ast!, config, new Map())).not.toThrow();
    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code, new Map());
    expect(out).toContain('"uForm.errorType"');
    expect(out).toContain('fromCharCode');
  });

  it('writeStringsMapArtifact 写出 mode 前缀 strings JSON', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-str-'));
    await writeStringsMapArtifact(root, 'code', {
      hello: 'String.fromCharCode(104,101,108,108,111)',
    }, 2);

    const outPath = path.join(root, 'obfuscated', 'config', modeArtifactName('code', ARTIFACT_JSON.mapStrings));
    expect(await fs.pathExists(outPath)).toBe(true);
    const data = await fs.readJson(outPath);
    expect(data.count).toBe(1);
    expect(data.mappings.hello).toContain('fromCharCode');
  });
});
