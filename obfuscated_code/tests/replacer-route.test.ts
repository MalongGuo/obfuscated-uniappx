import { describe, expect, it } from 'vitest';
import { applyReplacements, buildContentReplacements } from '../src/path/replacer.js';

describe('route path replacements', () => {
  it('updates page route without extension', () => {
    const reps = buildContentReplacements([
      { from: 'pages/u/home/home', to: 'pages/u/TOKENhome/TOKENhome' },
    ]);
    const input = '"pages/u/home/home"';
    expect(applyReplacements(input, reps)).toBe('"pages/u/TOKENhome/TOKENhome"');
  });

  it('does not replace root anchor dir imports like ./common/', () => {
    const reps = buildContentReplacements(
      [{ from: 'wxcomponents/vant/common', to: 'wxcomponents/vant/TOKENcommon' }],
      new Set(['common']),
    );
    const input = '@import "./common/uni.css";';
    expect(applyReplacements(input, reps)).toBe('@import "./common/uni.css";');
  });

  it('updates scoped multi-segment relative imports without pages prefix', () => {
    const reps = buildContentReplacements([
      {
        from: 'pages/template/long-list-perf/mock-data',
        to: 'pages/TOKENtemplate/TOKENlong-list-perf/TOKENmock-data',
      },
      {
        from: 'pages/template/custom-refresher/refresh-box/refresh-box.uvue',
        to: 'pages/TOKENtemplate/TOKENcustom-refresher/TOKENrefresh-box/TOKENrefresh-box.uvue',
      },
      {
        from: 'components/uni-collapse/item.type',
        to: 'components/TOKENuni-collapse/TOKENitem.type',
      },
    ]);
    expect(applyReplacements(
      "import x from '../template/long-list-perf/mock-data'",
      reps,
    )).toBe("import x from '../TOKENtemplate/TOKENlong-list-perf/TOKENmock-data'");
    expect(applyReplacements(
      "import y from '../../template/custom-refresher/refresh-box/refresh-box.uvue'",
      reps,
    )).toBe("import y from '../../TOKENtemplate/TOKENcustom-refresher/TOKENrefresh-box/TOKENrefresh-box.uvue'");
    expect(applyReplacements(
      'import { T } from "../uni-collapse/item.type"',
      reps,
    )).toBe('import { T } from "../TOKENuni-collapse/TOKENitem.type"');
  });

  it('updates same-directory relative imports', () => {
    const reps = buildContentReplacements([
      {
        from: 'pages/API/get-current-pages/component-check-page.uvue',
        to: 'pages/API/TOKENget-current-pages/TOKENcomponent-check-page.uvue',
      },
    ]);
    const input = "import ComponentCheckPage from './component-check-page.uvue'";
    expect(applyReplacements(input, reps)).toBe(
      "import ComponentCheckPage from './TOKENcomponent-check-page.uvue'",
    );
  });

  it('updates partially obfuscated page route', () => {
    const reps = buildContentReplacements([
      { from: 'pages/u/TOKENhome/home', to: 'pages/u/TOKENhome/TOKENhome' },
    ]);
    const input = '"pages/u/TOKENhome/home"';
    expect(applyReplacements(input, reps)).toBe('"pages/u/TOKENhome/TOKENhome"');
  });

  it('does not false-match ./basename inside ../../basename', () => {
    const reps = buildContentReplacements([
      {
        from: 'uni_modules/vk-uview-ui/libs/request',
        to: 'uni_modules/vk-uview-ui/libs/TOKENrequest',
      },
    ]);
    const input = 'import { xRequest } from "../../request"';
    expect(applyReplacements(input, reps)).toBe(input);
  });

  it('updates service request imports when service/request is renamed', () => {
    const reps = buildContentReplacements([
      { from: 'service/request', to: 'service/TOKENrequest' },
    ]);
    const input = 'import { xRequest } from "../../request"';
    expect(applyReplacements(input, reps)).toBe(
      'import { xRequest } from "../../TOKENrequest"',
    );
  });

  it('updates @/ alias imports when top-level dir is renamed', () => {
    const reps = buildContentReplacements([
      { from: 'service/uts/user', to: 'service/uts/TOKENuser' },
      { from: 'service', to: 'TOKENservice' },
    ]);
    const input =
      'import { treeCategory } from "@/service/uts/user/ai-category.uts"';
    expect(applyReplacements(input, reps)).toBe(
      'import { treeCategory } from "@/TOKENservice/uts/TOKENuser/ai-category.uts"',
    );
  });

  it('preserves index.uts suffix in @/ imports when parent dir is renamed', () => {
    const reps = buildContentReplacements(
      [{ from: 'store', to: 'TOKENstore' }],
      new Set(['index']),
    );
    const input = 'import { getTheme } from "@/store/index.uts"';
    expect(applyReplacements(input, reps)).toBe(
      'import { getTheme } from "@/TOKENstore/index.uts"',
    );
  });

  it('updates sibling ../basename imports when a directory is renamed', () => {
    const reps = buildContentReplacements([
      { from: 'service/uts/types', to: 'service/uts/TOKENtypes' },
    ]);
    const input =
      'import { ListBannerReq } from "../types"';
    expect(applyReplacements(input, reps)).toBe(
      'import { ListBannerReq } from "../TOKENtypes"',
    );
  });

  it('updates navigateTo url when route is followed by query string', () => {
    const reps = buildContentReplacements([
      {
        from: 'pages/u/category/service-list/service-list',
        to: 'pages/TOKENu/TOKENcategory/TOKENservice-list/TOKENservice-list',
      },
    ]);
    const input =
      'url: "/pages/u/category/service-list/service-list?categoryId=" + categoryId';
    expect(applyReplacements(input, reps)).toBe(
      'url: "/pages/TOKENu/TOKENcategory/TOKENservice-list/TOKENservice-list?categoryId=" + categoryId',
    );
  });
});
