import _traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

function isFunctionBodyBlock(path: NodePath<t.BlockStatement>): boolean {
  const parent = path.parent;
  // ObjectMethod / ClassMethod：Vue Options API computed/methods 与 UTS class 方法。
  // 包在 if (true) 内会导致 UTS→Kotlin 编译失败（如 computed getter 出现 `{if (true) {`）。
  if (parent.type === 'ObjectMethod' || parent.type === 'ClassMethod') {
    return false;
  }
  if (
    parent.type === 'FunctionDeclaration' ||
    parent.type === 'FunctionExpression'
  ) {
    return true;
  }
  if (parent.type === 'ArrowFunctionExpression' && parent.body === path.node) {
    return true;
  }
  return false;
}

function isTrueWrapper(stmt: t.Statement): boolean {
  if (stmt.type !== 'IfStatement') return false;
  const test = stmt.test;
  return test.type === 'BooleanLiteral' && test.value === true;
}

function isAlreadyFlattenWrapped(body: t.Statement[]): boolean {
  return body.length === 1 && isTrueWrapper(body[0]!);
}

/**
 * 轻量控制流平坦化：将独立函数体包在 if (true) { ... } 内。
 * 跳过 Vue Options API（ObjectMethod）与 class 方法（ClassMethod），避免 UTS 编译失败。
 */
export function flattenControlFlow(ast: File): void {
  traverse(ast, {
    noScope: true,
    BlockStatement(path: NodePath<t.BlockStatement>) {
      if (!isFunctionBodyBlock(path)) return;

      const body = path.node.body;
      if (body.length <= 1) return;
      if (isAlreadyFlattenWrapped(body)) return;

      path.node.body = [
        t.ifStatement(t.booleanLiteral(true), t.blockStatement([...body])),
      ];
    },
  });
}
