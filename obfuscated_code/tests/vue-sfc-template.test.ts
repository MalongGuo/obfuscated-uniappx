import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { parseVueFile } from '../src/parser/vue-sfc.js';
import { isRenamableIdentifier } from '../src/transforms/rename-map.js';

describe('vue-sfc template identifier collection', () => {
  it('v-for 只收集 list，不收集 alias', () => {
    const tpl = '<view v-for="item in serviceEntries" :key="item.id"></view>';
    const parsed = parseVueFile(`<template>${tpl}</template>`, 'pages/a.uvue', '.uvue');
    expect(parsed.templateIdentifiers).not.toContain('item');
    expect(parsed.templateIdentifiers).toContain('serviceEntries');
    expect(parsed.templateIdentifiers).not.toContain('item in serviceEntries');
  });

  it('可选链表达式收集 errorInfo', () => {
    const tpl = '<view v-if="errorInfo?.[\'message\'] != null"></view>';
    const parsed = parseVueFile(`<template>${tpl}</template>`, 'components/a.uvue', '.uvue');
    expect(parsed.templateIdentifiers).toContain('errorInfo');
  });

  it('home.uvue 级模板不抛出且不含整段 v-for 符号', () => {
    const content = fs.readFileSync(
      new URL('../../uni-starter-x/pages/u/home/home.uvue', import.meta.url),
      'utf8',
    );
    const parsed = parseVueFile(content, 'pages/u/home/home.uvue', '.uvue');
    for (const name of parsed.templateIdentifiers) {
      expect(isRenamableIdentifier(name)).toBe(true);
      expect(name).not.toMatch(/\s+in\s+/);
      expect(name).not.toMatch(/==/);
    }
  });
});

describe('isRenamableIdentifier', () => {
  it('拒绝整段 v-for 与条件表达式', () => {
    expect(isRenamableIdentifier('item in serviceEntries')).toBe(false);
    expect(isRenamableIdentifier('index == 0')).toBe(false);
  });

  it('拒绝 JS 关键字 in', () => {
    expect(isRenamableIdentifier('in')).toBe(false);
  });

  it('接受普通标识符', () => {
    expect(isRenamableIdentifier('serviceEntries')).toBe(true);
  });
});
