import type { ObfuscatorConfig } from '../types/config.js';

export interface PresetWarning {
  level: 'warn' | 'info';
  message: string;
}

const HEAVY_FEATURES: Array<{ key: keyof ObfuscatorConfig['features']; label: string }> = [
  { key: 'encryptAllStrings', label: '字符串加密' },
  { key: 'insertJunkFuncProp', label: '垃圾函数/属性' },
  { key: 'shuffleFuncOrder', label: '打乱定义顺序' },
  { key: 'disruptExecOrder', label: '扰乱执行顺序' },
  { key: 'controlFlowFlatten', label: '控制流平坦化' },
  { key: 'enhancedUiJunkCode', label: 'UI 垃圾节点' },
  { key: 'renameProtocol', label: '协议名混淆' },
];

/** Sprint 0 预设：iOS light 等平台告警 */
export function checkPresetWarnings(config: ObfuscatorConfig): PresetWarning[] {
  const warnings: PresetWarning[] = [];

  if (config.platform === 'app-ios' && config.preset === 'light') {
    for (const { key, label } of HEAVY_FEATURES) {
      if (config.features[key]) {
        warnings.push({
          level: 'warn',
          message: `iOS light 预设下不建议开启「${label}」，可能影响审核或稳定性`,
        });
      }
    }

    if (config.features.encryptAllStrings || config.features.insertJunkFuncProp) {
      warnings.push({
        level: 'warn',
        message: 'iOS 审核建议保持业务逻辑可读性，light 预设应仅启用标识符重命名 + 注释清理',
      });
    }
  }

  if (config.preset === 'light' && config.features.classFilePrefix && config.mode === 'full') {
    warnings.push({
      level: 'info',
      message: 'light 预设已开启路径混淆，若仅需标识符+注释可改用 --mode code',
    });
  }

  return warnings;
}
