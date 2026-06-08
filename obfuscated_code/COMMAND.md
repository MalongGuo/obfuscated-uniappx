# CLI 命令速查

入口：`obfuscated_code/` 目录下执行 `node dist/cli.js`。

```bash
cd obfuscated_code
npm install && npm run build
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `run <project>` | 混淆流水线：Preload 解析 + Transform（clone / code / full） |
| `init [project]` | 生成 `obfuscated/obfuscator.config.json`（features 全开） |
| `check <project>` | 提交前自查（`--mode` 须与 run 一致） |
| `fix <project>` | 修复混淆输出（clone/full：路由与 import） |
| `preload <project> --mode <mode>` | **必需 `--mode`**：按 mode 预分析（见下表） |
| `preload vocab <project> --mode <mode>` | 仅词汇表 → `{mode}-vocab.json` |
| `preload symbols <project> --mode <mode>` | 仅符号表 → `{mode}-symbols.json` |
| `preload sensitive <project> --mode <mode>` | 仅敏感字符串 → `{mode}-sensitive.json` |
| `preload paths <project> --mode <mode>` | 仅路径审计 → `{mode}-paths.json` |

> **preload 与 run 不同**：`preload` 做词汇/符号/路径等**预分析**；`run` 另含 Preload 解析（`*-parse.json`）和实际混淆。

---

## mode 对照

### preload `--mode`

| mode | 内容 | 产物 |
|------|------|------|
| `clone` | 路径审计 + 敏感字符串 | `clone-paths.json`、`clone-sensitive.json` |
| `code` | 词汇 + 符号 + 敏感字符串 | `code-vocab.json`、`code-symbols.json`、`code-sensitive.json` |
| `full` | 以上全部 | `full-*.json`（四类） |

### run `--mode`

| mode | 内容 |
|------|------|
| `clone` | Preload 解析 + **路径 clone + 静态资源**（图片重命名、资源 hash） |
| `code` | Preload 解析 + **代码混淆 + uvue/css 资源变换** |
| `full` | Preload 解析 + **路径 clone + 静态资源 + 代码混淆 + 资源变换**（全部） |

---

## 常用示例

### 帮助与初始化

```bash
node dist/cli.js --help
node dist/cli.js run --help
node dist/cli.js preload --help

node dist/cli.js init ./my-project
node dist/cli.js init ../uni-test
```

### 预分析 preload（均需 `--mode`）

```bash
# 一次跑完该 mode 的全部预分析项
node dist/cli.js preload ../uni-test --mode clone
node dist/cli.js preload ../uni-test --mode code
node dist/cli.js preload ../uni-test --mode full

# 单项
node dist/cli.js preload vocab ../uni-test --mode code
node dist/cli.js preload symbols ../uni-test --mode code --file pages/tabBar/component.uvue
node dist/cli.js preload sensitive ../uni-test --mode code
node dist/cli.js preload paths ../uni-test --mode clone
```

### 混淆 run

```bash
# 路径 clone + 静态资源（图片/hash）
node dist/cli.js run ../uni-test --mode clone --verbose

# 代码混淆（不改路径）
node dist/cli.js run ../uni-test --mode code --seed my-seed --verbose

# 全部（路径 + 代码 + 资源）
node dist/cli.js run ../uni-test --mode full --seed my-seed --verbose
```

### 自查与修复

`check` / `fix` 的 `--mode` 须与 `run` 时一致，否则默认 `full`。

```bash
OUT=../uni-test_20260607_100900_eYjC8DPpnIj0qveV

node dist/cli.js check "$OUT" --mode clone
node dist/cli.js fix "$OUT" --mode clone

node dist/cli.js check "$OUT" --mode code
node dist/cli.js fix "$OUT" --mode code

node dist/cli.js check "$OUT" --mode full
node dist/cli.js fix "$OUT" --mode full
```

---

## 分阶段工作流（uni-test）

```bash
SRC=../uni-test
CLI=dist/cli.js

# Sprint 2：路径混淆 → check → fix
node $CLI run $SRC --mode clone --seed test-clone --verbose
OUT=$(ls -dt ../uni-test_* | head -1)
node $CLI check "$OUT" --mode clone
node $CLI fix "$OUT" --mode clone
node $CLI check "$OUT" --mode clone

# Sprint 3：预分析（源项目，按 mode）
node $CLI preload $SRC --mode code
node $CLI preload symbols $SRC --mode code --file pages/tabBar/component.uvue
node $CLI preload paths $SRC --mode clone

# Sprint 4：代码混淆
node $CLI run $SRC --mode code --seed test-code --verbose
OUT=$(ls -dt ../uni-test_* | head -1)

# Sprint 4b：完整混淆
node $CLI run $SRC --mode full --seed test-full --verbose
OUT=$(ls -dt ../uni-test_* | head -1)

# Sprint 5：check + fix + 敏感扫描
node $CLI check "$OUT" --mode code
node $CLI fix "$OUT" --mode code
node $CLI preload sensitive $SRC --mode code

# Sprint 6：HBuilderX 打开 $OUT 编译运行（人工）
```

---

## run 常用参数

> `obfuscator.config.json` 默认 `mode: "full"`。`--mode` 会覆盖配置文件；测试 clone/code 时务必显式传入。

| 参数 | 说明 |
|------|------|
| `--mode clone \| code \| full` | 混淆模式 |
| `--preset light \| medium \| heavy` | 混淆强度（iOS 建议 light） |
| `--scope precise \| full` | precise 仅业务目录；full 扩大范围 |
| `--seed <seed>` | 固定随机种子 |
| `-v, --verbose` | 逐文件变更明细 |
| `--no-map` | 不生成映射 JSON |
| `--no-log` | 不生成分阶段诊断日志 |
| `-c, --config <path>` | 指定配置文件 |
| `-o, --output <dir>` | 输出目录名 |
| `--force-new` | 强制生成新混淆名 |
| `--stable` | 稳定映射模式 |

## preload / init / check / fix 常用参数

| 参数 | 说明 |
|------|------|
| `--mode clone \| code \| full` | **preload 必需**；check/fix/init 可选覆盖 |
| `-c, --config <path>` | 配置文件路径 |
| `--seed <seed>` | 随机种子 |
| `--preset light \| medium \| heavy` | 混淆预设 |
| `-f, --file <path>` | 仅 `preload symbols`：额外打印单文件符号 |

---

## 白名单体系

| 来源 | 路径 | 作用 |
|------|------|------|
| 工具内置 | `obfuscated_code/config/whitelist-symbols-uniappx.json` | 生命周期、保留字、框架 API 前缀 |
| 项目配置 | `{项目}/obfuscated/obfuscator.config.json` | `pathWhitelist`、`sensitiveStrings`、`features` |
| 项目白名单 | `{项目}/obfuscated/config/whitelist.json` | 项目额外 `symbols`、`pathPatterns`（生成时为空，手动追加） |

路径白名单 = `config.pathWhitelist` + `whitelist.json.pathPatterns`（合并去重）。

---

## 输出说明

| 类型 | 位置 |
|------|------|
| 混淆输出项目 | 与源项目同级：`{项目名}_{YYYYMMDD}_{HHmmss}_{token}/` |
| 映射 / 诊断 / 白名单 | 源项目：`obfuscated/config/` |
| 主配置 | 源项目：`obfuscated/obfuscator.config.json` |

### preload 产物（`obfuscated/config/`）

| 文件 | 来源 |
|------|------|
| `{mode}-vocab.json` | preload vocab / preload --mode code\|full |
| `{mode}-symbols.json` | preload symbols / preload --mode code\|full |
| `{mode}-sensitive.json` | preload sensitive / 各 mode preload |
| `{mode}-paths.json` | preload paths / preload --mode clone\|full |

### run 诊断产物（`obfuscated/config/`）

| 文件 | 阶段 |
|------|------|
| `{mode}-uts-parse.json` | Preload：UTS/uvue 解析 |
| `{mode}-other-parse.json` | Preload：其它文件解析 |
| `{mode}-symbols-collect.json` | Preload：符号收集 |
| `{mode}-naming-allocate.log.txt` | Transform：混淆名分配 |
| `{mode}-file-obfuscate.log.txt` | Transform：逐文件混淆 |
| `{mode}-obfuscation-map-*.json` | 符号/路径/字符串映射 |
| `clone-log.txt` | 路径混淆日志（clone/full） |
| `obfuscation-log.txt` | 运行摘要 |

混淆输出目录**不含**映射 JSON 与 `clone-log.txt`。
