import { describe, expect, it } from 'vitest';
import { parseNpmModeEvent } from '../scripts/npm-mode-run.mjs';

describe('parseNpmModeEvent', () => {
  it('解析 preload / run 及带 mode 后缀', () => {
    expect(parseNpmModeEvent('preload')).toEqual({ cmd: 'preload', mode: null });
    expect(parseNpmModeEvent('preload:code')).toEqual({ cmd: 'preload', mode: 'code' });
    expect(parseNpmModeEvent('run')).toEqual({ cmd: 'run', mode: null });
    expect(parseNpmModeEvent('run:full')).toEqual({ cmd: 'run', mode: 'full' });
  });

  it('未知事件返回 null', () => {
    expect(parseNpmModeEvent('test')).toBeNull();
    expect(parseNpmModeEvent('build')).toBeNull();
  });

  it('非法 mode 抛出错误', () => {
    expect(() => parseNpmModeEvent('run:bad')).toThrow(/未知 mode/);
  });
});
