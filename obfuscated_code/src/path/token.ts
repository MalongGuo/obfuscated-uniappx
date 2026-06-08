import { createHash, randomBytes } from 'node:crypto';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateToken(seed?: string | null, length = 16): string {
  if (seed) {
    const hash = createHash('sha256').update(seed).digest('hex');
    let token = '';
    for (let i = 0; i < length; i++) {
      token += CHARSET[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % CHARSET.length];
    }
    return token;
  }
  const bytes = randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += CHARSET[bytes[i]! % CHARSET.length];
  }
  return token;
}

export function obfuscateDirName(dirName: string, token: string): string {
  const underscoreIndex = dirName.indexOf('_');
  if (underscoreIndex > 0) {
    return `${token}${dirName.slice(underscoreIndex)}`;
  }
  return `${token}${dirName}`;
}
