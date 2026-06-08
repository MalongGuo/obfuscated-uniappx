import { describe, expect, it } from 'vitest';
import { guessSourceProjectName } from '../src/output/artifact-resolve.js';

describe('guessSourceProjectName', () => {
  it('extracts source project from obfuscated output folder name', () => {
    const ts = 1749275827000;
    expect(guessSourceProjectName(`uni-test_${ts}_abcToken123`)).toBe('uni-test');
    expect(guessSourceProjectName('uni-test_20260606_135530_abcToken123')).toBe('uni-test');
    expect(guessSourceProjectName('uni-test')).toBe('uni-test');
    expect(
      guessSourceProjectName('uni-test_20260606_172730_odqHr9JEi5mFcATB_20260606_190748_zw6422weTFxSotYJ'),
    ).toBe('uni-test_20260606_172730_odqHr9JEi5mFcATB');
    expect(guessSourceProjectName(`uni-test_20260606_150442_tok_${ts}`)).toBe('uni-test');
  });
});
