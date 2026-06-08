import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { createDefaultConfig } from '../src/config/defaults.js';
import { renameCodeModeFilenames } from '../src/transforms/code-filename-rename.js';

describe('renameCodeModeFilenames', () => {
  it('以文件路径输出 from → to 进度', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-code-fn-'));
    await fs.ensureDir(path.join(root, 'pages/foo'));
    await fs.writeFile(path.join(root, 'pages/foo/bar.uvue'), '<template></template>');
    await fs.writeFile(path.join(root, 'main.uts'), 'export {}');

    const config = createDefaultConfig();
    config.seed = 'code-filename-test';
    const lines: string[] = [];

    const { renamed } = await renameCodeModeFilenames(root, config, {
      onFileProgress: (_i, _t, detail) => lines.push(detail),
    });

    expect(renamed).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^pages\/foo\/bar\.uvue → pages\/foo\/[A-Za-z0-9]+bar\.uvue$/);
    expect(await fs.pathExists(path.join(root, 'pages/foo'))).toBe(true);
  });
});
