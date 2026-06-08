# 混淆策略模板

> 填写本文件后，配合 `obfuscator.config.json` 使用。适用于 uni-app / uni-app x 项目。

## 项目信息

| 字段 | 值 |
|------|-----|
| 项目名称 | |
| 框架版本 | uni-app / uni-app x |
| 目标平台 | app-android / app-ios / mp-weixin |
| 审核要求 | iOS 轻量 / 全量保护 |

## 推荐模式

| 场景 | 模式 | 预设 | 说明 |
|------|------|------|------|
| 首次尝试 | `clone` | - | 路径 clone + 静态资源，风险最低 |
| 代码保护 | `code` | `medium` | 标识符 + 注释，不改路径（HBuilderX 验证推荐） |
| 日常保护 | `full` | `medium` | 路径 + 静态资源 + 标识符 + 注释（**默认**） |
| iOS 上架 | `code` | `light` | 不改路径，避免审核路由问题 |
| 重度保护 | `full` | `heavy` | 二期功能就绪后启用 |

## preload 与 run

| 命令 | 作用 | 典型产物（`obfuscated/config/`） |
|------|------|----------------------------------|
| `preload --mode clone` | 路径审计 + 敏感字符串扫描 | `clone-paths.json`、`clone-sensitive.json` |
| `preload --mode code` | 词汇 + 符号 + 敏感字符串 | `code-vocab.json`、`code-symbols.json`、`code-sensitive.json` |
| `preload --mode full` | 以上全部 | `full-*.json` |
| `run --mode *` | Preload 解析 + Transform 混淆 | `{mode}-uts-parse.json`、`{mode}-symbols-collect.json`、映射 JSON |

`preload` 为可选预分析；`run` 会独立执行 Preload 解析阶段并写入 parse/collect 文件。

## 白名单策略

### 必须保留

- 生命周期：`onLoad`、`onShow`、`mounted` 等
- 框架 API：`uni.*`、`plus.*`、`UTS*`
- Tab 页物理路径：`pages.json` tabBar 关联页
- 路径冲突页：`pages/xxx.vue` + `pages/xxx/` 共存时保留根级页
- 根锚点目录：`pages`、`static`、`uni_modules`、`components`（见 `rootAnchorDirs`）
- 根锚点文件：`main.uts`、`App.uvue`、`pages.json` 等（见 `rootAnchorFiles`）

### 建议保留

- 官方 `uni_modules/uni-*`
- UI 框架：`vk-uview-ui`
- 配置目录：`common/config/**`

### 项目定制

在 `{项目}/obfuscated/config/whitelist.json` 中追加：

- `symbols`：项目额外保留的符号名（生成时为空）
- `pathPatterns`：项目路径白名单（生成时为空）

内置 UniApp-X 词表见工具包 `config/whitelist-symbols-uniappx.json`；`obfuscator.config.json` 的 `pathWhitelist` 与 `sensitiveStrings` 与项目白名单合并使用。

## 执行流程

```bash
node dist/cli.js init ./your-project
node dist/cli.js preload ./your-project --mode full    # 可选：预分析
node dist/cli.js run ./your-project --mode full --seed <固定种子> --verbose
node dist/cli.js check ./your-project_20260606_120000_<token> --mode full
node dist/cli.js fix ./your-project_20260606_120000_<token> --mode full
```

## 产出物

| 文件 | 用途 |
|------|------|
| `{项目}_{时间}_{token}/` | 混淆后项目副本（与项目同级） |
| `obfuscated/config/clone-log.txt` | 路径混淆人类可读日志 |
| `obfuscated/config/{mode}-obfuscation-map-*.json` | 路径/符号/字符串映射 |
| `obfuscated/config/{mode}-vocab.json` 等 | preload 预分析产物 |
| `obfuscated/config/{mode}-uts-parse.json` 等 | run Preload 解析产物 |
| `obfuscated/config/obfuscation-log.txt` | 运行摘要 |

## 回滚方案

1. 原项目未被修改，直接删除输出目录
2. 保留 `obfuscation-map-*.json` 用于问题排查
3. 使用 `--seed` 固定种子可复现同名混淆结果

## 已知限制（MVP）

- 字符串加密、垃圾代码、控制流平坦化：二期
- 跨文件 export 符号默认保留（`keepExports: true`）
- HBuilderX 编译验证需人工执行
