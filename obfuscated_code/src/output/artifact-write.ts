import type { ObfuscationMode } from '../types/config.js';
import { modeArtifactName } from './artifact-names.js';
import { writeConfigJson } from './obfuscated-config.js';

/** 映射/解析 JSON 统一写入源项目 obfuscated/config/ */
export async function writeArtifactJson(
  sourceProjectPath: string,
  mode: ObfuscationMode,
  basename: string,
  data: unknown,
): Promise<void> {
  const filename = modeArtifactName(mode, basename);
  await writeConfigJson(sourceProjectPath, filename, data);
}
