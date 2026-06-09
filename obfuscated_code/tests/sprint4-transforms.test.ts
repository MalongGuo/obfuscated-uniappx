import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/parser/babel.js';
import { buildFileRenameMap, formatFileObfuscateDetail } from '../src/transforms/rename-map.js';
import { runScriptTransformPipeline } from '../src/transforms/script-pipeline.js';
import { stripJsComments } from '../src/transforms/strip-comments.js';
import { renameTemplate } from '../src/transforms/rename-template.js';
import { seededShuffle } from '../src/transforms/seeded-random.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import type { SymbolTable } from '../src/symbols/types.js';

describe('strip-comments safeMode', () => {
  it('保留字符串内的 //', () => {
    const input = 'const url = "item://foo"; // real comment';
    const out = stripJsComments(input, true);
    expect(out).toContain('item://foo');
    expect(out).not.toMatch(/\/\/ real comment/);
  });

  it('保留正则字面量中的 //', () => {
    const input = 'if (/^cloud:\\/\\//.test(url)) { return; } // tail';
    const out = stripJsComments(input, true);
    expect(out).toContain('/^cloud:\\/\\//.test(url)');
    expect(out).not.toMatch(/\/\/ tail/);
  });

  it('保留 uni-app 条件编译行注释', () => {
    const input = [
      '// #ifdef UNI-APP-X',
      "import { openSchema } from '@/uni_modules/uts-openSchema'",
      '// #endif',
      'const x = 1; // drop me',
    ].join('\n');
    const out = stripJsComments(input, true);
    expect(out).toContain('// #ifdef UNI-APP-X');
    expect(out).toContain('// #endif');
    expect(out).not.toContain('// drop me');
  });

  it('保留 uni-app 条件编译块注释', () => {
    const input = '/* #ifndef APP-NVUE */ code(); /* #endif */ /* remove */';
    const out = stripJsComments(input, true);
    expect(out).toContain('/* #ifndef APP-NVUE */');
    expect(out).toContain('/* #endif */');
    expect(out).not.toContain('remove');
  });
});

describe('renameTemplate', () => {
  it('不破坏 refresher-background 等连字符属性名', () => {
    const map = new Map([['background', 'RenamedBg']]);
    const input = '<scroll-view refresher-background="#fff" :refresher-enabled="true"></scroll-view>';
    const out = renameTemplate(input, map);
    expect(out).toContain('refresher-background="#fff"');
    expect(out).not.toContain('refresher-RenamedBg');
  });

  it('不替换引号内的词', () => {
    const map = new Map([['active', 'RenamedActive']]);
    const input = '<text :class="[flag ? \'active\' : \'\']">{{ activeLabel }}</text>';
    const out = renameTemplate(input, map);
    expect(out).toContain("'active'");
    expect(out).toContain('activeLabel');
  });

  it('重命名 Vue 绑定表达式与 mustache 内的组件成员', () => {
    const map = new Map([
      ['featuredTabs', 'NksQnta'],
      ['onStatusBarReady', 'AtcJusViU'],
      ['statusBarBg', 'RgojyljD'],
      ['background', 'TAETPjGL'],
      ['isSticky', 'APthqUc'],
      ['height', 'CETLpNnY'],
      ['serviceEntries', 'YENgyCUP'],
      ['item in serviceEntries', 'SHOULD_NOT_APPLY'],
    ]);
    const input = [
      '<ux-status-bar @ready="onStatusBarReady" :background="statusBarBg"></ux-status-bar>',
      '<view v-if="featuredTabs.length > 1 && isSticky"></view>',
      '<view v-for="item in serviceEntries" :key="item.id"></view>',
      '<view :style="{height:height+\'px\', background:background}"></view>',
      '<text>{{ locationTitle }}</text>',
    ].join('\n');
    const out = renameTemplate(input, map);
    expect(out).toContain('@ready="AtcJusViU"');
    expect(out).toContain(':background="RgojyljD"');
    expect(out).toContain('v-if="NksQnta.length > 1 && APthqUc"');
    expect(out).toContain('v-for="item in YENgyCUP"');
    expect(out).toContain('{height:CETLpNnY+\'px\', background:TAETPjGL}');
    expect(out).not.toContain('featuredTabs');
    expect(out).not.toContain('onStatusBarReady');
    expect(out).not.toContain('statusBarBg');
    expect(out).not.toContain('SHOULD_NOT_APPLY');
    expect(out).not.toMatch(/:TAETPjGL=/);
  });

  it(':class object key 不在符号重命名阶段改写', () => {
    const map = new Map([['active', 'RenamedActive'], ['activeId', 'RenamedId']]);
    const input = '<view :class="{ active: item.id == activeId }"></view>';
    const out = renameTemplate(input, map);
    expect(out).toContain('{ active: item.id == RenamedId }');
    expect(out).not.toContain('RenamedActive:');
  });

  it('保留可选链 ?. 语法', () => {
    const map = new Map([['errorInfo', 'ErrRenamed']]);
    const input = '<view v-if="errorInfo?.[\'message\'] != null"></view>';
    const out = renameTemplate(input, map);
    expect(out).toContain('ErrRenamed?.[\'message\']');
    expect(out).not.toContain('ErrRenamed.[\'message\']');
  });

  it('不替换 v-for 中的 in 关键字', () => {
    const map = new Map([
      ['in', 'BAD'],
      ['serviceEntries', 'SvcList'],
    ]);
    const input = '<view v-for="item in serviceEntries"></view>';
    const out = renameTemplate(input, map);
    expect(out).toBe('<view v-for="item in SvcList"></view>');
  });

  it('v-bind:style 保留 CSS object key，仅重命名 value', () => {
    const map = new Map([
      ['height', 'RenamedHeight'],
      ['background', 'RenamedBg'],
    ]);
    const input = '<view v-bind:style="{height:height+\'px\', background:background}"></view>';
    const out = renameTemplate(input, map);
    expect(out).toContain('v-bind:style="{height:RenamedHeight+\'px\', background:RenamedBg}"');
    expect(out).not.toContain('RenamedHeight:');
  });

  it('renameMap 含 style 时仍保留 :style / style 属性名', () => {
    const map = new Map([
      ['style', 'RenamedStyleVar'],
      ['heightWrapStyle', 'RenamedWrap'],
      ['headerBgStyle', 'RenamedBg'],
      ['navInnerStyle', 'RenamedNav'],
      ['headerRowStyle', 'RenamedRow'],
      ['isMp', 'RenamedMp'],
    ]);
    const input = [
      '<view :style="heightWrapStyle" style="opacity: 0"></view>',
      '<view :style="headerBgStyle"></view>',
      '<view :style="navInnerStyle" :class="isMp ? \'\' : \'ux-flex ux-justify-content-center\'"></view>',
      '<view :style="headerRowStyle" style="height: 32px"></view>',
      '<ux-status-bar :background="statusBarBg"></ux-status-bar>',
    ].join('\n');
    const out = renameTemplate(input, map);
    expect(out).toContain(':style="RenamedWrap"');
    expect(out).toContain('style="opacity: 0"');
    expect(out).toContain(':style="RenamedBg"');
    expect(out).toContain(':style="RenamedNav"');
    expect(out).toContain(':style="RenamedRow"');
    expect(out).toContain('style="height: 32px"');
    expect(out).not.toMatch(/:RenamedStyleVar=/);
    expect(out).not.toMatch(/\sRenamedStyleVar="/);
    expect(out).toContain("'ux-flex ux-justify-content-center'");
  });

  it('@tap.stop 等修饰符绑定会重命名 handler', () => {
    const map = new Map([
      ['openUserAgreement', 'RenamedOpenUa'],
      ['openPrivacy', 'RenamedOpenPrivacy'],
    ]);
    const input =
      '<text @tap.stop="openUserAgreement">协议</text><text @tap.stop="openPrivacy">隐私</text>';
    const out = renameTemplate(input, map);
    expect(out).toContain('@tap.stop="RenamedOpenUa"');
    expect(out).toContain('@tap.stop="RenamedOpenPrivacy"');
    expect(out).not.toContain('openUserAgreement');
    expect(out).not.toContain('openPrivacy');
  });

  it('不重命名全局内置对象 Math', () => {
    const map = new Map([['Math', 'RenamedMath']]);
    const input = '<view :class="{ \'no-top\': Math.floor(serviceIndex / 3) == 0 }"></view>';
    const out = renameTemplate(input, map);
    expect(out).toContain('Math.floor(serviceIndex / 3)');
    expect(out).not.toContain('RenamedMath');
  });

  it('不重命名成员访问属性（toString / id 等）', () => {
    const map = new Map([
      ['toString', 'RenamedToString'],
      ['id', 'RenamedId'],
      ['activeId', 'RenamedActiveId'],
    ]);
    const input = [
      '<view :class="{ active: item.id == activeId }"></view>',
      '<view :key="item.id.toString()"></view>',
    ].join('\n');
    const out = renameTemplate(input, map);
    expect(out).toContain('item.id == RenamedActiveId');
    expect(out).toContain('item.id.toString()');
    expect(out).not.toContain('RenamedToString');
    expect(out).not.toContain('item.RenamedId');
  });
});

describe('seededShuffle', () => {
  it('相同 seed 产生相同顺序', () => {
    const items = [1, 2, 3, 4, 5];
    const a = seededShuffle(items, 'test-seed', 'salt');
    const b = seededShuffle(items, 'test-seed', 'salt');
    expect(a).toEqual(b);
    expect(a).not.toEqual(items);
  });
});

describe('formatFileObfuscateDetail', () => {
  it('默认展示原名与新名', () => {
    const detail = formatFileObfuscateDetail('pages/a.uvue', {
      renames: [
        { from: 'goPage', to: 'KlMnOp' },
        { from: 'menu', to: 'QrStUv' },
      ],
      changed: true,
      commentsStripped: false,
      identifierRenamed: true,
    });
    expect(detail).toContain('goPage → KlMnOp');
    expect(detail).toContain('(+1)');
    expect(detail).not.toContain('menu → QrStUv');
  });

  it('有标识符映射时不附加 AST变换 标签', () => {
    const detail = formatFileObfuscateDetail('pages/a.uvue', {
      renames: [{ from: 'goPage', to: 'KlMnOp' }],
      changed: true,
      commentsStripped: false,
      identifierRenamed: true,
      astTransformed: true,
    });
    expect(detail).toContain('goPage → KlMnOp');
    expect(detail).not.toContain('AST变换');
  });

  it('includeRenames: false 时不展示映射', () => {
    const detail = formatFileObfuscateDetail(
      'pages/a.uvue',
      {
        renames: [{ from: 'goPage', to: 'KlMnOp' }],
        changed: true,
        commentsStripped: false,
        identifierRenamed: true,
      },
      { includeRenames: false },
    );
    expect(detail).not.toContain('goPage');
    expect(detail).toContain('已变换');
  });

  it('无重命名时标注无变更', () => {
    const detail = formatFileObfuscateDetail('wxcomponents/vant/info/index.d.ts', {
      renames: [],
      changed: false,
      commentsStripped: false,
      identifierRenamed: false,
    });
    expect(detail).toContain('无变更');
  });
});

describe('buildFileRenameMap import', () => {
  it('包含可重命名的 import 绑定', () => {
    const table: SymbolTable = {
      symbols: new Map([
        ['pages/a.uvue::helper', {
          name: 'helper',
          file: 'pages/a.uvue',
          kind: 'import',
          occurrences: [{ file: 'pages/a.uvue', kind: 'import' }],
          exported: false,
          renameable: true,
          obfuscatedName: 'xHelper',
        }],
      ]),
      byFile: new Map([['pages/a.uvue', ['helper']]]),
      parseErrors: [],
    };
    const map = buildFileRenameMap(table, 'pages/a.uvue');
    expect(map.get('helper')).toBe('xHelper');
  });
});

describe('runScriptTransformPipeline', () => {
  it('启用 shuffle 与 junk 后改写 AST', () => {
    const code = `
function alpha() { return 1; }
function beta() { return 2; }
class Demo {
  run() { return 3; }
}
`;
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    expect(parsed.ast).toBeTruthy();

    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.shuffleFuncOrder = true;
    config.features.insertJunkFuncProp = true;
    config.seed = 'pipeline-test';

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toContain('_j');
    expect(out).not.toBe(code.trim());
  });

  it('SFC export default 的 junk 注入在组件对象内，不在模块顶层', () => {
    const code = `
export default {
  name: "demo",
  methods: {
    onTap() { return 1; }
  }
};
`;
    const parsed = parseScript(code, 'typescript', 'components/demo.uvue');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.insertJunkFuncProp = true;
    config.seed = 'sfc-junk-test';

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toMatch(/_j[a-f0-9]{8}\s*\(\s*\)/);
    expect(out).not.toMatch(/\};\s*function _j/);
    expect(out).not.toMatch(/\};\s*_j[a-f0-9]{8}\s*\(\s*\)/);
  });

  it('uni_modules/uts-* 路径跳过 junk 注入', () => {
    const code = 'export type OpenSchema = (url: string) => void;';
    const parsed = parseScript(
      code,
      'typescript',
      'uni_modules/uts-openSchema/utssdk/interface.uts',
    );
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.insertJunkFuncProp = true;
    config.seed = 'uts-junk-skip';

    const out = runScriptTransformPipeline(
      parsed.ast!,
      new Map(),
      config,
      code,
      undefined,
      'uni_modules/uts-openSchema/utssdk/interface.uts',
    );
    expect(out).toBe(code);
    expect(out).not.toContain('_j');
  });

  it('uni_modules/xsd-request 路径跳过 junk 注入', () => {
    const code = 'export type XRequest = (url: string) => void;';
    const parsed = parseScript(
      code,
      'typescript',
      'uni_modules/xsd-request/utssdk/interface.uts',
    );
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.insertJunkFuncProp = true;
    config.seed = 'xsd-junk-skip';

    const out = runScriptTransformPipeline(
      parsed.ast!,
      new Map(),
      config,
      code,
      undefined,
      'uni_modules/xsd-request/utssdk/interface.uts',
    );
    expect(out).toBe(code);
    expect(out).not.toContain('_j');
  });

  it('字符串加密替换字面量', () => {
    const code = 'const s = "hello";';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.encryptAllStrings = true;

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toContain('fromCharCode');
    expect(out).not.toContain('"hello"');
  });

  it('字符串加密跳过 import 模块路径', () => {
    const code = 'import { foo } from "./utils";\nconst s = "hello";';
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.encryptAllStrings = true;

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toContain('from "./utils"');
    expect(out).toContain('fromCharCode');
  });

  it('字符串加密跳过 TS 字面量类型', () => {
    const code = "type Mode = 'dark';\nconst s = 'hello';";
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.encryptAllStrings = true;

    const out = runScriptTransformPipeline(parsed.ast!, new Map(), config, code);
    expect(out).toContain("'dark'");
    expect(out).toContain('fromCharCode');
  });

  it('条件编译重复 const 不导致加密 traverse 崩溃', () => {
    const code = `
const isWeb = true;
const isWeb = false;
const msg = "hello";
`;
    const parsed = parseScript(code, 'typescript', 'demo.uvue');
    const config = createDefaultConfig();
    for (const key of Object.keys(config.features) as Array<keyof typeof config.features>) {
      config.features[key] = false;
    }
    config.features.encryptAllStrings = true;

    expect(() => runScriptTransformPipeline(parsed.ast!, new Map(), config, code)).not.toThrow();
  });
});
