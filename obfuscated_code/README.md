# uniapp-x-obfuscator

UniApp / UniApp-X 源码混淆 CLI 工具（位于工作区 `obfuscated_code/` 目录）。

策略模板见 [docs/OBFUSCATION_STRATEGY.md](docs/OBFUSCATION_STRATEGY.md)，完整设计见工作区 [uniapp-x_混淆工具.plan.md](../uniapp-x_混淆工具.plan.md)。

## 安装

```bash
cd obfuscated_code
npm install
npm run build
```

## 命令

```bash
node dist/cli.js --help
node dist/cli.js init ./my-project

# 路径 clone + 静态资源（图片/hash）
node dist/cli.js run ./my-project --mode clone --verbose

# 代码混淆（标识符 + 注释，不改路径）
node dist/cli.js run ./my-project --mode code --seed my-seed --verbose

# 完整混淆（路径 + 代码 + 资源，默认 full）
node dist/cli.js run ./my-project --mode full --seed my-seed --verbose

# 预分析（均需 --mode，内容与 run 不同，见 COMMAND.md）
node dist/cli.js preload ./my-project --mode code
node dist/cli.js preload ./my-project --mode full

# 预分析（单项）
node dist/cli.js preload vocab ./my-project --mode code
node dist/cli.js preload symbols ./my-project --mode code --file pages/tabBar/component.uvue
node dist/cli.js preload sensitive ./my-project --mode code
node dist/cli.js preload paths ./my-project --mode clone

# 自查与修复（--mode 须与 run 一致）
node dist/cli.js check ./dist-output --mode clone
node dist/cli.js fix ./dist-output --mode clone
```

完整命令说明见 [COMMAND.md](COMMAND.md)。

### mode 对照

| mode | preload | run |
|------|---------|-----|
| `clone` | paths + sensitive | 路径 clone + 静态资源（图片/hash） |
| `code` | vocab + symbols + sensitive | 代码混淆 + uvue/css 资源变换 |
| `full` | 以上全部 | 路径 + 静态资源 + 代码 + 资源变换 |

### run 常用参数

> **注意**：`obfuscator.config.json` 默认 `mode: "full"`。子命令的 `--mode` 会覆盖配置文件；测试 clone/code 时务必显式传入。

| 参数 | 说明 |
|------|------|
| `--mode clone \| code \| full` | 覆盖配置 mode |
| `--preset light \| medium \| heavy` | 混淆强度（iOS 建议 light） |
| `--scope precise \| full` | precise 仅业务目录；full 扩大范围 |
| `--seed <seed>` | 固定随机种子，便于对比 |
| `--verbose` | 逐文件变更明细 |
| `--no-log` | 不生成 `obfuscated/config/` 分阶段诊断日志 |
| `--no-map` | 不生成映射文件 |

## 输出目录

默认输出到**与项目同级**的目录，格式：

```text
{项目名称}_{YYYYMMDD}_{HHmmss}_{token}/
```

示例：`uni-starter-x_20260606_114623_abcToken123/`

原项目不会被修改。

## obfuscated 目录

工具在**源项目根目录**下创建 `obfuscated/`，存放配置与运行日志，不污染业务源码（复制/扫描时会自动排除 `obfuscated/**`）：

```text
{项目根}/obfuscated/
└── config/          # 白名单、报告、映射与运行日志
```

| 文件 | 位置 | 来源命令 |
|------|------|----------|
| `whitelist.json` | `config/` | 首次 run/preload 自动生成 |
| `{mode}-vocab.json` | `config/` | `preload vocab` / `preload --mode code\|full` |
| `{mode}-symbols.json` | `config/` | `preload symbols` / `preload --mode code\|full` |
| `{mode}-sensitive.json` | `config/` | `preload sensitive` / 各 mode preload |
| `{mode}-paths.json` | `config/` | `preload paths` / `preload --mode clone\|full` |
| `obfuscation-check-report.json` | `config/` | `check` |

内置符号白名单：`obfuscated_code/config/whitelist-symbols-uniappx.json`（生命周期、保留字、框架前缀）。

`obfuscator.config.json` 位于 `{项目}/obfuscated/`（`init` 生成；加载时兼容项目根旧路径）。

## 运行产物（obfuscated/config/）

映射 JSON 与诊断日志统一写入 `{项目根}/obfuscated/config/`，不写入混淆输出目录。

默认开启分阶段日志（`generateLog: true`）。关闭后不会生成解析/诊断类文件（映射 JSON 仍由 `generateMap` 控制）：

```json
"generateLog": false
```

或命令行：`--no-log`

| 文件 | 阶段 |
|------|------|
| `{mode}-uts-parse.json` | run Preload：uniappx 解析（UTS/uvue） |
| `{mode}-other-parse.json` | run Preload：其它文件解析 |
| `{mode}-symbols-collect.json` | run Preload：符号收集 |
| `{mode}-naming-allocate.log.txt` | Transform：混淆名分配 |
| `{mode}-file-obfuscate.log.txt` | Transform：逐文件混淆详情 |
| `{mode}-obfuscation-map-*.json` | 符号/路径/字符串映射 |
| `{mode}-all-changes.md` | **全部变更可读清单**（标识符 + CSS class + 逐文件明细） |
| `{mode}-css-class-map.json` | CSS class 原名 → hash 映射 |
| `{mode}-comment-strip.log.txt` | **第二层**：注释清理文件列表 |
| `{mode}-string-encrypt.log.txt` | **第三层**：字符串加密逐文件摘要 |
| `{mode}-obfuscation-map-strings.json` | **第三层**：字符串完整映射 |
| `clone-log.txt` | 路径混淆日志（clone/full） |
| `obfuscation-log.txt` | 运行摘要 |

终端是否打印不影响上述文件的生成。

## 并发

启动时打印阶段并发一览表（`总结`），clone 模式三阶段均使用 `mapPool` 并行：

| 阶段 | 说明 |
|------|------|
| 文件复制 | 并行复制 |
| 目录重命名 | 按深度分组，同层并行 |
| 内容路径替换 | 并行替换文本文件 |

并行度 = `ceil(CPU核数/2)` 向上取偶。

## 路径锚点配置

在目标项目的 `obfuscator.config.json` 中配置：

| 配置项 | 作用 |
|--------|------|
| `rootAnchorDirs` | 根级目录不改名（`pages`、`static`、`uni_modules`、`components` 等） |
| `rootAnchorFiles` | 根级文件不改名（`main.uts`、`App.uvue`、`pages.json` 等） |
| `pathWhitelist` | 路径白名单，跳过混淆 |
| `exclude` | 复制时忽略的目录 |

子目录仍会混淆，例如 `pages/s/home/` → `pages/s/{token}home/`。

## 功能开关（features）

`obfuscator.config.json` 中 **默认全部 `true`（全开）**，与竞品 GUI 全选一致。可按需关闭单项；`--preset light` 会关闭高强度项。

| 开关 | 说明 | 实现阶段 |
|------|------|---------|
| `simulateManual` | `namingStyle: human` 模拟人工命名 | MVP ✅ |
| `classFilePrefix` | 目录 token 前缀（路径混淆） | MVP ✅ |
| `stripComments` | 安全注释清理 | MVP ✅ |
| `renameFuncPropVarEnum` | 标识符重命名 | MVP ✅ |
| `renameFilenames` | 同名文件随目录重命名 | MVP ✅ |
| `resourceHash` | 资源 hash 翻新（clone/full 路径阶段） | MVP ✅ |
| `renameImageNames` | 图片文件名混淆（clone/full 路径阶段） | MVP ✅ |
| `encryptAllStrings` | 字符串加密 | 二期 |
| `ciphertextStrings` | 密文字符串形式 | 二期 |
| `insertJunkFuncProp` | 垃圾函数/属性 | 二期 |
| `enhancedUiJunkCode` | UI 垃圾节点 | 二期 |
| `shuffleFuncOrder` | 打乱定义顺序 | 二期 |
| `disruptExecOrder` | 扰乱执行顺序 | 二期 |
| `renameProtocol` | interface/type 协议名 | 二期 |
| `useNewJunkCode` | 新垃圾代码引擎 | 三期 |
| `controlFlowFlatten` | 控制流平坦化（函数体 `if (true)` 包裹） | 二期 |
| `colorNudge` | CSS 颜色值微扰 | 二期 |

## JS/UTS 混淆分层（建议逐个开）

测试 JS/UTS 混淆时，建议按层递进：每层跑通后再开下一层。`--mode code` 下仅影响代码，不改路径。

### 第一层（最安全，建议先试）

| 开关 | 值 | 作用 |
|------|-----|------|
| `renameFuncPropVarEnum` | `true` | **标识符重命名**：混淆函数名、局部变量、对象属性、`this.xxx` 引用等 |

**具体行为**

- **Script / UTS**：业务代码标识符改为 hash 名
- **Template 联动**：`{{ xxx }}`、`:prop="xxx"`、事件绑定等同名标识符同步改
- **Class 联动**：`.class-name` 与 script 选择器字符串同步（配合 `enhancedUiJunkCode` 时 CSS class 已 hash）

**自动跳过（不改）**

- Vue 选项键：`data`、`methods`、`computed`、`props` 等
- UniApp 保留键：`globalData`
- API 字面量键（如 `url`、`method`，见 `config/api-literal-keys.json`）
- `v-for` 别名、props 定义键
- import 路径、字符串字面量

**风险**：低。JS 混淆基线，建议第一个开。

---

### 第二层（注释清理）

需 **同时** 满足两个条件才会真正删注释：

| 开关 | 值 | 作用 |
|------|-----|------|
| `stripComments` | `true` | 启用注释清理 |
| `commentStrip.enabled` | `true` | 执行删注释（与上项同时为 `true` 才生效） |

**子配置**

| 开关 | 推荐 | 作用 |
|------|------|------|
| `commentStrip.safeMode` | `true` | 跳过字符串、正则、条件编译 `#ifdef` 内的注释样式文本 |

**具体行为**：删除 `//`、`/* */`；保留 `#ifdef` / `#ifndef` / `#endif` 条件编译指令注释。

**风险**：低。主要减体积、增阅读难度。

---

### 第三层（字符串加密）

| 开关 | 值 | 作用 |
|------|-----|------|
| `encryptAllStrings` | `true` | 字符串字面量加密为 `String.fromCharCode(...)` |

备选：`ciphertextStrings: true` 与 `encryptAllStrings` 共用同一加密 pipeline。

**子配置 `stringEncrypt`**

| 开关 | 作用 |
|------|------|
| `whitelist` | 以这些前缀开头的字符串不加密（如 `uni.`、`plus.`、`UTS`） |
| `autoEncryptHttp` | `true` 加密 `http(s)://` URL；`false` 跳过 |
| `skipCaseLabels` | 跳过 `switch case` 里的字符串 |
| `skipAnnotations` | 跳过 TS 类型注解里的字符串 |
| `skipTemplateStrings` | 是否处理模板字符串 |

**自动跳过**

- import / require 路径
- 对象字面量 key
- CSS 选择器字符串
- 长度 > 64 的字符串
- 框架/API 相关字面量（如 `position`、`method` 等）

**风险**：中。可能影响依赖字符串字面量的 API、路由、条件判断，需在上一层稳定后测试。

---

### 第四层（强度更高，易出运行时问题）

6 个开关建议 **逐个开、逐个测**，不要一次全开。

| 开关 | 作用对象 | 作用 | 风险 |
|------|----------|------|------|
| `insertJunkFuncProp` | Script | 文件末尾插入无用函数并调用；class 内插入无用 method | 低～中 |
| `shuffleFuncOrder` | Script | 打乱顶层 function/class 声明顺序；打乱 class 内 method 顺序 | 低 |
| `disruptExecOrder` | Script | 函数体内打乱连续表达式语句顺序 | **高** |
| `controlFlowFlatten` | Script | 函数体包进 `if (true) { ... }`（轻量控制流混淆） | 低～中 |
| `useNewJunkCode` | Template | 在 `<template>` 根节点插入 3～5 个隐藏 junk 节点 | 低～中 |
| `renameProtocol` | Script (TS) | 额外混淆 `interface` / `type` / `enum` 名；**须** 同时开 `renameFuncPropVarEnum` | 中～高 |

**Script pipeline 顺序**（第四层相关部分）：

```text
shuffleFuncOrder → rename（含 renameProtocol）→ disruptExecOrder
→ insertJunkFuncProp → encryptAllStrings → controlFlowFlatten → 输出
```

`useNewJunkCode` 单独作用于 template，不在上述 script pipeline 内。

---

### 各层最少配置一览

| 层级 | 必开开关 | 配套子配置 |
|------|----------|------------|
| 第一层 | `renameFuncPropVarEnum: true` | — |
| 第二层 | `stripComments: true` + `commentStrip.enabled: true` | 建议 `commentStrip.safeMode: true` |
| 第三层 | `encryptAllStrings: true` | `stringEncrypt.*` 按需 |
| 第四层 | 6 项按需逐个开 | `renameProtocol` 依赖第一层 |

**示例：仅测第一层（保留 CSS 混淆）**

```json
{
  "features": {
    "enhancedUiJunkCode": true,
    "renameFuncPropVarEnum": true,
    "stripComments": false,
    "encryptAllStrings": false,
    "insertJunkFuncProp": false,
    "shuffleFuncOrder": false,
    "disruptExecOrder": false,
    "controlFlowFlatten": false,
    "useNewJunkCode": false,
    "renameProtocol": false
  },
  "commentStrip": { "enabled": false, "safeMode": true },
  "generateMap": true
}
```

每次 `run --mode code` 且 `generateMap: true`（默认开启）时，会自动生成：

- `{mode}-all-changes.md` — 全部变更可读清单
- `{mode}-css-class-map.json` — CSS class 映射
- `{mode}-obfuscation-map-*.json` — 符号分类映射
- `{mode}-file-obfuscate.log.txt` — 逐文件重命名 JSON

产物写入**源项目** `{项目}/obfuscated/config/`，并在 run 结束时同步到**混淆输出目录**的 `obfuscated/config/`。

```bash
node dist/cli.js run ../uni-starter-x --mode code --verbose
```

## 实际执行能力

`run` 结束时会打印**实际执行**摘要（与 GUI 勾选或 preset 名称无关）。**全开且 `--mode full`** 时示例：

```text
实际执行:
  [✓] 模拟人工命名
  [✓] 资源 hash 翻新
  [✓] 目录 token 前缀
  [✓] 注释清理
  [✓] 文件名混淆
  [✓] 图片名混淆
  [✗] 字符串加密 (二期功能，当前版本尚未实现)
  [✓] 标识符重命名
  [✗] UI 垃圾节点 (二期功能，当前版本尚未实现)
  [✗] 打乱定义顺序 (二期功能，当前版本尚未实现)
  [✗] 扰乱执行顺序 (二期功能，当前版本尚未实现)
  [✗] 新垃圾代码引擎 (三期功能，当前版本尚未实现)
  [✗] 密文字符串 (二期功能，当前版本尚未实现)
  [✗] 协议名混淆 (二期功能，当前版本尚未实现)
  [✗] 垃圾函数/属性 (二期功能，当前版本尚未实现)
```

`--mode code` 时路径类为 `[✗]`（路径混淆未执行），代码类在开启时多为 `[✓]`。二期/三期项即使配置为 `true`，也会显示 `[✗]` 并注明尚未实现。

| 标记 | 含义 |
|------|------|
| `[✓]` | 本次流水线已执行 |
| `[✗]` | 未执行；原因见括号（模式限制 / 二期三期待实现 / 配置已关闭） |

全开示例命令：

```bash
node dist/cli.js run ./my-project --mode full --preset heavy --verbose
```

## 开发状态（MVP）

| Sprint | 内容 | 状态 |
|--------|------|------|
| 0–4 | CLI + 解析 + 符号重命名 | ✅ |
| 5 | check + 映射日志 + 并行 | ✅ |
| 6 | UTS fallback + 样例 + 文档 | ✅ |

二期：字符串加密、垃圾代码、控制流平坦化、密文字符串、协议名混淆等（见上表 `[✗]` 项）。

## 测试

### 单元测试与回归

```bash
npm test
bash scripts/regression.sh
```

### 分阶段测试（以 `../uni-test` 为例）

工作区根目录 [README.md](../README.md) 有完整 Sprint 流程说明。常用命令：

```bash
SRC=../uni-test
CLI=dist/cli.js

# Sprint 2：路径混淆 → check → fix
node $CLI run $SRC --mode clone --seed test-clone --verbose
OUT=$(ls -dt ../uni-test_* | head -1)
node $CLI check "$OUT" --mode clone && node $CLI fix "$OUT" --mode clone && node $CLI check "$OUT" --mode clone

# Sprint 3：预分析（源项目，按 mode）
node $CLI preload $SRC --mode code
node $CLI preload symbols $SRC --mode code --file pages/tabBar/component.uvue
node $CLI preload paths $SRC --mode clone

# Sprint 4：代码混淆（code 模式，不改路径）
node $CLI run $SRC --mode code --seed test-code --verbose
OUT=$(ls -dt ../uni-test_* | head -1)

# Sprint 4b：完整混淆（full = 路径 + 代码）
node $CLI run $SRC --mode full --seed test-full --verbose
OUT=$(ls -dt ../uni-test_* | head -1)

# Sprint 5：check + fix + 敏感扫描
node $CLI check "$OUT" --mode code
node $CLI fix "$OUT" --mode code
node $CLI preload sensitive $SRC --mode code

# Sprint 6：HBuilderX 打开 $OUT 编译运行（人工）
```

### check / fix 说明

| 命令 | 输入 | 检查/修复内容 |
|------|------|--------------|
| `check --mode clone` | clone 输出目录 | 路径冲突、路由、残留旧路径 |
| `check --mode code` | code 输出目录 | 路由、符号覆盖率（跳过路径残留） |
| `check --mode full` | full 输出目录 | 以上全部 |
| `fix --mode clone\|full` | 混淆输出目录 | pages.json 路由、组件标签、相对 import |
| `fix --mode code` | code 输出目录 | 自动跳过（无路径修复） |

报告写入 `{源项目}/obfuscated/config/obfuscation-check-report.json`；映射表从 `{源项目}/obfuscated/config/` 自动读取（对混淆输出目录执行 `check` 时会回溯源项目名查找；兼容旧版 `obfuscated/logs/`、`log/`、`obfuscated_config/`）。

## 产出物（输出目录内）

混淆输出目录**仅含混淆后的项目源码**，不再写入 `clone-log.txt` 或 `obfuscation-map-*.json`。

映射与路径日志见 `{源项目}/obfuscated/config/`；`check` 会自动从此处读取（兼容旧版 `obfuscated/logs/`、`log/`、`obfuscated_config/`）。
