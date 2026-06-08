import type { ClassifiedMappings } from '../output/maps.js';
import type { ObfuscationMode } from '../types/config.js';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { modeArtifactName } from '../output/artifact-names.js';
import { writeArtifactJson } from '../output/artifact-write.js';

/** code 阶段：functions/properties/symbols/strings 分类映射 */
export async function writeSymbolsMapArtifact(
  sourceProjectPath: string,
  mode: ObfuscationMode,
  data: ClassifiedMappings & { renamedFileCount: number },
): Promise<void> {
  const generatedAt = new Date().toISOString();
  const baseMeta = {
    generatedAt,
    renamedFileCount: data.renamedFileCount,
  };

  await writeArtifactJson(sourceProjectPath, mode, ARTIFACT_JSON.mapFunctions, {
    ...baseMeta,
    count: Object.keys(data.functions).length,
    mappings: data.functions,
  });

  await writeArtifactJson(sourceProjectPath, mode, ARTIFACT_JSON.mapProperties, {
    ...baseMeta,
    count: Object.keys(data.properties).length,
    mappings: data.properties,
  });

  await writeArtifactJson(sourceProjectPath, mode, ARTIFACT_JSON.mapSymbols, data);
}

export async function writeStringsMapArtifact(
  sourceProjectPath: string,
  mode: ObfuscationMode,
  mappings: Record<string, string>,
  renamedFileCount: number,
): Promise<void> {
  await writeArtifactJson(sourceProjectPath, mode, ARTIFACT_JSON.mapStrings, {
    generatedAt: new Date().toISOString(),
    renamedFileCount,
    count: Object.keys(mappings).length,
    mappings,
  });
}

export function symbolMapArtifactNames(mode: ObfuscationMode): string[] {
  return [
    modeArtifactName(mode, ARTIFACT_JSON.mapFunctions),
    modeArtifactName(mode, ARTIFACT_JSON.mapProperties),
    modeArtifactName(mode, ARTIFACT_JSON.mapSymbols),
    modeArtifactName(mode, ARTIFACT_JSON.mapStrings),
  ];
}
