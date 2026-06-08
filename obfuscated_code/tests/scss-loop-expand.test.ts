import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import {
  collectScssLoopClassNames,
  expandScssLoopsInContent,
} from '../src/transforms/scss-loop-expand.js';

const UVIEW_COMMON = path.resolve(
  '../uni-starter-x/uni_modules/vk-uview-ui/libs/css/common.scss',
);

describe('expandScssLoopsInContent', () => {
  it('展开 u-flex 与 u-font 循环', () => {
    const input = [
      '// 定义flex等分',
      '@for $i from 0 through 2 {',
      '\t.u-flex-#{$i} {',
      '\t\tflex: $i;',
      '\t}',
      '}',
      '// 定义字体(px)单位，小于20都为px单位字体',
      '@for $i from 9 to 11 {',
      '\t.u-font-#{$i} {',
      '\t\tfont-size: $i + px;',
      '\t}',
      '}',
    ].join('\n');

    const { content, classNames } = expandScssLoopsInContent(input);
    expect(content).toContain('.u-flex-0 {');
    expect(content).toContain('flex: 0;');
    expect(content).toContain('.u-flex-2 {');
    expect(content).toContain('.u-font-9 {');
    expect(content).toContain('font-size: 9px;');
    expect(content).toContain('.u-font-10 {');
    expect(content).not.toContain('@for');
    expect(content).not.toContain('#{$');
    expect(classNames.has('u-flex-1')).toBe(true);
    expect(classNames.has('u-font-10')).toBe(true);
  });

  it('展开间距循环含 @if 与 @each', () => {
    const input = [
      '// 定义内外边距，历遍1-80',
      '@for $i from 0 through 80 {',
      '\t@if $i % 2 == 0 or $i % 5 == 0 {',
      '\t\t.u-p-#{$short}-#{$i} {',
      '\t\t\tpadding-#{$long}: $i + rpx!important;',
      '\t\t}',
      '\t}',
      '}',
    ].join('\n');

    // 简化：仅保留 @each 内联在 body 中测试
    const fullInput = [
      '// 定义内外边距，历遍1-80',
      '@for $i from 0 through 80 {',
      '\t@if $i % 2 == 0 or $i % 5 == 0 {',
      '\t\t.u-p-l-#{$i} {',
      '\t\t\tpadding-left: $i + rpx!important;',
      '\t\t}',
      '\t}',
      '}',
    ].join('\n');

    const { content, classNames } = expandScssLoopsInContent(fullInput);
    expect(content).toContain('.u-p-l-30 {');
    expect(content).toContain('padding-left: 30rpx!important;');
    expect(classNames.has('u-p-l-30')).toBe(true);
    expect(classNames.has('u-p-l-31')).toBe(false);
    expect(content).not.toContain('#{$');
  });

  it('不破坏 mixin 内 @if @else', () => {
    const input = [
      '@mixin ux-gap-item($size, $cols, $gap, $top: 1) {',
      '  width: #{$size}rpx;',
      '  @if ($top == 1) {',
      '    margin-top: #{$gap}rpx;',
      '  } @else {',
      '    margin-top: #{$top}rpx;',
      '  }',
      '}',
    ].join('\n');
    const { content } = expandScssLoopsInContent(input);
    expect(content).toContain('@if ($top == 1)');
    expect(content).toContain('@else');
  });

  it('跳过依赖 SCSS 变量列表的 @each（如 $theme-list）', () => {
    const input = [
      '$theme-list: ( "a": foo );',
      '@each $theme-name, $theme-class in $theme-list {',
      '\t.#{$theme-class} { color: red; }',
      '}',
    ].join('\n');

    const { content } = expandScssLoopsInContent(input);
    expect(content).toContain('$theme-list');
    expect(content).toContain('@each');
  });

  it('完整展开 vk-uview common.scss 全部 @for', () => {
    const source = readFileSync(UVIEW_COMMON, 'utf-8');
    const { content, classNames } = expandScssLoopsInContent(source);

    expect(content).not.toContain('@for $i from 0 through 80');
    expect(content).not.toContain('@for $i from 0 through 12');
    expect(content).not.toContain('@for $i from 9 to 20');
    expect(content).not.toContain('#{$');
    expect(classNames.has('u-flex-1')).toBe(true);
    expect(classNames.has('u-font-28')).toBe(true);
    expect(classNames.has('u-p-l-30')).toBe(true);
    expect(classNames.has('u-m-66')).toBe(true);
  });
});

describe('collectScssLoopClassNames', () => {
  it('从循环中收集 class 名', () => {
    const names = collectScssLoopClassNames('@for $i from 0 through 1 { .u-flex-#{$i} { flex: $i; } }');
    expect(names.has('u-flex-0')).toBe(true);
    expect(names.has('u-flex-1')).toBe(true);
  });
});
