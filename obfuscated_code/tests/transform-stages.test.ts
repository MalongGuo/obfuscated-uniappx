import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../src/config/defaults.js';
import { resolveTransformStages } from '../src/pipeline/transform.js';

describe('resolveTransformStages', () => {
  it('clone 仅路径 clone', () => {
    const config = createDefaultConfig();
    config.mode = 'clone';
    expect(resolveTransformStages(config)).toEqual({
      shouldRunPathClone: true,
      shouldRunCodeObfuscate: false,
      shouldRunResourcePhase: false,
    });
  });

  it('code 仅代码与资源', () => {
    const config = createDefaultConfig();
    config.mode = 'code';
    const stages = resolveTransformStages(config);
    expect(stages.shouldRunPathClone).toBe(false);
    expect(stages.shouldRunCodeObfuscate).toBe(true);
    expect(stages.shouldRunResourcePhase).toBe(true);
  });

  it('full 路径 clone + 代码 + 资源（全部 run）', () => {
    const config = createDefaultConfig();
    config.mode = 'full';
    const stages = resolveTransformStages(config);
    expect(stages.shouldRunPathClone).toBe(true);
    expect(stages.shouldRunCodeObfuscate).toBe(true);
    expect(stages.shouldRunResourcePhase).toBe(true);
  });
});
