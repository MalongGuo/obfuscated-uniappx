import type { CliOptions } from './config.js';

/** 子命令共用的 CLI 选项（mode 覆盖 obfuscator.config.json） */
export type CommandLoadOptions = Pick<CliOptions, 'config' | 'mode' | 'seed' | 'preset'>;

export function pickLoadOptions(opts: CommandLoadOptions): Partial<CliOptions> {
  const out: Partial<CliOptions> = {};
  if (opts.config) out.config = opts.config;
  if (opts.mode) out.mode = opts.mode;
  if (opts.seed) out.seed = opts.seed;
  if (opts.preset) out.preset = opts.preset;
  return out;
}
