import { describe, expect, it } from 'vitest';
import {
  applyClassRenamesToDynamicClass,
  applyClassRenamesToScript,
  applyClassRenamesToStyle,
  applyClassRenamesToTemplate,
  buildClassRenameMap,
  extractStyleClassNames,
  extractTemplateClassNames,
  obfuscateVueClassAndStyleBlocks,
} from '../src/transforms/class-obfuscate.js';

const SAMPLE_SFC = `<template>
  <view class="page-header flex">
    <text class="title uni-btn">Hi</text>
  </view>
</template>
<script setup lang="uts"></script>
<style>
.page-header { background: #ffffff; }
.title { color: #333333; }
.uni-btn { padding: 8px; }
</style>`;

describe('class-obfuscate', () => {
  it('extractTemplateClassNames 收集业务 class，uni- 前缀仍会被收集', () => {
    const names = extractTemplateClassNames('<view class="page-header flex uni-icon"></view>');
    expect(names.has('page-header')).toBe(true);
    expect(names.has('flex')).toBe(true);
    expect(names.has('uni-icon')).toBe(true);
  });

  it('buildClassRenameMap 跳过 uni- 前缀，ux- 仍混淆', () => {
    const map = buildClassRenameMap(['page-header', 'uni-btn', 'ux-flex'], 'seed-uni', 'pages/a.uvue');
    expect(map.has('uni-btn')).toBe(false);
    expect(map.get('page-header')).toMatch(/^c[a-f0-9]{10}$/);
    expect(map.get('ux-flex')).toMatch(/^c[a-f0-9]{10}$/);
  });

  it('buildClassRenameMap 稳定且为 c{hash10}', () => {
    const map = buildClassRenameMap(['page-header', 'title'], 'seed-a', 'pages/a.uvue');
    expect(map.get('page-header')).toMatch(/^c[a-f0-9]{10}$/);
    expect(map.get('page-header')).toBe(buildClassRenameMap(['page-header'], 'seed-a', 'pages/a.uvue').get('page-header'));
  });

  it('ux-flex-col 别名映射到 ux-column 的 hash', () => {
    const map = buildClassRenameMap(['ux-column'], 'seed-col', 'pages/login.uvue');
    const columnHash = map.get('ux-column')!;
    const template = applyClassRenamesToTemplate(
      '<view class="login-header-tips ux-flex ux-flex-col ux-align-items-start"></view>',
      map,
    );
    expect(template).toContain(`ux-flex ${columnHash}`);
    expect(template).not.toContain('ux-flex-col');
    expect(extractTemplateClassNames('<view class="ux-flex-col"></view>').has('ux-column')).toBe(true);
    expect(extractTemplateClassNames('<view class="ux-flex-col"></view>').has('ux-flex-col')).toBe(false);
  });

  it('template 与 style class 联动重命名', () => {
    const map = buildClassRenameMap(['page-header', 'title'], 'seed-b', 'demo');
    const template = applyClassRenamesToTemplate('<view class="page-header"><text class="title"></text></view>', map);
    expect(template).toContain(`class="${map.get('page-header')}`);
    expect(template).toContain(`class="${map.get('title')}`);
    expect(template).not.toContain('page-header');
    expect(template).not.toContain('title');

    const style = applyClassRenamesToStyle('.page-header { color: red; }\n.title { font-size: 14px; }', map);
    expect(style).toContain(`.${map.get('page-header')}`);
    expect(style).toContain(`.${map.get('title')}`);
    expect(style).not.toContain('.page-header');
    expect(style).not.toContain('.title');
  });

  it('obfuscateVueClassAndStyleBlocks 联动 template/style 并微扰颜色', () => {
    const result = obfuscateVueClassAndStyleBlocks(SAMPLE_SFC, 'seed-c', 'pages/x.uvue', {
      nudgeColors: true,
    });
    expect(result.changed).toBe(true);
    expect(result.classRenames.length).toBeGreaterThanOrEqual(2);
    expect(result.content).not.toContain('class="page-header"');
    expect(result.content).not.toContain('.page-header');
    expect(result.content).toContain('uni-btn');
    expect(result.content).toContain('.uni-btn');
    expect(result.colorSample).toMatch(/#ffffff → #/);
  });

  it('globalClassMap 不覆盖 uni- 前缀保护', () => {
    const globalClassMap = new Map([['uni-title', 'cabcabcabc']]);
    const sfc = `<template><text class="uni-title">T</text></template><style>.uni-title { color: red; }</style>`;
    const result = obfuscateVueClassAndStyleBlocks(sfc, 'seed', 'file.uvue', { globalClassMap });
    expect(result.content).toContain('class="uni-title"');
    expect(result.content).toContain('.uni-title');
    expect(result.content).not.toContain('cabcabcabc');
  });

  it('globalClassMap 联动非 uni- 的 template 与 style', () => {
    const globalClassMap = new Map([['page-title', 'cabcabcabc']]);
    const sfc = `<template><text class="page-title">T</text></template><style>.page-title { color: red; }</style>`;
    const result = obfuscateVueClassAndStyleBlocks(sfc, 'seed', 'file.uvue', { globalClassMap });
    expect(result.content).toContain('class="cabcabcabc"');
    expect(result.content).toContain('.cabcabcabc');
    expect(result.content).not.toContain('page-title');
  });

  it(':class 动态绑定与 class map 联动', () => {
    const map = new Map([['active', 'cabcabcabc'], ['home-tab-text', 'cdefdefdef']]);
    const template =
      '<text class="home-tab-text" :class="[tab.id == activeTabId ? \'active\' : \'\', { active: isOn }]"></text>';
    const out = applyClassRenamesToTemplate(template, map);
    expect(out).toContain('class="cdefdefdef"');
    expect(out).toContain(`'${map.get('active')}'`);
    expect(out).toContain(`{ ${map.get('active')}: isOn }`);
    expect(out).not.toContain("'active'");
  });

  it(':class 三元字符串内多个 ux- 工具类联动 global map', () => {
    const map = new Map([
      ['ux-flex', 'c16902575f5'],
      ['ux-justify-content-center', 'c7f70ff1983'],
    ]);
    const template = '<view :class="isMp ? \'\' : \'ux-flex ux-justify-content-center\'"></view>';
    const out = applyClassRenamesToDynamicClass(template, map);
    expect(out).toContain(":class=\"isMp ? '' : 'c16902575f5 c7f70ff1983'\"");
    expect(out).not.toContain('ux-flex');
  });

  it('v-bind:class 动态字符串内多 class 联动', () => {
    const map = new Map([
      ['ux-flex', 'c16902575f5'],
      ['ux-row', 'c058740edd5'],
    ]);
    const template = '<view v-bind:class="\'ux-flex ux-row\'"></view>';
    const out = applyClassRenamesToDynamicClass(template, map);
    expect(out).toBe('<view v-bind:class="\'c16902575f5 c058740edd5\'"></view>');
  });

  it(':customClass 数组 prop 与 style 联动', () => {
    const map = new Map([
      ['search-bar-shell', 'c608f7be5b8'],
      ['search-bar-fill-header', 'ca65bd68eb0'],
    ]);
    const template =
      '<ux-search-bar :customClass="[\'search-bar-shell\', \'search-bar-fill-header\']"></ux-search-bar>';
    const out = applyClassRenamesToTemplate(template, map);
    expect(out).toContain(":customClass=\"['c608f7be5b8', 'ca65bd68eb0']\"");
    expect(out).not.toContain('search-bar-shell');
  });

  it('vk-uview 间距工具类可参与混淆，SCSS #{} 插值行仍跳过局部替换', () => {
    const style = [
      '.u-flex { display: flex; }',
      '.u-p-#{$short}-#{$i} { padding-left: 30rpx; }',
      '.u-p-l-30 { padding-left: 30rpx; }',
    ].join('\n');
    const names = extractStyleClassNames(style);
    expect(names.has('u-flex')).toBe(true);
    expect(names.has('u-p')).toBe(false);
    expect(names.has('u-p-l-30')).toBe(true);

    const map = buildClassRenameMap([...names], 'seed-uview', 'common.scss');
    expect(map.has('u-p-l-30')).toBe(true);
    expect(map.get('u-flex')).toMatch(/^c[a-f0-9]{10}$/);

    const out = applyClassRenamesToStyle(style, map);
    expect(out).toContain('.u-p-#{$short}-#{$i}');
    expect(out).not.toContain('.u-p-l-30');
    expect(out).toContain(`.${map.get('u-p-l-30')}`);
    expect(out).not.toContain('.u-flex');
  });

  it('applyClassRenamesToScript 同步选择器字符串', () => {
    const map = new Map([
      ['category-section', 'c1111111111'],
      ['category-sidebar', 'c2222222222'],
      ['category-item', 'c3333333333'],
    ]);
    const script = `
query.selectAll(".category-section").exec();
query.select(".category-sidebar .category-item").exec();
`;
    const out = applyClassRenamesToScript(script, map);
    expect(out).toContain('.c1111111111');
    expect(out).toContain('.c2222222222 .c3333333333');
    expect(out).not.toContain('category-section');
  });

  it('applyClassRenamesToScript 同步 :class 绑定的裸类名字符串', () => {
    const map = new Map([['ux-page-loading-points-animation', 'c6242445065']]);
    const script = 'this.animatinClass0 = "ux-page-loading-points-animation";';
    const out = applyClassRenamesToScript(script, map);
    expect(out).toContain('"c6242445065"');
    expect(out).not.toContain('ux-page-loading-points-animation');
  });

  it('applyClassRenamesToScript 不重命名 style 对象的 CSS 属性名字面量', () => {
    const map = new Map([
      ['height', 'c61acb499f0'],
      ['width', 'c9999999999'],
      ['ux-page-loading-points-animation', 'c6242445065'],
    ]);
    const script = [
      'style["height"] = h.toString() + "px";',
      'style["width"] = "100%";',
      'style["opacity"] = "1";',
      'this.animatinClass0 = "ux-page-loading-points-animation";',
    ].join('\n');
    const out = applyClassRenamesToScript(script, map);
    expect(out).toContain('style["height"]');
    expect(out).toContain('style["width"]');
    expect(out).toContain('style["opacity"]');
    expect(out).not.toContain('c61acb499f0');
    expect(out).toContain('"c6242445065"');
  });

  it('extractStyleClassNames 收集选择器类名', () => {
    const names = extractStyleClassNames('.foo.bar { } .baz:hover { }');
    expect(names.has('foo')).toBe(true);
    expect(names.has('bar')).toBe(true);
    expect(names.has('baz')).toBe(true);
  });

  it('uxui.scss 场景：uni- 保留，ux- 仍混淆', () => {
    const style = `
/* #ifdef H5 */
uni-app.uni-app--showtabbar uni-page-body::after { height: 0; }
/* #endif */
.uni-picker-view-wrapper { width: 100%; }
.ux-checkbox-round .uni-checkbox-input { width: 36rpx; }
.ux-checkbox-round .uni-checkbox-input.uni-checkbox-input-checked { color: #fff; }
.uni-input-placeholder { overflow: hidden; }
.ux-flex { display: flex; }
`;
    const renamable = extractStyleClassNames(style);
    expect(renamable.has('uni-app--showtabbar')).toBe(false);
    expect(renamable.has('uni-picker-view-wrapper')).toBe(false);
    expect(renamable.has('uni-checkbox-input')).toBe(false);
    expect(renamable.has('uni-checkbox-input-checked')).toBe(false);
    expect(renamable.has('uni-input-placeholder')).toBe(false);
    expect(renamable.has('ux-checkbox-round')).toBe(true);
    expect(renamable.has('ux-flex')).toBe(true);

    const map = buildClassRenameMap([...renamable], 'seed-uxui', 'uxui.scss');
    expect(map.size).toBe(2);
    expect(map.has('ux-checkbox-round')).toBe(true);
    expect(map.has('ux-flex')).toBe(true);

    const out = applyClassRenamesToStyle(style, map);
    expect(out).toContain('uni-app.uni-app--showtabbar');
    expect(out).toContain('.uni-picker-view-wrapper');
    expect(out).toContain('.uni-checkbox-input');
    expect(out).toContain('.uni-checkbox-input-checked');
    expect(out).toContain('.uni-input-placeholder');
    expect(out).not.toContain('.ux-checkbox-round');
    expect(out).not.toContain('.ux-flex');
  });
});
