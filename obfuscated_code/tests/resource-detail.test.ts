import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  formatResourceHashDetail,
  refreshResourceHash,
} from '../src/transforms/resource-hash.js';
import { formatColorObfuscateDetail, obfuscateColorValuesDetailed } from '../src/transforms/color-obfuscate.js';
import { formatImageRenameDetail } from '../src/transforms/rename-images.js';

describe('image rename detail', () => {
  it('formatImageRenameDetail 展示路径前后', () => {
    expect(formatImageRenameDetail('static/logo.png', 'static/eYjC8DPlogo.png')).toBe(
      'static/logo.png → static/eYjC8DPlogo.png',
    );
    expect(formatImageRenameDetail('static/test-image', 'static/eYjC8DPtest-image')).toBe(
      'static/test-image → static/eYjC8DPtest-image',
    );
  });
});

describe('resource hash detail', () => {
  it('formatResourceHashDetail 展示 hash 前后', () => {
    const detail = formatResourceHashDetail('static/logo.jpg', {
      changed: true,
      hashBefore: 'a1b2c3d4',
      hashAfter: 'e5f6a7b8',
    });
    expect(detail).toBe('static/logo.jpg | hash a1b2c3d4 → e5f6a7b8');
  });

  it('refreshResourceHash 返回 hash 变化', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'obf-hash-'));
    const filePath = path.join(dir, 'test.jpg');
    await fs.writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0xAB]));

    const result = await refreshResourceHash(filePath);
    expect(result.changed).toBe(true);
    expect(result.hashBefore).toBeTruthy();
    expect(result.hashAfter).toBeTruthy();
    expect(result.hashBefore).not.toBe(result.hashAfter);
  });
});

describe('color obfuscate detail', () => {
  it('展示首个颜色变化', () => {
    const { sample } = obfuscateColorValuesDetailed('.box { color: #ffffff; }');
    const detail = formatColorObfuscateDetail('pages/a.uvue', sample, true);
    expect(detail).toContain('#ffffff → #');
  });
});
