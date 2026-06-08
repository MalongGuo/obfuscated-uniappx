import type { FeatureFlags, ObfuscationPreset } from '../types/config.js';
import { DEFAULT_FEATURES, PRESET_FEATURES } from './defaults.js';

export function applyPreset(preset: ObfuscationPreset): FeatureFlags {
  const overrides = PRESET_FEATURES[preset] ?? {};
  return { ...DEFAULT_FEATURES, ...overrides };
}
