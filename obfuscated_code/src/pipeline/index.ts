import path from 'node:path';
import type { ObfuscatorConfig } from '../types/config.js';
import type { Logger } from '../logger/index.js';
import { resolveRunOutputPlan } from '../output/resolve.js';
import { createLogSession } from '../output/session.js';
import { runPreloadPhase } from './analyze.js';
import { runTransformPhase } from './transform.js';

export type { AnalyzePhaseResult } from './analyze.js';
export type { TransformPhaseResult, RunTransformOptions } from './transform.js';
export { runPreloadPhase, runAnalyzePhase } from './analyze.js';
export { runTransformPhase, resolveTransformStages } from './transform.js';

export interface PipelineResult {
  outputPath: string;
  fileCount: number;
  extensionCounts: Record<string, number>;
  executedFeatures: Awaited<ReturnType<typeof runTransformPhase>>['executedFeatures'];
  durationMs: number;
  cloneStats?: Awaited<ReturnType<typeof runTransformPhase>>['cloneStats'];
  symbolStats?: Awaited<ReturnType<typeof runTransformPhase>>['symbolStats'];
  codeStats?: Awaited<ReturnType<typeof runTransformPhase>>['codeStats'];
  resourceStats?: Awaited<ReturnType<typeof runTransformPhase>>['resourceStats'];
}

/** run = preload（Analyze）+ transform（Clone/Code/Full 执行） */
export async function runPipeline(
  projectPath: string,
  config: ObfuscatorConfig,
  logger: Logger,
): Promise<PipelineResult> {
  const start = Date.now();
  const sessionAt = new Date();
  const resolvedProject = path.resolve(projectPath);
  const outputPlan = resolveRunOutputPlan(resolvedProject, config, sessionAt);
  const logSession = config.generateLog
    ? createLogSession(resolvedProject, outputPlan.token, sessionAt, path.basename(outputPlan.outputPath))
    : null;

  const preload = await runPreloadPhase(resolvedProject, config, logger);
  const transform = await runTransformPhase(resolvedProject, config, logger, {
    preload,
    token: outputPlan.token,
    outputPath: outputPlan.outputPath,
    tokenAuto: outputPlan.tokenAuto,
    seedFromSourceDir: outputPlan.seedFromSourceDir,
    logSession,
    sessionAt,
  });

  return {
    ...transform,
    durationMs: Date.now() - start,
  };
}
