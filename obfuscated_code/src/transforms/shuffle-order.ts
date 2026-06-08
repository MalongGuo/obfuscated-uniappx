import _traverseModule from '@babel/traverse';
import type * as t from '@babel/types';
import { seededShuffle } from './seeded-random.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

/** 打乱文件顶层函数声明与 class 内方法顺序（语义不变） */
export function shuffleFunctionOrder(ast: t.File, seed: string | null): void {
  if (ast.program.body.length > 1) {
    const fnLike = ast.program.body.filter(
      (n) => n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration',
    );
    const rest = ast.program.body.filter(
      (n) => n.type !== 'FunctionDeclaration' && n.type !== 'ClassDeclaration',
    );
    if (fnLike.length > 1) {
      ast.program.body = [...seededShuffle(fnLike, seed, 'program'), ...rest];
    }
  }

  traverse(ast, {
    noScope: true,
    ClassBody(path) {
      const methods = path.node.body.filter(
        (n) => n.type === 'ClassMethod' || n.type === 'ClassProperty' || n.type === 'ClassPrivateMethod',
      );
      if (methods.length <= 1) return;
      const methodSet = new Set<unknown>(methods);
      const shuffled = seededShuffle([...methods], seed, `class-${path.node.body.length}`);
      let index = 0;
      path.node.body = path.node.body.map((node) => (methodSet.has(node) ? shuffled[index++]! : node));
    },
  });
}
