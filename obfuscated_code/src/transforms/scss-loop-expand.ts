/**
 * SCSS @for / @each / @if 循环展开（混淆前转为显式 class 规则）
 * 支持数值 @for、字面量 @each、模运算 @if；跳过依赖 SCSS 变量列表的 @each（如 $theme-list）
 */

export interface FlatScssRule {
  selectors: string[];
  properties: string[];
}

export interface ScssLoopExpandResult {
  content: string;
  classNames: Set<string>;
  expanded: boolean;
}

type ScssVarValue = string | number;

function skipWhitespaceAndComments(content: string, pos: number): number {
  while (pos < content.length) {
    const ch = content[pos]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }
    if (content.startsWith('//', pos)) {
      const nl = content.indexOf('\n', pos);
      pos = nl === -1 ? content.length : nl + 1;
      continue;
    }
    if (content.startsWith('/*', pos)) {
      const end = content.indexOf('*/', pos + 2);
      pos = end === -1 ? content.length : end + 2;
      continue;
    }
    break;
  }
  return pos;
}

function findMatchingBrace(content: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function cloneVars(vars: Map<string, ScssVarValue>): Map<string, ScssVarValue> {
  return new Map(vars);
}

function interpolateText(text: string, vars: Map<string, ScssVarValue>): string {
  let result = text.replace(/#\{\$(\w+)\}/g, (_m, name: string) => String(vars.get(name) ?? ''));
  result = result.replace(/\$(\w+)\s*\+\s*(px|rpx)(!important)?/g, (_m, name: string, unit: string, imp?: string) => {
    return `${vars.get(name) ?? ''}${unit}${imp ?? ''}`;
  });
  result = result.replace(/(?<![\w-])\$(\w+)(!important)?(?=[;\s}])/g, (_m, name: string, imp?: string) => {
    return `${vars.get(name) ?? ''}${imp ?? ''}`;
  });
  return result;
}

function extractClassNamesFromSelector(selector: string): string[] {
  const names: string[] = [];
  const re = /\.([a-zA-Z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selector)) !== null) {
    names.push(m[1]!);
  }
  return names;
}

function evalIfCondition(expr: string, vars: Map<string, ScssVarValue>): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;

  const orParts = trimmed.split(/\s+or\s+/);
  return orParts.some((part) => {
    const modMatch = part.trim().match(/^\$(\w+)\s*%\s*(\d+)\s*==\s*(\d+)$/);
    if (modMatch) {
      const value = Number(vars.get(modMatch[1]!) ?? NaN);
      return value % Number(modMatch[2]) === Number(modMatch[3]);
    }
    const eqMatch = part.trim().match(/^\$(\w+)\s*==\s*(\w+)$/);
    if (eqMatch) {
      return String(vars.get(eqMatch[1]!)) === eqMatch[2];
    }
    return false;
  });
}

function parseForHeader(header: string): {
  varName: string;
  start: number;
  end: number;
  mode: 'through' | 'to';
} | null {
  const match = header.match(/@for\s+\$(\w+)\s+from\s+(-?\d+)\s+(through|to)\s+(-?\d+)/);
  if (!match) return null;
  return {
    varName: match[1]!,
    start: Number(match[2]),
    end: Number(match[4]),
    mode: match[3] as 'through' | 'to',
  };
}

function forIterationValues(start: number, end: number, mode: 'through' | 'to'): number[] {
  const values: number[] = [];
  if (mode === 'through') {
    for (let i = start; i <= end; i++) values.push(i);
  } else {
    for (let i = start; i < end; i++) values.push(i);
  }
  return values;
}

function parseEachHeader(header: string): { varNames: string[]; listRaw: string } | null {
  const match = header.match(/@each\s+(.+?)\s+in\s+(.+)/s);
  if (!match) return null;
  const varNames = match[1]!
    .split(',')
    .map((v) => v.trim().replace(/^\$/, ''))
    .filter(Boolean);
  const listRaw = match[2]!.trim();
  if (listRaw.startsWith('$')) return null;
  return { varNames, listRaw };
}

function parseEachIterations(varNames: string[], listRaw: string): Map<string, ScssVarValue>[] {
  const iterations: Map<string, ScssVarValue>[] = [];
  for (const chunk of listRaw.split(',')) {
    const tokens = chunk.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== varNames.length) continue;
    const vars = new Map<string, ScssVarValue>();
    varNames.forEach((name, idx) => vars.set(name, tokens[idx]!));
    iterations.push(vars);
  }
  return iterations;
}

function emitRules(rules: FlatScssRule[]): { text: string; classNames: Set<string> } {
  const classNames = new Set<string>();
  const chunks: string[] = [];

  for (const rule of rules) {
    for (const selector of rule.selectors) {
      for (const cls of extractClassNamesFromSelector(selector)) {
        classNames.add(cls);
      }
    }
    const selectorText = rule.selectors.join(', ');
    chunks.push(`${selectorText} {`, ...rule.properties.map((p) => `\t${p}`), '}');
  }

  return { text: chunks.join('\n'), classNames };
}

function findRuleBodyBraceStart(content: string, selectorStart: number): number {
  let pos = selectorStart;
  while (pos < content.length) {
    if (content.startsWith('#{', pos)) {
      const close = content.indexOf('}', pos + 2);
      if (close === -1) return -1;
      pos = close + 1;
      continue;
    }
    if (content[pos] === '{') return pos;
    pos++;
  }
  return -1;
}

function parseRuleBlock(content: string, pos: number): { end: number; selectors: string[]; properties: string[] } | null {
  pos = skipWhitespaceAndComments(content, pos);
  if (pos >= content.length || content[pos] !== '.') return null;

  const braceStart = findRuleBodyBraceStart(content, pos);
  if (braceStart === -1) return null;

  const selectorRaw = content.slice(pos, braceStart).trim();
  const selectors = selectorRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const braceEnd = findMatchingBrace(content, braceStart);
  if (braceEnd === -1) return null;

  const body = content.slice(braceStart + 1, braceEnd);
  const properties = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('/*'));

  return { end: braceEnd + 1, selectors, properties };
}

function expandBodyToRules(body: string, vars: Map<string, ScssVarValue>, out: FlatScssRule[]): void {
  let pos = 0;
  while (pos < body.length) {
    pos = skipWhitespaceAndComments(body, pos);
    if (pos >= body.length) break;

    if (body.startsWith('@if', pos)) {
      const braceStart = body.indexOf('{', pos);
      if (braceStart === -1) break;
      const cond = body.slice(pos + 3, braceStart).trim();
      const braceEnd = findMatchingBrace(body, braceStart);
      if (braceEnd === -1) break;
      if (evalIfCondition(cond, vars)) {
        expandBodyToRules(body.slice(braceStart + 1, braceEnd), vars, out);
      }
      pos = braceEnd + 1;
      continue;
    }

    if (body.startsWith('@for', pos)) {
      const braceStart = body.indexOf('{', pos);
      if (braceStart === -1) break;
      const header = body.slice(pos, braceStart);
      const parsed = parseForHeader(header);
      const braceEnd = findMatchingBrace(body, braceStart);
      if (!parsed || braceEnd === -1) break;
      const inner = body.slice(braceStart + 1, braceEnd);
      for (const value of forIterationValues(parsed.start, parsed.end, parsed.mode)) {
        const next = cloneVars(vars);
        next.set(parsed.varName, value);
        expandBodyToRules(inner, next, out);
      }
      pos = braceEnd + 1;
      continue;
    }

    if (body.startsWith('@each', pos)) {
      const braceStart = body.indexOf('{', pos);
      if (braceStart === -1) break;
      const header = body.slice(pos, braceStart);
      const parsed = parseEachHeader(header);
      const braceEnd = findMatchingBrace(body, braceStart);
      if (!parsed || braceEnd === -1) break;
      const inner = body.slice(braceStart + 1, braceEnd);
      for (const eachVars of parseEachIterations(parsed.varNames, parsed.listRaw)) {
        const next = cloneVars(vars);
        for (const [k, v] of eachVars) next.set(k, v);
        expandBodyToRules(inner, next, out);
      }
      pos = braceEnd + 1;
      continue;
    }

    const rule = parseRuleBlock(body, pos);
    if (!rule) break;

    const selectors = rule.selectors.map((s) => interpolateText(s, vars));
    const properties = rule.properties.map((p) => interpolateText(p, vars));
    out.push({ selectors, properties });
    pos = rule.end;
  }
}

function expandTopLevelBlock(
  content: string,
  pos: number,
): { start: number; end: number; rules: FlatScssRule[] } | null {
  pos = skipWhitespaceAndComments(content, pos);
  const start = pos;

  if (content.startsWith('@for', pos)) {
    const braceStart = content.indexOf('{', pos);
    if (braceStart === -1) return null;
    const parsed = parseForHeader(content.slice(pos, braceStart));
    const braceEnd = findMatchingBrace(content, braceStart);
    if (!parsed || braceEnd === -1) return null;
    const inner = content.slice(braceStart + 1, braceEnd);
    const rules: FlatScssRule[] = [];
    for (const value of forIterationValues(parsed.start, parsed.end, parsed.mode)) {
      const vars = new Map<string, ScssVarValue>([[parsed.varName, value]]);
      expandBodyToRules(inner, vars, rules);
    }
    return { start, end: braceEnd + 1, rules };
  }

  if (content.startsWith('@each', pos)) {
    const braceStart = content.indexOf('{', pos);
    if (braceStart === -1) return null;
    const parsed = parseEachHeader(content.slice(pos, braceStart));
    const braceEnd = findMatchingBrace(content, braceStart);
    if (!parsed || braceEnd === -1) return null;
    const inner = content.slice(braceStart + 1, braceEnd);
    const rules: FlatScssRule[] = [];
    for (const eachVars of parseEachIterations(parsed.varNames, parsed.listRaw)) {
      expandBodyToRules(inner, eachVars, rules);
    }
    return { start, end: braceEnd + 1, rules };
  }

  return null;
}

function findNextExpandableBlock(content: string, from = 0): number {
  for (let i = from; i < content.length; i++) {
    if (content.startsWith('@for', i) || content.startsWith('@each', i)) {
      return i;
    }
  }
  return -1;
}

function includeLeadingComment(content: string, start: number): number {
  if (start <= 0) return start;
  const prevLineEnd = content.lastIndexOf('\n', start - 1);
  if (prevLineEnd <= 0) return start;
  const prevLineStart = content.lastIndexOf('\n', prevLineEnd - 1) + 1;
  const prevLine = content.slice(prevLineStart, prevLineEnd).trim();
  if (prevLine.startsWith('//')) return prevLineStart;
  return start;
}

function skipControlFlowBlock(content: string, pos: number): number {
  const braceStart = content.indexOf('{', pos);
  if (braceStart === -1) return pos + 1;
  const braceEnd = findMatchingBrace(content, braceStart);
  return braceEnd === -1 ? content.length : braceEnd + 1;
}

/** 展开 content 中所有可求值的 @for/@each/@if，返回显式规则与 class 名集合 */
export function expandScssLoopsInContent(content: string): ScssLoopExpandResult {
  let result = content;
  let expanded = false;
  const allClassNames = new Set<string>();
  let guard = 0;
  let searchFrom = 0;

  while (guard++ < 500) {
    const pos = findNextExpandableBlock(result, searchFrom);
    if (pos === -1) break;

    const block = expandTopLevelBlock(result, pos);
    if (!block) {
      searchFrom = skipControlFlowBlock(result, pos);
      continue;
    }

    const emitted = emitRules(block.rules);
    for (const cls of emitted.classNames) allClassNames.add(cls);

    const blockStart = includeLeadingComment(result, block.start);
    const leading = result.slice(0, blockStart).replace(/\s*$/, '');
    const trailing = result.slice(block.end).replace(/^\s*/, '');
    const commentLine = result.slice(blockStart, block.start).trim();
    const prefix =
      commentLine.startsWith('//') && !commentLine.includes('混淆展开')
        ? `${commentLine}（混淆展开）\n`
        : '';
    const body = emitted.text ? `${prefix}${emitted.text}\n` : '';
    result = `${leading}\n${body}${trailing}`.replace(/\n{3,}/g, '\n\n');
    expanded = true;
    searchFrom = 0;
  }

  return { content: result, classNames: allClassNames, expanded };
}

export function collectScssLoopClassNames(content: string): Set<string> {
  return expandScssLoopsInContent(content).classNames;
}

export function hasExpandableScssLoops(content: string): boolean {
  return findNextExpandableBlock(content) !== -1;
}
