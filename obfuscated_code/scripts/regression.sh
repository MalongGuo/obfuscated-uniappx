#!/usr/bin/env bash
set -euo pipefail

CODE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$CODE_ROOT/.." && pwd)"
cd "$CODE_ROOT"

echo "==> 构建"
npm run build

echo "==> 单元测试"
npm test

if [ -d "$WORKSPACE_ROOT/samples/uniappx-minimal" ]; then
  echo "==> uni-app x 最小样例"
  node dist/cli.js run "$WORKSPACE_ROOT/samples/uniappx-minimal" --mode full --seed regression --verbose

  SAMPLE_OUT="$(find "$WORKSPACE_ROOT/samples" -maxdepth 1 -type d -name 'uniappx-minimal_*' | sort | tail -1)"
  if [ -z "$SAMPLE_OUT" ]; then
    echo "✗ 未找到样例输出目录 samples/uniappx-minimal_*" >&2
    exit 1
  fi
  if ! grep -q 'showPhone' "$SAMPLE_OUT/pages/index/index.uvue" 2>/dev/null; then
    echo "✔ 样例 showPhone 已混淆"
  else
    echo "✗ 样例 showPhone 未混淆" >&2
    exit 1
  fi
else
  echo "==> 跳过样例（samples/uniappx-minimal 不存在）"
fi

if [ -d "$WORKSPACE_ROOT/whc_clone_directory/hs_uni-main" ]; then
  echo "==> hs_uni-main 回归（clone 模式）"
  HS="$WORKSPACE_ROOT/whc_clone_directory/hs_uni-main"
  rm -rf "$WORKSPACE_ROOT/whc_clone_directory"/hs_uni-main_*
  node dist/cli.js run "$HS" --mode clone --seed regression --verbose

  REG_OUT="$(find "$WORKSPACE_ROOT/whc_clone_directory" -maxdepth 1 -type d -name 'hs_uni-main_*' | sort | tail -1)"
  if [ -z "$REG_OUT" ]; then
    echo "✗ 未找到回归输出目录 whc_clone_directory/hs_uni-main_*" >&2
    exit 1
  fi
  node dist/cli.js check "$REG_OUT" --mode clone
else
  echo "==> 跳过 WHC 回归（whc_clone_directory/hs_uni-main 不存在）"
fi

echo "==> 全部回归通过"
