import { createHash } from 'node:crypto';

const JUNK_MARK = 'data-obf-junk';

function junkToken(seed: string | null, index: number, salt: string): string {
  return createHash('sha256').update(`${seed ?? 'tpl-junk'}:${salt}:${index}`).digest('hex').slice(0, 10);
}

function junkCount(seed: string | null): number {
  if (!seed) return 3;
  const n = parseInt(createHash('md5').update(seed).digest('hex').slice(0, 2), 16);
  return 3 + (n % 3);
}

function buildJunkNode(token: string, variant: number): string {
  switch (variant % 4) {
    case 0:
      return `<view ${JUNK_MARK}="${token}" style="display:none; height:0; width:0; overflow:hidden"><text></text></view>`;
    case 1:
      return `<view ${JUNK_MARK}="${token}" class="c${token}" style="position:absolute;left:-9999px;top:-9999px;opacity:0"></view>`;
    case 2:
      return `<!-- ${JUNK_MARK}:${token} -->`;
    default:
      return `<view ${JUNK_MARK}="${token}"><view style="height:0;width:0"></view></view>`;
  }
}

/** 定位首个 opening tag 的结束位置（跳过引号内的 >，避免截断 :style 中的比较表达式） */
function findOpeningTagEnd(template: string): number {
  const tagMatch = template.match(/^<[\w-]+/);
  if (!tagMatch) return -1;

  let i = tagMatch[0].length;
  let inSingle = false;
  let inDouble = false;

  while (i < template.length) {
    const ch = template[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (ch === '>') return i + 1;
    i++;
  }
  return -1;
}

/** 在 template 根级插入多条隐藏 junk 节点（useNewJunkCode） */
export function insertTemplateJunk(template: string, seed: string | null = null, fileSalt = 'tpl'): string {
  const trimmed = template.trim();
  if (!trimmed || trimmed.includes(JUNK_MARK)) return template;

  const count = junkCount(seed);
  const nodes: string[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(buildJunkNode(junkToken(seed, i, fileSalt), i));
  }

  const block = nodes.join('\n');

  if (/^<[\w-]+[\s>]/.test(trimmed)) {
    const tagMatch = trimmed.match(/^<([\w-]+)/);
    if (tagMatch) {
      const tag = tagMatch[1]!;
      const openEnd = findOpeningTagEnd(trimmed);
      // 仅当首个标签包裹整个 template（闭合标签在末尾）时才向内插入 junk
      const wrapsWholeTemplate = openEnd > 0 && new RegExp(`</${tag}>\\s*$`).test(trimmed);
      if (wrapsWholeTemplate) {
        const openTag = trimmed.slice(0, openEnd);
        const inner = trimmed.slice(openEnd).replace(new RegExp(`</${tag}>\\s*$`), '');
        return `${openTag}\n${block}\n${inner}\n</${tag}>`;
      }
    }
  }

  return `${block}\n${trimmed}`;
}
