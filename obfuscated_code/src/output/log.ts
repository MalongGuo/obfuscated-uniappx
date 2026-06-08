import type { ObfuscatorConfig } from '../types/config.js';
import type { PipelineResult } from '../pipeline/index.js';
import { writeSessionDataLog } from './session.js';

export interface ObfuscationLog {
  version: string;
  timestamp: string;
  project: string;
  outputPath: string;
  mode: string;
  preset: string;
  platform: string;
  scope: string;
  seed: string | null;
  durationMs: number;
  phases: Record<string, number>;
  stats: {
    fileCount: number;
    extensionCounts: Record<string, number>;
    clone?: PipelineResult['cloneStats'];
    symbols?: PipelineResult['symbolStats'];
    code?: PipelineResult['codeStats'];
  };
  features: PipelineResult['executedFeatures'];
}

export async function writeObfuscationLog(
  projectPath: string,
  config: ObfuscatorConfig,
  result: PipelineResult,
  phases: Record<string, number>,
): Promise<string> {
  const log: ObfuscationLog = {
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    project: projectPath,
    outputPath: result.outputPath,
    mode: config.mode,
    preset: config.preset,
    platform: config.platform,
    scope: config.scope,
    seed: config.seed,
    durationMs: result.durationMs,
    phases,
    stats: {
      fileCount: result.fileCount,
      extensionCounts: result.extensionCounts,
      clone: result.cloneStats,
      symbols: result.symbolStats,
      code: result.codeStats,
    },
    features: result.executedFeatures,
  };

  return writeSessionDataLog(projectPath, 'obfuscation-log', log);
}
