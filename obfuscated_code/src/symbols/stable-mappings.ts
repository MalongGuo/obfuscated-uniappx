import fs from 'fs-extra';
import { ARTIFACT_JSON } from '../output/artifact-names.js';
import { resolveArtifactFile } from '../output/artifacts.js';
import { makeSymbolKey } from './keys.js';
import type { ObfuscationMode } from '../types/config.js';
import type { SymbolTable } from './types.js';

/** 从上次运行的 obfuscation-map-symbols.json 加载稳定映射 */
export async function loadStableMappings(
  projectPath: string,
  mode?: ObfuscationMode,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const artifactPath = await resolveArtifactFile(projectPath, ARTIFACT_JSON.mapSymbols, mode);
  if (!artifactPath) return map;

  try {
    const data = await fs.readJson(artifactPath) as {
      functions?: Record<string, string>;
      properties?: Record<string, string>;
      classes?: Record<string, string>;
      locals?: Record<string, string>;
      symbols?: Record<string, { name?: string; file?: string; obfuscatedName?: string }>;
    };

    if (data.symbols) {
      for (const [key, entry] of Object.entries(data.symbols)) {
        if (entry.obfuscatedName && entry.name) {
          map.set(key.includes('::') ? key : makeSymbolKey(entry.file ?? '', entry.name), entry.obfuscatedName);
        }
      }
      return map;
    }

    for (const bucket of [data.functions, data.properties, data.classes, data.locals]) {
      if (!bucket) continue;
      for (const [name, obfuscatedName] of Object.entries(bucket)) {
        map.set(name, obfuscatedName);
      }
    }
  } catch {
    return map;
  }

  return map;
}

export function applyStableMappings(
  table: SymbolTable,
  stableMappings: Map<string, string>,
): void {
  for (const entry of table.symbols.values()) {
    if (!entry.renameable) continue;
    const key = makeSymbolKey(entry.file, entry.name);
    const stable = stableMappings.get(key) ?? stableMappings.get(entry.name);
    if (stable) entry.obfuscatedName = stable;
  }
}
