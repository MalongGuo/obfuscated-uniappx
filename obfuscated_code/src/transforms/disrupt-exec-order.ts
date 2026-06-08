import _traverseModule from '@babel/traverse';
import type * as t from '@babel/types';
import { seededShuffle } from './seeded-random.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

function shuffleExpressionRuns(body: t.Statement[], seed: string | null, salt: string): t.Statement[] {
  const result: t.Statement[] = [];
  let run: t.Statement[] = [];

  const flush = () => {
    if (run.length === 0) return;
    result.push(...(run.length > 1 ? seededShuffle(run, seed, salt) : run));
    run = [];
  };

  for (const stmt of body) {
    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression;
      // 赋值/自更新语句不可与相邻表达式混洗，避免 emit 读到尚未写入的 this.xxx（如 nav-height）
      if (expr.type === 'AssignmentExpression' || expr.type === 'UpdateExpression') {
        flush();
        result.push(stmt);
      } else {
        run.push(stmt);
      }
    } else {
      flush();
      result.push(stmt);
    }
  }
  flush();
  return result;
}

/** 扰乱函数体内连续表达式语句顺序 */
export function disruptExecutionOrder(ast: t.File, seed: string | null): void {
  traverse(ast, {
    noScope: true,
    BlockStatement(path) {
      if (path.parent.type === 'FunctionDeclaration' || path.parent.type === 'FunctionExpression' || path.parent.type === 'ArrowFunctionExpression') {
        path.node.body = shuffleExpressionRuns(path.node.body, seed, `block-${path.node.body.length}`);
      }
    },
  });
}
