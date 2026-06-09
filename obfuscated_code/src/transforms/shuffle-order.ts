import _traverseModule from '@babel/traverse';
import type * as t from '@babel/types';
import { seededShuffle } from './seeded-random.js';

type TraverseFn = (
  parent: t.Node,
  opts?: Parameters<typeof _traverseModule.default>[1],
) => void;

const traverse = (_traverseModule.default ?? _traverseModule) as unknown as TraverseFn;

function isFnLike(stmt: t.Statement): boolean {
  return stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration';
}

/** import / type / export 等必须保持在文件前部，不可被函数重排越过 */
function isLeadingStatement(stmt: t.Statement): boolean {
  return (
    stmt.type === 'ImportDeclaration' ||
    stmt.type === 'ExportNamedDeclaration' ||
    stmt.type === 'ExportDefaultDeclaration' ||
    stmt.type === 'ExportAllDeclaration' ||
    stmt.type === 'TSImportEqualsDeclaration' ||
    stmt.type === 'TSTypeAliasDeclaration' ||
    stmt.type === 'TSInterfaceDeclaration' ||
    stmt.type === 'TSModuleDeclaration' ||
    stmt.type === 'EmptyStatement'
  );
}

/**
 * 将 program.body 分为：前导区（import/export/type/export default）+ 可打乱的函数区 + 尾部其它语句。
 * Vue SFC 常见模式：import → type → export default → 末尾 helper function。
 */
function partitionProgramBody(body: t.Statement[]): {
  prefix: t.Statement[];
  fnLike: t.Statement[];
  suffixRest: t.Statement[];
} {
  const exportDefaultIdx = body.findIndex((n) => n.type === 'ExportDefaultDeclaration');
  if (exportDefaultIdx >= 0) {
    const prefix = body.slice(0, exportDefaultIdx + 1);
    const after = body.slice(exportDefaultIdx + 1);
    return {
      prefix,
      fnLike: after.filter(isFnLike),
      suffixRest: after.filter((n) => !isFnLike(n)),
    };
  }

  let leadingEnd = 0;
  while (leadingEnd < body.length && isLeadingStatement(body[leadingEnd]!)) {
    leadingEnd++;
  }
  const prefix = body.slice(0, leadingEnd);
  const rest = body.slice(leadingEnd);
  return {
    prefix,
    fnLike: rest.filter(isFnLike),
    suffixRest: rest.filter((n) => !isFnLike(n)),
  };
}

/** 打乱文件顶层函数声明与 class 内方法顺序（语义不变） */
export function shuffleFunctionOrder(ast: t.File, seed: string | null): void {
  if (ast.program.body.length > 1) {
    const { prefix, fnLike, suffixRest } = partitionProgramBody(ast.program.body);
    if (fnLike.length > 1) {
      ast.program.body = [
        ...prefix,
        ...seededShuffle(fnLike, seed, 'program'),
        ...suffixRest,
      ];
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
