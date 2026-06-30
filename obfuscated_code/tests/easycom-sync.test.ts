import { describe, expect, it } from 'vitest';
import {
  buildEasycomMappings,
  stripEasycomBlock,
  syncComponentTags,
} from '../src/path/easycom-sync.js';

describe('component tag sync', () => {
  const mappings = [
    { from: 'components/u-link', to: 'components/TOKENu-link' },
    { from: 'components/uni-collapse', to: 'components/TOKENuni-collapse' },
    { from: 'components/uni-collapse-item', to: 'components/TOKENuni-collapse-item' },
    { from: 'components/page-head', to: 'components/TOKENpage-head' },
  ];
  const fileMappings = [
    { from: 'components/u-link/u-link.vue', to: 'components/TOKENu-link/TOKENu-link.vue' },
    { from: 'components/uni-collapse/uni-collapse.vue', to: 'components/TOKENuni-collapse/TOKENuni-collapse.vue' },
    {
      from: 'components/uni-collapse-item/uni-collapse-item.vue',
      to: 'components/TOKENuni-collapse-item/TOKENuni-collapse-item.vue',
    },
    { from: 'components/page-head/page-head.uvue', to: 'components/TOKENpage-head/TOKENpage-head.uvue' },
  ];

  const tagMappings = buildEasycomMappings(mappings, fileMappings);

  it('records name mapping u-link -> TOKENu-link', () => {
    const stemOnlyFiles = [
      { from: 'components/u-link/u-link', to: 'components/TOKENu-link/TOKENu-link.vue' },
    ];
    const result = buildEasycomMappings(
      [{ from: 'components/u-link', to: 'components/TOKENu-link' }],
      stemOnlyFiles,
    );
    expect(result).toEqual([
      {
        from: 'u-link',
        to: 'TOKENu-link',
        file: 'components/TOKENu-link/TOKENu-link.vue',
      },
    ]);
  });

  it('builds component tag mappings from components renames', () => {
    expect(tagMappings).toEqual([
      {
        from: 'page-head',
        to: 'TOKENpage-head',
        file: 'components/TOKENpage-head/TOKENpage-head.uvue',
      },
      {
        from: 'u-link',
        to: 'TOKENu-link',
        file: 'components/TOKENu-link/TOKENu-link.vue',
      },
      {
        from: 'uni-collapse',
        to: 'TOKENuni-collapse',
        file: 'components/TOKENuni-collapse/TOKENuni-collapse.vue',
      },
      {
        from: 'uni-collapse-item',
        to: 'TOKENuni-collapse-item',
        file: 'components/TOKENuni-collapse-item/TOKENuni-collapse-item.vue',
      },
    ]);
  });

  it('replaces component tags in templates', () => {
    const input = [
      '<page-head title="view"></page-head>',
      '<u-link class="hello-text" :href="url" :text="url"></u-link>',
      '<uni-collapse-item title="a"><uni-collapse v-else></uni-collapse></uni-collapse-item>',
    ].join('\n');
    const output = syncComponentTags(input, tagMappings);
    expect(output).toContain('<TOKENpage-head title="view"></TOKENpage-head>');
    expect(output).toContain('<TOKENu-link class="hello-text"');
    expect(output).toContain('</TOKENu-link>');
    expect(output).toContain('<TOKENuni-collapse-item title="a">');
    expect(output).toContain('<TOKENuni-collapse v-else></TOKENuni-collapse>');
    expect(output).not.toContain('<u-link');
    expect(output).not.toContain('<uni-collapse>');
  });

  it('strips easycom block from pages.json', () => {
    const input = `{
\t"easycom": {
\t\t"autoscan": true,
\t\t"custom": {
\t\t\t"^u-link$": "@/components/TOKENu-link/TOKENu-link.vue"
\t\t}
\t},
\t"leftWindow": {
\t\t"path": "windows/left-window.uvue"
\t}
}`;
    const output = stripEasycomBlock(input);
    expect(output).not.toContain('"easycom"');
    expect(output).toContain('"leftWindow"');
  });

  it('strips easycom block with 2-space indent (uni-starter-x style)', () => {
    const input = `{
  "easycom": {
    "autoscan": true,
    "custom": {
      "^ux-header$": "@/components/TOKENux-header/TOKENux-header.uvue"
    },
    "exclude": []
  },
  "pages": []
}`;
    const output = stripEasycomBlock(input);
    expect(output).not.toContain('"easycom"');
    expect(output).toContain('"pages"');
  });

  it('resolves obfuscated main file by newDir basename', () => {
    const result = buildEasycomMappings(
      [{ from: 'components/u-link', to: 'components/TOKENu-link' }],
      [{ from: 'components/u-link/u-link.vue', to: 'components/TOKENu-link/TOKENu-link.vue' }],
    );
    expect(result[0]?.file).toBe('components/TOKENu-link/TOKENu-link.vue');
  });
});
