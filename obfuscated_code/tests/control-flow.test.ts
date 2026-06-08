import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/parser/babel.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { flattenControlFlow } from '../src/transforms/control-flow.js';
import { runScriptTransformPipeline } from '../src/transforms/script-pipeline.js';
import _generateModule from '@babel/generator';

const generate = (_generateModule.default ?? _generateModule) as (
  ast: import('@babel/types').File,
) => { code: string };

describe('flattenControlFlow', () => {
  it('.uts 函数体包在 if (true) 内', () => {
    const code = `
function compute(a: number): number {
  const x = a + 1;
  const y = x * 2;
  return y;
}
`;
    const parsed = parseScript(code, 'typescript', 'pages/demo.uts');
    flattenControlFlow(parsed.ast!);
    const out = generate(parsed.ast!).code;
    expect(out).toMatch(/if\s*\(\s*true\s*\)/);
    expect(out).toContain('return y');
  });

  it('箭头函数块体同样处理', () => {
    const code = 'const fn = () => { const a = 1; const b = 2; return a + b; };';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    flattenControlFlow(parsed.ast!);
    const out = generate(parsed.ast!).code;
    expect(out).toMatch(/if\s*\(\s*true\s*\)/);
  });

  it('已包裹时不重复处理', () => {
    const code = 'function f() { if (true) { return 1; } }';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    flattenControlFlow(parsed.ast!);
    const out = generate(parsed.ast!).code;
    expect(out.match(/if\s*\(\s*true\s*\)/g)?.length).toBe(1);
  });

  it('单语句函数体不包裹', () => {
    const code = 'function f() { return 1; }';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    flattenControlFlow(parsed.ast!);
    const out = generate(parsed.ast!).code;
    expect(out).not.toMatch(/if\s*\(\s*true\s*\)/);
  });
});

describe('runScriptTransformPipeline controlFlowFlatten', () => {
  it('独立开关启用，不依赖 disruptExecOrder', () => {
    const code = `
function alpha() {
  const a = 1;
  const b = 2;
  return a + b;
}
`;
    const parsed = parseScript(code, 'typescript', 'pages/demo.uts');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.controlFlowFlatten = true;
    config.features.disruptExecOrder = false;

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toMatch(/if\s*\(\s*true\s*\)/);
  });
});
