import type { ObfuscatorConfig, FeatureFlags } from '../types/config.js';

export interface ExecutedFeatureEntry {
  key: keyof FeatureFlags;
  executed: boolean;
  reason?: string;
}

export interface ExecutedFeaturesContext {
  ranPathClone: boolean;
  ranCodeObfuscate: boolean;
  ranResourceTransforms: boolean;
  ranStripComments: boolean;
  fileRenameCount: number;
  codeFileRenameCount: number;
  resourceHashCount: number;
  imageRenameCount: number;
  colorFiles: number;
  stylesheetClassFiles: number;
}

/** Output 阶段：各 feature 实际执行状态（含 code 模式「不重复执行」说明） */
export function resolveExecutedFeatures(
  config: ObfuscatorConfig,
  ctx: ExecutedFeaturesContext,
): ExecutedFeatureEntry[] {
  const {
    ranPathClone,
    ranCodeObfuscate,
    ranResourceTransforms,
    ranStripComments,
    fileRenameCount,
    resourceHashCount,
    imageRenameCount,
    colorFiles,
    stylesheetClassFiles,
  } = ctx;

  return (Object.keys(config.features) as Array<keyof FeatureFlags>).map((key) => {
    const enabled = config.features[key];
    let executed = false;
    let reason: string | undefined;

    if (!enabled) {
      reason = '配置已关闭';
    } else if (key === 'simulateManual') {
      executed = config.namingStyle === 'human' && ranCodeObfuscate;
      if (!executed && enabled) {
        reason = ranCodeObfuscate ? '需 namingStyle: human' : '代码混淆未执行';
      }
    } else if (key === 'classFilePrefix') {
      executed = ranPathClone;
      if (!executed) reason = '路径混淆未执行（需 --mode clone 或 full）';
    } else if (key === 'renameFilenames') {
      if (config.mode === 'clone' || config.mode === 'full') {
        executed = ranPathClone && fileRenameCount > 0;
        if (!ranPathClone) reason = '路径混淆未执行（需 --mode clone 或 full）';
        else if (!executed) reason = '无同名文件需重命名';
      } else {
        executed = false;
        reason = '文件名混淆在 clone/full 路径阶段完成，code 模式不重复执行';
      }
    } else if (key === 'renameImageNames') {
      if (config.mode === 'clone' || config.mode === 'full') {
        executed = ranPathClone && imageRenameCount > 0;
        if (!ranPathClone) reason = '路径混淆未执行（需 --mode clone 或 full）';
        else if (!executed) reason = 'static/ 下无图片需重命名';
      } else {
        executed = false;
        reason = '图片重命名在 clone/full 路径阶段完成，code 模式不重复执行';
      }
    } else if (key === 'resourceHash') {
      if (config.mode === 'clone' || config.mode === 'full') {
        executed = ranPathClone && resourceHashCount > 0;
        if (!ranPathClone) reason = '路径混淆未执行（需 --mode clone 或 full）';
        else if (!executed) reason = '无静态资源需刷新 hash';
      } else {
        executed = false;
        reason = '资源 hash 在 clone/full 路径阶段完成，code 模式不重复执行';
      }
    } else if (key === 'enhancedUiJunkCode') {
      executed = ranCodeObfuscate || (ranResourceTransforms && stylesheetClassFiles > 0);
      if (!executed) {
        reason = ranCodeObfuscate || ranResourceTransforms
          ? '无 uvue/css class 可变换'
          : '代码/资源变换未执行';
      }
    } else if (key === 'colorNudge') {
      executed = ranCodeObfuscate || (ranResourceTransforms && colorFiles > 0);
      if (!executed) {
        reason = ranCodeObfuscate || ranResourceTransforms
          ? '无样式含 #RRGGBB'
          : '资源/代码变换未执行（需 --mode code 或 full）';
      }
    } else if (key === 'renameFuncPropVarEnum' ||
      key === 'shuffleFuncOrder' ||
      key === 'disruptExecOrder' ||
      key === 'controlFlowFlatten' ||
      key === 'insertJunkFuncProp' ||
      key === 'encryptAllStrings' ||
      key === 'ciphertextStrings' ||
      key === 'renameProtocol' ||
      key === 'useNewJunkCode') {
      executed = ranCodeObfuscate;
      if (!executed) reason = '代码混淆未执行（需 --mode code 或 full）';
    } else if (key === 'stripComments') {
      executed = ranStripComments;
      if (!executed) reason = '注释清理未执行';
    } else {
      executed = enabled;
    }

    return { key, executed, reason };
  });
}
