import { describe, expect, it } from 'vitest';
import {
  obfuscatedConfigLabel,
  resolveObfuscatedConfigDir,
} from '../src/output/obfuscated-config.js';

describe('resolveObfuscatedConfigDir', () => {
  it('places config artifacts under project obfuscated/config/', () => {
    const dir = resolveObfuscatedConfigDir('/workspace/uni-test');
    expect(dir).toMatch(/\/uni-test\/obfuscated\/config$/);
    expect(obfuscatedConfigLabel('/workspace/uni-test', 'whitelist.json')).toBe(
      'obfuscated/config/whitelist.json',
    );
  });
});
