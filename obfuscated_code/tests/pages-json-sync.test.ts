import { describe, expect, it } from 'vitest';
import { syncPagesJsonContent } from '../src/path/pages-json-sync.js';

describe('syncPagesJsonContent', () => {
  const renameLog = [
    { from: 'pages/notice', to: 'pages/TOKENnotice' },
    { from: 'pages/notice/logistics', to: 'pages/TOKENnotice/TOKENlogistics' },
    { from: 'pages/notice/logistics/logistics', to: 'pages/TOKENnotice/TOKENlogistics/TOKENlogistics' },
    { from: 'pages/user/evaluate', to: 'pages/TOKENuser/TOKENevaluate' },
    { from: 'pages/user/evaluate/evaluate', to: 'pages/TOKENuser/TOKENevaluate/TOKENevaluate' },
  ];

  it('同步 subPackage root', () => {
    const input = '"root": "pages/notice"';
    const output = syncPagesJsonContent(input, renameLog);
    expect(output).toContain('"root": "pages/TOKENnotice"');
  });

  it('同步 subPackage 相对路径首段', () => {
    const input = '"root": "pages/notice"\n"path": "logistics/logistics"';
    const output = syncPagesJsonContent(input, renameLog);
    expect(output).toContain('"path": "TOKENlogistics/TOKENlogistics"');
  });

  it('同步 user 分包 evaluate 路径', () => {
    const input = '"root": "pages/user"\n"path": "evaluate/evaluate"';
    const output = syncPagesJsonContent(input, renameLog);
    expect(output).toContain('"path": "TOKENevaluate/TOKENevaluate"');
  });

  it('同步顶层 pages 路径', () => {
    const input = '"path": "pages/notice/chat"';
    const output = syncPagesJsonContent(input, renameLog);
    expect(output).toContain('"path": "pages/TOKENnotice/chat"');
  });

  it('同步普通文件重命名后的 pages 路径', () => {
    const input = '"path": "pages/tabBar/tab-bar"';
    const output = syncPagesJsonContent(input, [
      { from: 'pages/tabBar', to: 'pages/TOKENtabBar' },
      { from: 'pages/tabBar/tab-bar', to: 'pages/TOKENtabBar/TOKENtab-bar' },
    ]);
    expect(output).toContain('"path": "pages/TOKENtabBar/TOKENtab-bar"');
  });

  it('同步 issue 类普通文件 pages 路径', () => {
    const input = '"path": "pages/component/view/issue-19746"';
    const output = syncPagesJsonContent(input, [
      { from: 'pages/component', to: 'pages/TOKENcomponent' },
      { from: 'pages/component/view', to: 'pages/TOKENcomponent/TOKENview' },
      { from: 'pages/component/view/issue-19746', to: 'pages/TOKENcomponent/TOKENview/TOKENissue-19746' },
    ]);
    expect(output).toContain('"path": "pages/TOKENcomponent/TOKENview/TOKENissue-19746"');
  });

  it('同步 subPackage 单段相对路径（dir/dir.ext）', () => {
    const input = [
      '"root": "pages/API/create-inner-audio-context"',
      '"path": "create-inner-audio-context"',
    ].join('\n');
    const output = syncPagesJsonContent(input, [
      { from: 'pages/API', to: 'pages/TOKENAPI' },
      { from: 'pages/API/create-inner-audio-context', to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context' },
      {
        from: 'pages/API/create-inner-audio-context/create-inner-audio-context',
        to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context/TOKENcreate-inner-audio-context',
      },
    ]);
    expect(output).toContain('"root": "pages/TOKENAPI/TOKENcreate-inner-audio-context"');
    expect(output).toContain('"path": "TOKENcreate-inner-audio-context"');
  });

  it('同步 subPackage 单段普通文件路径', () => {
    const input = [
      '"root": "pages/API/create-inner-audio-context"',
      '"path": "inner-audio-format"',
    ].join('\n');
    const output = syncPagesJsonContent(input, [
      { from: 'pages/API/create-inner-audio-context', to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context' },
      {
        from: 'pages/API/create-inner-audio-context/inner-audio-format',
        to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context/TOKENinner-audio-format',
      },
    ]);
    expect(output).toContain('"path": "TOKENinner-audio-format"');
  });

  it('root 已被 applyReplacements 提前改写时仍能同步分包 path', () => {
    const renameLog = [
      { from: 'pages/API', to: 'pages/TOKENAPI' },
      { from: 'pages/API/create-inner-audio-context', to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context' },
      {
        from: 'pages/API/create-inner-audio-context/create-inner-audio-context',
        to: 'pages/TOKENAPI/TOKENcreate-inner-audio-context/TOKENcreate-inner-audio-context',
      },
    ];
    const input = [
      '"root": "pages/TOKENAPI/TOKENcreate-inner-audio-context"',
      '"path": "create-inner-audio-context"',
    ].join('\n');
    const output = syncPagesJsonContent(input, renameLog);
    expect(output).toContain('"path": "TOKENcreate-inner-audio-context"');
  });

  it('单段相对路径无映射时保持原名', () => {
    const input = '"root": "pages/article"\n"path": "details"';
    const output = syncPagesJsonContent(input, [
      { from: 'pages/article', to: 'pages/TOKENarticle' },
    ]);
    expect(output).toContain('"path": "details"');
  });
});
