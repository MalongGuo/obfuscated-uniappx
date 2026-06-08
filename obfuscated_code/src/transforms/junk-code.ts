import * as t from '@babel/types';
import type { File } from '@babel/types';
import { createHash } from 'node:crypto';

function junkName(seed: string | null, index: number): string {
  const hash = createHash('sha256').update(`${seed ?? 'junk'}:${index}`).digest('hex');
  return `_j${hash.slice(0, 8)}`;
}

/** 在文件末尾插入无副作用垃圾函数并调用一次 */
export function insertJunkFunctions(ast: File, seed: string | null): void {
  const fnName = junkName(seed, ast.program.body.length);
  const fn = t.functionDeclaration(
    t.identifier(fnName),
    [],
    t.blockStatement([t.returnStatement(t.numericLiteral(0))]),
  );
  const call = t.expressionStatement(
    t.callExpression(t.identifier(fnName), []),
  );
  ast.program.body.push(fn, call);
}

/** 在 class 内插入只读垃圾属性 */
export function insertJunkClassProperties(ast: File, seed: string | null): void {
  let index = 0;
  for (const node of ast.program.body) {
    if (node.type !== 'ClassDeclaration' || !node.body) continue;
    const propName = junkName(seed, index++);
    node.body.body.push(
      t.classMethod(
        'method',
        t.identifier(propName),
        [],
        t.blockStatement([t.returnStatement(t.numericLiteral(0))]),
      ),
    );
  }
}
