import { describe, expect, it } from 'vitest';
import { syncPackageJsonContent } from '../src/path/package-json-sync.js';

describe('syncPackageJsonContent', () => {
  const renameLog = [{ from: 'scripts', to: 'TOKENscripts' }];

  it('preserves npm scripts key and updates script paths', () => {
    const input = `{
  "name": "demo",
  "scripts": {
    "app:u": "node scripts/switch-app.mjs u"
  }
}`;
    const output = syncPackageJsonContent(input, renameLog);
    const data = JSON.parse(output) as { scripts: Record<string, string> };
    expect(data.scripts).toBeDefined();
    expect(data.scripts['app:u']).toBe('node TOKENscripts/switch-app.mjs u');
    expect(output).not.toContain('TOKENscripts":');
  });

  it('repairs corrupted scripts key', () => {
    const input = `{
  "name": "demo",
  "TOKENscripts": {
    "app:u": "node scripts/switch-app.mjs u"
  }
}`;
    const output = syncPackageJsonContent(input, renameLog);
    const data = JSON.parse(output) as { scripts: Record<string, string> };
    expect(data.scripts['app:u']).toBe('node TOKENscripts/switch-app.mjs u');
    expect((data as Record<string, unknown>)['TOKENscripts']).toBeUndefined();
  });
});
