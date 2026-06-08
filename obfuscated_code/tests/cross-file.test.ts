import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/parser/babel.js';
import { parseVueFile } from '../src/parser/vue-sfc.js';
import type { ParsedFile } from '../src/parser/types.js';
import { allocateSymbolTable } from '../src/symbols/allocator.js';
import { buildSymbolTable, lookupSymbol } from '../src/symbols/table.js';
import { makeSymbolKey } from '../src/symbols/keys.js';

describe('cross-file symbol linking', () => {
  it('does not merge same-named locals from different files', () => {
    const utilAst = parseScript('export function utilFn() { const data = 1; return data; }', 'uts').ast!;
    const pageAst = parseScript('import { utilFn } from "./util.uts"; const data = 2; utilFn();', 'uts').ast!;

    const parsed: ParsedFile[] = [
      { kind: 'module', relativePath: 'util.uts', lang: 'uts', ast: utilAst },
      { kind: 'module', relativePath: 'page.uts', lang: 'uts', ast: pageAst },
    ];

    const table = buildSymbolTable(parsed, { keepExports: true });
    expect(table.symbols.has(makeSymbolKey('util.uts', 'data'))).toBe(true);
    expect(table.symbols.has(makeSymbolKey('page.uts', 'data'))).toBe(true);
    expect(table.symbols.get(makeSymbolKey('util.uts', 'data'))!.obfuscatedName).toBeUndefined();
  });

  it('links export and import bindings in the same linkGroup', () => {
    const menuAst = parseScript('export function generateMenu() { return []; }', 'uts').ast!;
    const pageContent = parseVueFile(
      '<template><view @click="generateMenu()" /></template><script setup lang="uts">import { generateMenu } from "./generateMenu.uts"</script>',
      'pages/tabBar/component.uvue',
      '.uvue',
    );

    const parsed: ParsedFile[] = [
      { kind: 'module', relativePath: 'pages/tabBar/generateMenu.uts', lang: 'uts', ast: menuAst },
      pageContent,
    ];

    const table = buildSymbolTable(parsed, { keepExports: false });
    const exportEntry = lookupSymbol(table, 'pages/tabBar/generateMenu.uts', 'generateMenu');
    const importEntry = lookupSymbol(table, 'pages/tabBar/component.uvue', 'generateMenu');

    expect(exportEntry?.linkGroup).toBeDefined();
    expect(importEntry?.linkGroup).toBe(exportEntry?.linkGroup);
    expect(importEntry?.renameable).toBe(true);

    allocateSymbolTable(table, 'human', 'test-seed');
    expect(importEntry?.obfuscatedName).toBe(exportEntry?.obfuscatedName);
  });

  it('freezes linked imports when keepExports is true', () => {
    const menuAst = parseScript('export function generateMenu() { return []; }', 'uts').ast!;
    const pageContent = parseVueFile(
      '<script setup lang="uts">import { generateMenu } from "./generateMenu.uts"</script>',
      'pages/tabBar/component.uvue',
      '.uvue',
    );

    const parsed: ParsedFile[] = [
      { kind: 'module', relativePath: 'pages/tabBar/generateMenu.uts', lang: 'uts', ast: menuAst },
      pageContent,
    ];

    const table = buildSymbolTable(parsed, { keepExports: true });
    const exportEntry = lookupSymbol(table, 'pages/tabBar/generateMenu.uts', 'generateMenu');
    const importEntry = lookupSymbol(table, 'pages/tabBar/component.uvue', 'generateMenu');

    expect(exportEntry?.renameable).toBe(false);
    expect(importEntry?.renameable).toBe(false);
  });

  it('preserves $callMethod API method names across files', () => {
    const loading = parseVueFile(
      `<script lang="uts">
export default {
  methods: {
    open: function () { this.visible = true; },
    close: function () { this.visible = false; },
  },
};
</script>`,
      'components/ux-page-loading/ux-page-loading.uvue',
      '.uvue',
    );
    const order = parseVueFile(
      `<script lang="uts">
export default {
  methods: {
    showLoading() {
      const ref = this.$refs.loading as ComponentPublicInstance;
      ref.$callMethod("open");
    },
    hideLoading() {
      const ref = this.$refs.loading as ComponentPublicInstance;
      ref.$callMethod("close");
    },
  },
};
</script>`,
      'pages/u/order/order.uvue',
      '.uvue',
    );

    const table = buildSymbolTable([loading, order], { keepExports: false });
    const openEntry = lookupSymbol(table, 'components/ux-page-loading/ux-page-loading.uvue', 'open');
    const closeEntry = lookupSymbol(table, 'components/ux-page-loading/ux-page-loading.uvue', 'close');

    expect(openEntry?.renameable).toBe(false);
    expect(closeEntry?.renameable).toBe(false);

    allocateSymbolTable(table, 'human', 'test-seed');
    expect(openEntry?.obfuscatedName).toBeUndefined();
    expect(closeEntry?.obfuscatedName).toBeUndefined();
  });
});
