import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/parser/babel.js';
import { shuffleFunctionOrder } from '../src/transforms/shuffle-order.js';
import _generateModule from '@babel/generator';

const generate = (_generateModule.default ?? _generateModule) as (
  ast: import('@babel/types').File,
) => { code: string };

describe('shuffleFunctionOrder', () => {
  it('Vue SFC：import 保持在 export default 与末尾 helper 之前', () => {
    const code = `
import { listBanner } from "@/service/uts/user/ai-banner.uts";
import type { BannerItem } from "@/service/uts/types";

type FeaturedTab = { id: string; name: string; };

export default {
  name: "HomePage",
  methods: {
    load() { return 1; }
  }
};

function createFeaturedTabs(): FeaturedTab[] {
  return [{ id: "featured", name: "精选" }] as FeaturedTab[];
}

function createContentSections(): FeaturedTab[] {
  const cards = [{ id: "card-1" }] as FeaturedTab[];
  return cards;
}
`;
    const parsed = parseScript(code, 'typescript', 'pages/home.uvue');
    shuffleFunctionOrder(parsed.ast!, 'shuffle-sfc-test');
    const out = generate(parsed.ast!).code;

    const importIdx = out.indexOf('import { listBanner }');
    const exportIdx = out.indexOf('export default');
    const helperA = out.indexOf('function createFeaturedTabs');
    const helperB = out.indexOf('function createContentSections');

    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(exportIdx).toBeGreaterThan(importIdx);
    expect(helperA).toBeGreaterThan(exportIdx);
    expect(helperB).toBeGreaterThan(exportIdx);
    expect(out).not.toMatch(/\}import\s*\{/);
  });

  it('纯 .uts：import 保持在顶层函数之前', () => {
    const code = `
import { foo } from "./utils.uts";

function alpha() { return 1; }
function beta() { return 2; }
`;
    const parsed = parseScript(code, 'typescript', 'utils.uts');
    shuffleFunctionOrder(parsed.ast!, 'shuffle-uts-test');
    const out = generate(parsed.ast!).code;

    expect(out.indexOf('import { foo }')).toBeLessThan(out.indexOf('function'));
  });

  it('多个顶层函数仍会打乱，但不越过前导区', () => {
    const code = `
import { foo } from "./a.uts";

function first() { return 1; }
function second() { return 2; }
function third() { return 3; }
`;
    const parsed = parseScript(code, 'typescript', 'demo.uts');
    shuffleFunctionOrder(parsed.ast!, 'shuffle-order-test');
    const out = generate(parsed.ast!).code;

    expect(out).toContain('function');
    expect(out.indexOf('import { foo }')).toBeLessThan(out.indexOf('function'));
    expect(out).not.toBe(code.trim());
  });
});
