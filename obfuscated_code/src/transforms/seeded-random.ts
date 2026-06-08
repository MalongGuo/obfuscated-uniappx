import { createHash } from 'node:crypto';

export function seededShuffle<T>(items: readonly T[], seed: string | null, salt = ''): T[] {
  const arr = [...items];
  if (arr.length <= 1) return arr;

  let state = createHash('sha256').update(`${seed ?? 'default'}:${salt}`).digest();
  let offset = 0;
  const rnd = (): number => {
    if (offset + 4 > state.length) {
      state = createHash('sha256').update(state).digest();
      offset = 0;
    }
    const value = state.readUInt32BE(offset);
    offset += 4;
    return value / 0xffffffff;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
