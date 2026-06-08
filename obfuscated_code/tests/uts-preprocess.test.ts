import { describe, expect, it } from 'vitest';
import { preprocessUts } from '../src/parser/uts-preprocess.js';
import { parseScript } from '../src/parser/babel.js';

describe('preprocessUts', () => {
  it('将 Int 转为 number', () => {
    const { code, applied } = preprocessUts('const x: Int = 1');
    expect(code).toContain('number');
    expect(applied).toContain('Int-type');
  });

  it('注释 android import', () => {
    const { code } = preprocessUts("import Build from 'android.os.Build';");
    expect(code).toMatch(/^\/\//m);
  });
});

describe('parseScript UTS fallback', () => {
  it('可解析含 android import 的 UTS', () => {
    const code = "import Build from 'android.os.Build';\nconst id: Int = 7890";
    const result = parseScript(code, 'uts', 'test.uts');
    expect(result.ast).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('可解析 export function', () => {
    const code = `
      export function createNotificationProgress(options: CreateOptions): void {
        const id: Int = 1;
      }
    `;
    const result = parseScript(code, 'uts', 'index.uts');
    expect(result.ast).not.toBeNull();
  });
});
