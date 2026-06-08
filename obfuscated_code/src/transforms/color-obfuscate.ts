import {
  obfuscateVueClassAndStyleBlocks,
  type VueClassStyleObfuscateResult,
} from './class-obfuscate.js';

const HEX_COLOR = /#([0-9a-fA-F]{6})\b/g;

function nudgeHex(hex: string): string {
  const n = parseInt(hex, 16);
  const tweaked = (n + 0x010101) & 0xffffff;
  return tweaked.toString(16).padStart(6, '0');
}

function replaceHexColors(content: string): { content: string; sample?: string } {
  let sample: string | undefined;
  const contentOut = content.replace(HEX_COLOR, (match, hex: string) => {
    const next = `#${nudgeHex(hex)}`;
    if (!sample && next !== match) {
      sample = `${match} → ${next}`;
    }
    return next;
  });
  return { content: contentOut, sample };
}

/** 对 CSS/样式中的 #RRGGBB 颜色做微小扰动 */
export function obfuscateColorValues(content: string): string {
  return replaceHexColors(content).content;
}

export function obfuscateColorValuesDetailed(content: string): { content: string; sample?: string } {
  return replaceHexColors(content);
}

export function obfuscateVueStyleBlocks(content: string): string {
  return obfuscateVueClassAndStyleBlocks(content, null, 'css', { renameClasses: false }).content;
}

export function obfuscateVueStyleBlocksDetailed(content: string): { content: string; sample?: string } {
  const result = obfuscateVueClassAndStyleBlocks(content, null, 'css');
  const sample = result.colorSample
    ?? (result.classRenames[0] ? `${result.classRenames[0].from} → ${result.classRenames[0].to}` : undefined);
  return { content: result.content, sample };
}

export function obfuscateVueUiEnhanced(
  content: string,
  seed: string | null,
  fileSalt: string,
  options: {
    renameClasses?: boolean;
    nudgeColors?: boolean;
    globalClassMap?: Map<string, string>;
  } = {},
): VueClassStyleObfuscateResult {
  return obfuscateVueClassAndStyleBlocks(content, seed, fileSalt, options);
}

export function formatColorObfuscateDetail(relPath: string, sample?: string, changed?: boolean): string {
  if (sample) return `${relPath} | ${sample}`;
  if (changed === false) return `${relPath} | 无变更`;
  return `${relPath} | 无颜色值`;
}
