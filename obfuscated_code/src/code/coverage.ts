import fs from 'fs-extra';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifact-resolve.js';
import type { ObfuscationMode } from '../types/config.js';

export interface CoverageReport {
  pathMappings: number;
  symbolMappings: number;
  functions: number;
  properties: number;
  classes: number;
  locals: number;
  renamedFiles: number;
  coveragePercent: number;
  unobfuscatedSamples: string[];
}

const READABLE_FUNC = /\b(?:show|get|set|handle|load|fetch|detail|update|delete|create)[A-Z]\w{2,}\b/g;

/** code 阶段：从符号/路径映射统计覆盖率 */
export async function analyzeCoverage(
  projectRoot: string,
  sampleFiles: string[],
  mode?: ObfuscationMode,
): Promise<CoverageReport> {
  const pathsMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapPaths, mode);
  const symbolsMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapSymbols, mode);

  let pathMappings = 0;
  let symbolMappings = 0;
  let functions = 0;
  let properties = 0;
  let classes = 0;
  let locals = 0;
  let renamedFiles = 0;

  if (pathsMapPath) {
    const data = await fs.readJson(pathsMapPath);
    pathMappings = Array.isArray(data.mappings)
      ? data.mappings.filter((m: { from: string; to: string }) => m.from !== m.to).length
      : 0;
    renamedFiles = data.replacedFileCount ?? 0;
  }

  if (symbolsMapPath) {
    const data = await fs.readJson(symbolsMapPath);
    functions = Object.keys(data.functions ?? {}).length;
    properties = Object.keys(data.properties ?? {}).length;
    classes = Object.keys(data.classes ?? {}).length;
    locals = Object.keys(data.locals ?? {}).length;
    if (functions === 0 && properties === 0 && data.mappings) {
      for (const [name, obfuscated] of Object.entries(data.mappings as Record<string, string>)) {
        if (/^[a-z]/.test(name)) properties++;
        else functions++;
      }
    }
    const classifiedTotal = functions + properties + classes + locals;
    symbolMappings = data.totalMappings
      ?? (classifiedTotal || Object.keys(data.mappings ?? {}).length);
    renamedFiles = Math.max(renamedFiles, data.renamedFileCount ?? 0);
  } else {
    const functionsMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapFunctions, mode);
    const propertiesMapPath = await resolveArtifactFile(projectRoot, ARTIFACT_JSON.mapProperties, mode);
    if (functionsMapPath) {
      const data = await fs.readJson(functionsMapPath);
      functions = data.count ?? Object.keys(data.mappings ?? {}).length;
    }
    if (propertiesMapPath) {
      const data = await fs.readJson(propertiesMapPath);
      properties = data.count ?? Object.keys(data.mappings ?? {}).length;
    }
    symbolMappings = functions + properties + classes + locals;
  }

  const unobfuscatedSamples: string[] = [];
  for (const rel of sampleFiles.slice(0, 5)) {
    const abs = `${projectRoot}/${rel}`;
    if (!(await fs.pathExists(abs))) continue;
    const content = await fs.readFile(abs, 'utf-8');
    const matches = content.match(READABLE_FUNC) ?? [];
    for (const m of matches.slice(0, 3)) {
      if (!unobfuscatedSamples.includes(m)) unobfuscatedSamples.push(m);
    }
  }

  const total = pathMappings + symbolMappings;
  const coveragePercent = total > 0
    ? Math.min(100, Math.round((symbolMappings / (symbolMappings + unobfuscatedSamples.length * 10)) * 100))
    : 0;

  return {
    pathMappings,
    symbolMappings,
    functions,
    properties,
    classes,
    locals,
    renamedFiles,
    coveragePercent,
    unobfuscatedSamples: unobfuscatedSamples.slice(0, 10),
  };
}
