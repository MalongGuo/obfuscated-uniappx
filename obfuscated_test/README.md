# obfuscated_test

uni-starter-x **源码 vs 混淆产物** Web 路由对比测试（Phase1 冒烟 + Phase3 交互爬链）。

## 前置条件

1. 两个 Dev Server 已启动（HBuilderX `cli launch web`），端口**不固定**（5173 起自动递增）
2. 均为 **u 端**（各项目根目录 `npm run app:u`）
3. 捕获端口写入 `config/dev-ports.json`：

```bash
cd obfuscated_test
npm run capture:dev-ports
# 或: node scripts/capture-dev-ports.mjs --source-url http://localhost:5174 --obfuscated-url http://localhost:5173
```

`defaults.json` 中 `baseA` / `baseB` 为 `"auto"` 时，测试脚本从 `dev-ports.json` 读取地址。

## 安装

```bash
cd obfuscated_test
npm install
npx playwright install chromium
```

## 配置

```bash
cp config/defaults.example.json config/defaults.json
cp config/dev-ports.example.json config/dev-ports.json   # 再按本机端口修改
```

## 浏览器行为

- **不用 `page.goto` 直跳各路由**：仅首次 `goto` 应用入口 `/#/`，之后通过 Tab 点击 + 页面内元素导航
- **登录**：Tab「我的」→「点击登录」；有头模式可在浏览器内手动登录
- **compare 模式**：源码与混淆各需登录一次（不同端口 localStorage 不共享）
- 无头 / CI：`--no-prompt-login` + `defaults.json` 账号自动填表

## 运行

```bash
# 1. 双端 H5 启动后捕获端口
npm run capture:dev-ports

# 2. 完整对比（冒烟 + 爬链 + 截图 + diff）
npm run test:compare

# 其它
npm run test:login
npm run test:smoke
npm run test:loading:compare
```

## 产出

| 路径 | 说明 |
|------|------|
| `reports/route-compare.md` | Markdown diff 报告 |
| `reports/route-compare.json` | 结构化结果 |
| `screenshots/source/` | 源码端截图 |
| `screenshots/obfuscated/` | 混淆端截图 |
| `screenshots/index.html` | **并排对比画廊（必看）** |

## CLI

```bash
node scripts/route-test.mjs --compare --headed \
  --base-a auto --base-b auto \
  --mobile 15002805120 --password 123456
```

也可显式指定 URL，跳过 `dev-ports.json`：

```bash
node scripts/route-test.mjs --compare --headed \
  --base-a http://localhost:5174 \
  --base-b http://localhost:5173
```
