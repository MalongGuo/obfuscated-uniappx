import type { ObfuscationMode } from '../types/config.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { modeArtifactName } from '../output/artifact-names.js';
import { writeArtifactJson } from '../output/artifact-write.js';
import { writeConfigText } from '../output/obfuscated-config.js';
import { writeSessionJson } from '../output/session.js';

/** clone 阶段：clone-log + paths/resources 映射（Sprint 2 产出） */
export async function writeCloneArtifacts(
  sourceProjectPath: string,
  mode: ObfuscationMode,
  cloneLogContent: string,
  pathsMap: Record<string, unknown> | null,
): Promise<void> {
  await writeConfigText(sourceProjectPath, 'clone-log.txt', cloneLogContent);
  if (pathsMap) {
    await writeSessionJson(
      sourceProjectPath,
      modeArtifactName(mode, ARTIFACT_JSON.mapPaths),
      pathsMap,
    );
    await writeResourcesMapArtifact(sourceProjectPath, mode, pathsMap);
  }
}

/** 从路径映射提取 static/ 等资源路径 */
export async function writeResourcesMapArtifact(
  sourceProjectPath: string,
  mode: ObfuscationMode,
  pathsMap: Record<string, unknown>,
): Promise<void> {
  const mappings = Array.isArray(pathsMap.mappings)
    ? (pathsMap.mappings as Array<{ from: string; to: string }>)
    : [];
  const resources = mappings.filter(
    (m) => m.from !== m.to && /^(static\/|assets\/|uni_modules\/.*\/static\/)/.test(m.from),
  );
  if (resources.length === 0) return;

  await writeArtifactJson(sourceProjectPath, mode, ARTIFACT_JSON.mapResources, {
    generatedAt: new Date().toISOString(),
    count: resources.length,
    mappings: Object.fromEntries(resources.map((m) => [m.from, m.to])),
  });
}
