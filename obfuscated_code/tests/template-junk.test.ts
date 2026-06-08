import { parse as parseSfc } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import { insertTemplateJunk } from '../src/transforms/template-junk.js';
import { transformVueFileContent } from '../src/transforms/vue-file.js';
import { createDefaultConfig } from '../src/config/defaults.js';

describe('template-junk', () => {
  it('插入 3–5 个 data-obf-junk 节点', () => {
    const tpl = '<view class="root"><text>ok</text></view>';
    const out = insertTemplateJunk(tpl, 'junk-seed', 'pages/a.uvue');
    const matches = out.match(/data-obf-junk/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  it('相同 seed 与 salt 结果稳定', () => {
    const tpl = '<view><text>ok</text></view>';
    const a = insertTemplateJunk(tpl, 'stable', 'file.uvue');
    const b = insertTemplateJunk(tpl, 'stable', 'file.uvue');
    expect(a).toBe(b);
  });

  it('已含 junk 时不重复插入', () => {
    const tpl = '<view data-obf-junk="x"><text>ok</text></view>';
    expect(insertTemplateJunk(tpl, 'seed', 'f')).toBe(tpl);
  });

  it('transformVueFileContent 在 useNewJunkCode 时插入 junk', () => {
    const sfc = `<template>
<view><text>hi</text></view>
</template>
<script setup lang="uts"></script>`;
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.useNewJunkCode = true;
    config.seed = 'vue-junk';

    const out = transformVueFileContent(sfc, 'pages/a.uvue', '.uvue', new Map(), config);
    expect(out.match(/data-obf-junk/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('嵌套 template slot 时 SFC 结构完整', () => {
    const sfc = `<template>
  <view class="page">
    <ux-nav @left-tap="onBack">
      <template #left></template>
      <text class="nav-title">我的评价</text>
      <template #right></template>
    </ux-nav>
    <scroll-view scroll-y="true">
      <text>content</text>
    </scroll-view>
  </view>
</template>
<script lang="uts">
export default { methods: { onBack() {} } };
</script>`;
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.useNewJunkCode = true;
    config.seed = 'nested-slot';

    const out = transformVueFileContent(sfc, 'pages/u/me/comment/comment.uvue', '.uvue', new Map(), config);
    const { errors, descriptor } = parseSfc(out, { filename: 'comment.uvue' });

    expect(errors.length).toBe(0);
    expect((out.match(/我的评价/g) ?? []).length).toBe(1);
    expect(descriptor.template?.content).toContain('<template #left>');
    expect(descriptor.template?.content).toContain('</ux-nav>');
    expect(out).toMatch(/<\/template>\s*\n\s*<script/);
  });

  it('多根节点 template（如 textarea + input）不破坏标签结构', () => {
    const sfc = `<template>
  <textarea v-model="content" class="textarea"></textarea>
  <uni-id-pages-x-input v-model="contact"></uni-id-pages-x-input>
  <button @click="submit">提交</button>
</template>
<script>
export default { methods: { submit() {} } };
</script>`;
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.useNewJunkCode = true;
    config.seed = 'multi-root';

    const out = transformVueFileContent(
      sfc,
      'pages/ucenter/opendb-feedback/opendb-feedback.uvue',
      '.uvue',
      new Map(),
      config,
    );
    const { errors } = parseSfc(out, { filename: 'opendb-feedback.uvue' });

    expect(errors.length).toBe(0);
    expect((out.match(/<\/textarea>/g) ?? []).length).toBe(1);
    expect(out).not.toMatch(/<\/textarea>[\s\S]*<uni-id-pages-x-input[\s\S]*<\/textarea>/);
  });

  it('多行 opening tag 且 :style 含 > 比较时不截断表达式', () => {
    const tpl = `<view
    class="ux-flex"
    :style="{ height: status > 0 ? '40px' : '0px' }"
  >
    <text>ok</text>
  </view>`;
    const out = insertTemplateJunk(tpl, 'style-gt', 'ux-refresh-box.uvue');

    expect(out).toContain(":style=\"{ height: status > 0 ? '40px' : '0px' }\"");
    expect(out).not.toMatch(/status >\s*\n\s*<view data-obf-junk/);
    expect(out.match(/data-obf-junk/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
