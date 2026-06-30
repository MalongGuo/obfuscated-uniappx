# Clone 模式已知问题（待修复）

> 记录时间：2026-06-30  
> 当前验证产物：`uni-starter-x_glN5Al98DrxhFBmj`（seed `uni-starter-clone-v5`）  
> 混淆器本地改动：**未提交**（见文末「代码侧已改」）

---

## 总览

| 问题 | 现象 | 根因 | 代码修复 | 产物需重跑 clone |
|------|------|------|----------|------------------|
| tabbar_icon | H5 底部 Tab 图标裂图/404 | 三级 static 路径目录映射只应用一层 | ✅ `rename-images.ts` | ✅ 是 |
| 页面点击无法跳转 | `uni.navigateTo` 无效，Tab 可切但首页卡片/分类点击不跳页 | 路径替换边界不含 `?`，query 导致路由 leaf 未混淆 | ✅ `replacer.ts` | ✅ 是 |

README 测试状态：Clone 主流程 ✅；子项 **tabbar_icon** ❌（本文件 Issue #1）。

---

## Issue #1：tabbar_icon（三级 static 图片）

### 现象

- u 端 tabBar 配置在 `pages.json` 中路径已混淆，例如：
  `static/glN5Al98DrxhFBmju/glN5Al98DrxhFBmjtabbar/glN5Al98DrxhFBmjhome.png`
- 磁盘实际文件仍为未混淆文件名：
  `static/.../glN5Al98DrxhFBmjtabbar/home.png`
- H5 表现：底部 Tab 部分图标显示裂图（Playwright 统计 clone 端 broken imgs 5 vs source 0）

### 根因

`obfuscated_code/src/transforms/rename-images.ts` 中 `applyDirRenameMap()` 原先匹配一层目录映射后即 `break`，对 `static/u/tabbar/home.png` 这类**嵌套两层以上**的 static 子目录：

1. 目录重命名在磁盘上正确（deepest-first 执行）
2. 但 `planImageFileRenames` 计算的 `moveFrom` 路径错误
3. `executeImageFileRenames` 找不到源文件，**静默跳过**文件名 token 化
4. `renameLog` 仍写入混淆后路径 → 内容替换把 `pages.json` 改成不存在的路径

### 代码修复（本地已有，未提交）

- 文件：`src/transforms/rename-images.ts`
- 改动：`applyDirRenameMap` 改为多轮应用全部目录映射（while 循环）
- 测试：`tests/rename-images.test.ts`
  - `三级 static 子目录（static/u/tabbar）文件名也加 token`
  - `嵌套两层 static 子目录映射全部应用`

### 待办

```bash
cd obfuscated_code && npm test -- tests/rename-images.test.ts -t "tabbar|嵌套两层"
# 重跑 clone 后验证：
#   ls uni-starter-x_{token}/static/*/tabbar/   # 文件名应带 token
#   grep iconPath uni-starter-x_{token}/pages.json
```

---

## Issue #2：页面点击无法跳转（navigateTo + query）

### 现象

- **TabBar 切换正常**（首页 / 分类 / 订单 / 我的）
- **页面内点击跳转失败**，例如首页点击「家庭保洁」：
  - 源码（5180）：`http://localhost:5180/pages/u/category/service-list/service-list?categoryId=...` ✅
  - 混淆 v5（5178）：URL 仍为 `http://localhost:5178/`，未发生路由变化 ❌

### 根因

混淆产物 `home.uvue` 中 `uni.navigateTo` 的 url **路径不一致**：

```text
# 错误（v5 产物）
/pages/.../glN5Al98DrxhFBmjservice-list/service-list?categoryId=

# 正确（pages.json 注册路径）
/pages/.../glN5Al98DrxhFBmjservice-list/glN5Al98DrxhFBmjservice-list?categoryId=
```

`obfuscated_code/src/path/replacer.ts` 中 `replacePathSegment` 的路径边界为：

```ts
const SEGMENT_BOUNDARY = /[/"'`.]/;  // 旧：不含 ?
```

对 `.../service-list?categoryId=` 这类字符串，`service-list` 后紧跟 `?`，不满足 lookahead，导致：

1. 完整路由 `pages/u/category/service-list/service-list` 无法一次性替换
2. 仅中间目录段被替换，**leaf 段 `service-list` 留在 query 前**

同类影响：`service-details?id=`、带 `&` 的拼接 url 等。

### 代码修复（本地已有，未提交）

- 文件：`src/path/replacer.ts`
- 改动：`SEGMENT_BOUNDARY` 增加 `?`、`#`、`&`
- 测试：`tests/replacer-route.test.ts`
  - `updates navigateTo url when route is followed by query string`

### 待办

```bash
cd obfuscated_code && npm test -- tests/replacer-route.test.ts -t "query string"
# 重跑 clone 后验证 home.uvue：
rg 'navigateTo|service-list' uni-starter-x_{token}/pages/*/home/*.uvue
# leaf 段应为 glN5...service-list，不能残留裸 service-list
```

---

## 重跑 clone 命令（修复后一次性验证）

```bash
cd obfuscated_code
npm run build
npm test   # 或至少 rename-images + replacer-route

node dist/cli.js run ../uni-starter-x \
  --mode clone \
  --config ../uni-starter-x/obfuscated/obfuscator.config.full.json \
  --seed uni-starter-clone-v6 \
  --verbose

node dist/cli.js check --mode clone ../uni-starter-x_{token}
```

H5 验证：

```bash
cd uni-starter-x_{token} && npm run app:u
# HBuilderX cli launch web --project uni-starter-x_{token}
# 1. Tab 图标是否正常
# 2. 首页点击分类卡片是否跳转到 service-list
```

---

## 代码侧已改（工作区，未 commit）

| 文件 | 说明 |
|------|------|
| `obfuscated_code/src/transforms/rename-images.ts` | 多级 static 目录映射 |
| `obfuscated_code/src/path/replacer.ts` | query 边界 |
| `obfuscated_code/tests/rename-images.test.ts` | tabbar 三级路径回归 |
| `obfuscated_code/tests/replacer-route.test.ts` | navigateTo + query 回归 |
| `README.md` | Clone ✅ / tabbar_icon ❌ |

**注意**：`uni-starter-clone-v6` 重跑曾启动但被中断；当前 H5 仍指向 v5 产物 `glN5Al98DrxhFBmj`，**不会**自动获得上述修复。

---

## 非 clone 特有问题（可忽略）

- H5 外部浏览器 CORS：`api.ls.love1hd.site` 跨域（源码与混淆均有，不影响路由跳转对比）
- `test:loading:compare` 两端同败（loading overlay 检测时序，非 clone 回归）
