import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/parser/babel.js';
import { disruptExecutionOrder } from '../src/transforms/disrupt-exec-order.js';
import _generateModule from '@babel/generator';

const generate = (_generateModule.default ?? _generateModule) as (ast: unknown) => { code: string };

describe('disruptExecutionOrder', () => {
  it('不把赋值语句洗到 $emit 之前（nav-height 依赖 heightWrap 先赋值）', () => {
    const source = [
      'function mounted() {',
      '  const statusBarHeight = 20;',
      '  let contentHeight = 48;',
      '  this.heightWrap = statusBarHeight + contentHeight;',
      '  this.$emit("capsule-ready", this.capsule);',
      '  this.$emit("nav-height", this.heightWrap);',
      '  this.internalHeight = contentHeight;',
      '}',
    ].join('\n');

    const ast = parseScript(source, 'typescript', 'ux-nav.uvue').ast!;
    disruptExecutionOrder(ast, 'nav-seed');

    const code = generate(ast).code.replace(/\s+/g, ' ');
    const assignHeightWrap = code.indexOf('this.heightWrap =');
    const emitNav = code.indexOf('$emit("nav-height"');
    expect(assignHeightWrap).toBeGreaterThan(-1);
    expect(emitNav).toBeGreaterThan(-1);
    expect(assignHeightWrap).toBeLessThan(emitNav);
  });
});
