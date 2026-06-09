import _generateModule from '@babel/generator';
import type { File } from '@babel/types';
import type { ObfuscatorConfig } from '../types/config.js';
import type { RenameMap } from './rename-map.js';
import { applyRenamesToAst } from './rename-script.js';
import { shuffleFunctionOrder } from './shuffle-order.js';
import { disruptExecutionOrder } from './disrupt-exec-order.js';
import { encryptStringLiterals, type StringEncryptCollector } from './string-encryption.js';
import { insertJunkClassProperties, insertJunkFunctions } from './junk-code.js';
import { flattenControlFlow } from './control-flow.js';
import { isUtsPluginPath } from '../path/protected-names.js';

type GenerateFn = (
  ast: File,
  opts?: Parameters<typeof _generateModule.default>[1],
  code?: string,
) => { code: string };

const generate = (_generateModule.default ?? _generateModule) as unknown as GenerateFn;

/** 竞品顺序：shuffle → rename → disrupt → junk → encrypt → controlFlow → generate */
export function runScriptTransformPipeline(
  ast: File,
  renameMap: RenameMap,
  config: ObfuscatorConfig,
  originalCode?: string,
  stringCollector?: StringEncryptCollector,
  relativePath?: string,
): string {
  if (config.features.shuffleFuncOrder) {
    shuffleFunctionOrder(ast, config.seed);
  }

  if (renameMap.size > 0 && config.features.renameFuncPropVarEnum) {
    applyRenamesToAst(ast, renameMap, config.features.renameProtocol);
  }

  if (config.features.disruptExecOrder) {
    disruptExecutionOrder(ast, config.seed);
  }

  const skipJunk = relativePath != null && isUtsPluginPath(relativePath);
  if (config.features.insertJunkFuncProp && !skipJunk) {
    insertJunkFunctions(ast, config.seed);
    insertJunkClassProperties(ast, config.seed);
  }

  if (config.features.encryptAllStrings || config.features.ciphertextStrings) {
    encryptStringLiterals(ast, config, stringCollector);
  }

  if (config.features.controlFlowFlatten) {
    flattenControlFlow(ast);
  }

  return generate(ast, { retainLines: true, comments: true }, originalCode).code;
}
