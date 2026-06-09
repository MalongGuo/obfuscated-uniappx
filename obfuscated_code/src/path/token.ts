import { createHash, randomBytes } from 'node:crypto';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 首字符必须为字母，避免 token 用于 Vue 组件/easycom 标签时以数字开头 */
const LETTER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function pickFromCharset(charset: string, byte: number): string {
  return charset[byte % charset.length]!;
}

export function generateToken(seed?: string | null, length = 16): string {
  if (seed) {
    const hash = createHash('sha256').update(seed).digest('hex');
    let token = pickFromCharset(
      LETTER_CHARSET,
      parseInt(hash.slice(0, 2), 16),
    );
    for (let i = 1; i < length; i++) {
      token += pickFromCharset(CHARSET, parseInt(hash.slice(i * 2, i * 2 + 2), 16));
    }
    return token;
  }
  const bytes = randomBytes(length);
  let token = pickFromCharset(LETTER_CHARSET, bytes[0]!);
  for (let i = 1; i < length; i++) {
    token += pickFromCharset(CHARSET, bytes[i]!);
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
