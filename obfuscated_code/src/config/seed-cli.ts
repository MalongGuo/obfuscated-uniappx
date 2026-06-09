/** CLI --seed 归一化：空串 / null / none 表示清除 seed */
export function normalizeCliSeed(seed: string): string | null {
  const trimmed = seed.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'none') {
    return null;
  }
  return trimmed;
}

export function applyCliSeedOverride(
  configSeed: string | null,
  options: { seed?: string | boolean; noSeed?: boolean },
): string | null {
  if (options.noSeed) return null;
  if (options.seed !== undefined) {
    // commander 与 --seed [seed] 同用时，--no-seed 会写入 seed: false
    if (options.seed === false || options.seed === true || options.seed === '') return null;
    if (typeof options.seed === 'string') return normalizeCliSeed(options.seed);
  }
  return configSeed;
}
