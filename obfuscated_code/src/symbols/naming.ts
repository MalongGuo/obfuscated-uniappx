import { createHash, randomBytes } from 'node:crypto';

const HEX_CHARSET = '0123456789abcdef';
const HUMAN_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export type NamingStyle = 'human' | 'hex';

export function createNameGenerator(
  style: NamingStyle,
  seed?: string | null,
  prefix = '',
): () => string {
  let counter = 0;
  const rng = seed ? seededRng(seed) : () => randomBytes(4).readUInt32BE(0) / 0xffffffff;

  return () => {
    counter += 1;
    if (style === 'hex') {
      const n = Math.floor(rng() * 0xffff);
      return `${prefix}_0x${n.toString(16).padStart(4, '0')}`;
    }
    const len = 6 + Math.floor(rng() * 4);
    let name = prefix;
    for (let i = 0; i < len; i++) {
      name += HUMAN_CHARSET[Math.floor(rng() * HUMAN_CHARSET.length)]!;
    }
    return name || `${prefix}n${counter}`;
  };
}

function seededRng(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest();
  let offset = 0;
  return () => {
    if (offset + 4 > state.length) {
      state = createHash('sha256').update(state).digest();
      offset = 0;
    }
    const value = state.readUInt32BE(offset);
    offset += 4;
    return value / 0xffffffff;
  };
}

export function isValidObfuscatedName(name: string, style: NamingStyle): boolean {
  if (!name || !/^[a-zA-Z_$][\w$]*$/.test(name)) return false;
  if (style === 'hex') return /^_0x[0-9a-f]+$/.test(name);
  return name.length >= 4;
}
