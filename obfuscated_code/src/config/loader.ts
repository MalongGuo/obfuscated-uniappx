import path from 'node:path';
import fs from 'fs-extra';
import type { CliOptions, ObfuscatorConfig } from '../types/config.js';
import { applyPreset } from './presets.js';
import { createDefaultConfig } from './defaults.js';
import {
  resolveObfuscatorConfigPath,
  resolveObfuscatorConfigFileForLoad,
} from '../output/obfuscated-config.js';
import { applyCliSeedOverride } from './seed-cli.js';

async function resolveConfigPath(
  projectPath: string,
  options: Partial<CliOptions>,
): Promise<string> {
  if (options.config) return path.resolve(options.config);
  const found = await resolveObfuscatorConfigFileForLoad(projectPath);
  if (found) return found;
  return resolveObfuscatorConfigPath(projectPath);
}

export async function loadConfig(projectPath: string, options: Partial<CliOptions> = {}): Promise<ObfuscatorConfig> {
  const configPath = await resolveConfigPath(projectPath, options);

  let config = createDefaultConfig();

  if (await fs.pathExists(configPath)) {
    const fileConfig = await fs.readJson(configPath);
    config = {
      ...config,
      ...fileConfig,
      features: { ...config.features, ...fileConfig.features },
      commentStrip: { ...config.commentStrip, ...fileConfig.commentStrip },
      stringEncrypt: { ...config.stringEncrypt, ...fileConfig.stringEncrypt },
    };
  }

  if (options.preset) {
    config.preset = options.preset;
    config.features = applyPreset(options.preset);
  }
  if (options.mode) config.mode = options.mode;
  if (options.scope) config.scope = options.scope;
  if (options.platform) config.platform = options.platform;
  if (options.output) config.outputDir = options.output;
  config.seed = applyCliSeedOverride(config.seed, options);
  if (options.outputDirNaming) config.outputDirNaming = options.outputDirNaming;
  if (options.stable) config.stableMode = options.stable;
  if (options.forceNew) config.forceNew = true;
  if (options.noMap) config.generateMap = false;
  if (options.noLog) config.generateLog = false;

  if (config.preset && !options.preset && !(await fs.pathExists(configPath))) {
    config.features = applyPreset(config.preset);
  }

  return config;
}

/** @deprecated 请用 loadPreloadProjectContext；仅读 obfuscator.config.json，不含 whitelist.json */
export async function loadPreloadConfig(projectPath: string): Promise<ObfuscatorConfig> {
  return loadConfig(projectPath, {});
}

export { resolveConfigPath };
