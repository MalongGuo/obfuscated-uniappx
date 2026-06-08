const CONDITIONAL_COMPILE_RE = /^\s*#\s*(ifdef|ifndef|endif)\b/;

function isConditionalCompileComment(inner: string): boolean {
  return CONDITIONAL_COMPILE_RE.test(inner);
}

function isLikelyRegexStart(code: string, index: number): boolean {
  let j = index - 1;
  while (j >= 0 && /[\t\n\f\r ]/.test(code[j]!)) j--;
  if (j < 0) return true;
  const prev = code[j]!;
  if (/[(\[{=:;,!&|?+\-*%~^<>]/.test(prev)) return true;
  const before = code.slice(Math.max(0, j - 11), j + 1);
  return /\b(return|case|throw|typeof|void|delete|in|of|instanceof|yield|await)\s*$/.test(before);
}

function readRegexLiteral(code: string, start: number): string {
  let i = start + 1;
  let inClass = false;
  const len = code.length;
  while (i < len) {
    const c = code[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[' && !inClass) inClass = true;
    else if (c === ']' && inClass) inClass = false;
    else if (c === '/' && !inClass) {
      i++;
      while (i < len && /[a-z]/i.test(code[i]!)) i++;
      break;
    }
    i++;
  }
  return code.slice(start, i);
}

/** 安全模式下跳过字符串/正则/条件编译指令内的注释样式文本 */
function stripJsCommentsSafe(code: string): string {
  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i]!;

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      result += ch;
      i++;
      while (i < len) {
        const c = code[i]!;
        result += c;
        if (c === '\\' && i + 1 < len) {
          result += code[i + 1];
          i += 2;
          continue;
        }
        if (quote === '`' && c === '$' && code[i + 1] === '{') {
          i++;
          result += '{';
          i++;
          let depth = 1;
          while (i < len && depth > 0) {
            const inner = code[i]!;
            result += inner;
            if (inner === '{') depth++;
            else if (inner === '}') depth--;
            i++;
          }
          continue;
        }
        i++;
        if (c === quote) break;
      }
      continue;
    }

    if (ch === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && isLikelyRegexStart(code, i)) {
      const literal = readRegexLiteral(code, i);
      result += literal;
      i += literal.length;
      continue;
    }

    if (ch === '/' && code[i + 1] === '*') {
      const blockStart = i;
      i += 2;
      const innerStart = i;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
      const inner = code.slice(innerStart, i);
      i += 2;
      if (isConditionalCompileComment(inner)) {
        result += code.slice(blockStart, i);
      }
      continue;
    }

    if (ch === '/' && code[i + 1] === '/') {
      const lineStart = i;
      i += 2;
      const contentStart = i;
      while (i < len && code[i] !== '\n') i++;
      const lineContent = code.slice(contentStart, i);
      if (isConditionalCompileComment(lineContent)) {
        result += code.slice(lineStart, i);
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

export function stripJsComments(code: string, safeMode = false): string {
  if (safeMode) return stripJsCommentsSafe(code);
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function stripVueComments(content: string, safeMode = false): string {
  let result = content.replace(/<!--[\s\S]*?-->/g, '');
  result = result.replace(
    /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_m, open, script, close) => `${open}${stripJsComments(script, safeMode)}${close}`,
  );
  return result;
}
