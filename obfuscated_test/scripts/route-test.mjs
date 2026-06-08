/**
 * 路由对比测试：Phase1 全量冒烟 + Phase3 TabBar 交互爬链
 * 产物目录：obfuscated_test/reports、obfuscated_test/screenshots
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { applyDevPortsToOpts, requireDevPortsOrThrow } from "./dev-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.resolve(__dirname, "..");
const PAGE_SHOT_PREFIX = "page_";

function pageShotName(routePath) {
  return `${PAGE_SHOT_PREFIX}${safeFilename(routePath)}`;
}

const TARGET_CONFIG = {
  u: {
    pagesJson: "config/u.pages.json",
    tokenKey: "u_token",
    loginPath: "pages/u/me/login/login",
    tabLabels: ["首页", "分类", "直约", "订单", "我的"],
    publicExact: new Set([
      "pages/u/home/home",
      "pages/u/category/category",
      "pages/u/booking/booking",
      "pages/u/me/me",
      "pages/u/profile/profile",
      "pages/u/shop/shop",
      "pages/u/technician/technician",
    ]),
    publicPrefix: ["pages/u/me/login/", "pages/u/category/service-list/"],
  },
};

function loadDefaults() {
  const p = path.join(TEST_ROOT, "config", "defaults.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const d = loadDefaults();
  const opts = {
    project: d.project ?? path.resolve(TEST_ROOT, "../uni-starter-x"),
    target: d.target ?? "u",
    base: d.baseB ?? "auto",
    baseA: d.baseA ?? "auto",
    baseB: d.baseB ?? "auto",
    labelA: d.labelA ?? "source",
    labelB: d.labelB ?? "obfuscated",
    compare: false,
    compareParallel: d.compareParallel !== false,
    waitEnterBeforeCompare: d.waitEnterBeforeCompare !== false,
    phase: "all",
    mobile: process.env.ROUTE_TEST_MOBILE ?? d.mobile ?? "",
    password: process.env.ROUTE_TEST_PASSWORD ?? d.password ?? "",
    headed: d.headed !== false,
    headless: false,
    login: true,
    promptLogin: d.promptLogin,
    confirmLogin: d.confirmLogin,
    loginRetryOnFail: d.loginRetryOnFail,
    out: path.join(TEST_ROOT, "reports", "route-compare.md"),
    jsonOut: path.join(TEST_ROOT, "reports", "route-compare.json"),
    screenshotRoot: path.join(TEST_ROOT, "screenshots"),
    galleryAll: false,
    smokeWaitMs: 2500,
    crawlMaxClicks: 40,
    crawlWaitMs: 1500,
    device: d.device ?? "iPhone SE (3rd gen)",
    viewport: d.viewport ?? null,
    windowSize: d.windowSize ?? null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project") opts.project = path.resolve(argv[++i]);
    else if (arg === "--base") opts.base = argv[++i];
    else if (arg === "--base-a") opts.baseA = argv[++i];
    else if (arg === "--base-b") opts.baseB = argv[++i];
    else if (arg === "--label-a") opts.labelA = argv[++i];
    else if (arg === "--label-b") opts.labelB = argv[++i];
    else if (arg === "--compare") opts.compare = true;
    else if (arg === "--compare-parallel") opts.compareParallel = true;
    else if (arg === "--compare-sequential") opts.compareParallel = false;
    else if (arg === "--no-wait-enter") opts.waitEnterBeforeCompare = false;
    else if (arg === "--target") opts.target = argv[++i];
    else if (arg === "--phase") opts.phase = argv[++i];
    else if (arg === "--mobile") opts.mobile = argv[++i];
    else if (arg === "--password") opts.password = argv[++i];
    else if (arg === "--headed") opts.headed = true;
    else if (arg === "--headless") {
      opts.headed = false;
      opts.headless = true;
    }
    else if (arg === "--no-login") opts.login = false;
    else if (arg === "--prompt-login") opts.promptLogin = true;
    else if (arg === "--no-prompt-login") opts.promptLogin = false;
    else if (arg === "--confirm-login") opts.confirmLogin = true;
    else if (arg === "--no-confirm-login") opts.confirmLogin = false;
    else if (arg === "--login-retry") opts.loginRetryOnFail = true;
    else if (arg === "--no-login-retry") opts.loginRetryOnFail = false;
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--json-out") opts.jsonOut = argv[++i];
    else if (arg === "--screenshot-dir") opts.screenshotRoot = path.resolve(argv[++i]);
    else if (arg === "--gallery-all") opts.galleryAll = true;
    else if (arg === "--device") opts.device = argv[++i];
    else if (arg === "--viewport") {
      const raw = argv[++i];
      const [width, height] = parseSize(raw);
      opts.viewport = { width, height };
    }
    else if (arg === "--window-size") {
      const raw = argv[++i];
      const [width, height] = parseSize(raw);
      opts.windowSize = { width, height };
    }
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  if (opts.compare) opts.headed = opts.headed && !opts.headless;
  // 默认不在终端问账号密码：有头时在浏览器手动登录并自动检测
  if (opts.promptLogin == null) opts.promptLogin = false;
  if (opts.confirmLogin == null) opts.confirmLogin = opts.promptLogin === true;
  if (opts.loginRetryOnFail == null) opts.loginRetryOnFail = opts.headed && !opts.headless;
  applyDevPortsToOpts(opts, TEST_ROOT);
  requireDevPortsOrThrow(opts, TEST_ROOT);
  return opts;
}

function clearCredentialCache(opts) {
  opts._cachedMobile = null;
  opts._cachedPassword = null;
  opts._loginConfirmed = false;
}

function maskMobile(mobile) {
  if (mobile.length <= 7) return mobile;
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

function isPlaceholderPassword(password) {
  return password === "" || password === "请填写密码";
}

function hasConfiguredCredentials(opts) {
  return opts.mobile !== "" && !isPlaceholderPassword(opts.password);
}

async function promptLine(question, defaultValue = "") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultValue !== "" ? ` [${defaultValue}]` : "";
  try {
    return await new Promise((resolve) => {
      rl.question(`${question}${hint}: `, (answer) => {
        const trimmed = answer.trim();
        resolve(trimmed !== "" ? trimmed : defaultValue);
      });
    });
  } finally {
    rl.close();
  }
}

/** 终端输入密码（不回显明文，显示 *；非 TTY 时回退为普通输入） */
async function promptPassword(question) {
  if (!process.stdin.isTTY) {
    return promptLine(question, "");
  }
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  const wasPaused = stdin.isPaused();
  process.stdout.write(`${question}: `);
  try {
    return await new Promise((resolve) => {
      let password = "";
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      const onData = (ch) => {
        if (ch === "\n" || ch === "\r" || ch === "\u0004") {
          stdin.setRawMode(wasRaw ?? false);
          if (wasPaused) stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(password);
        } else if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === "\u007f" || ch === "\b") {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        } else {
          password += ch;
          process.stdout.write("*");
        }
      };
      stdin.on("data", onData);
    });
  } catch {
    return promptLine(question, "");
  }
}

async function notifyBrowserLoginDetected(page, opts, cfg, via = "token") {
  await loginScreenshot(page, opts, "03_login_success");
  const detail = via === "token" ? "token 已写入" : "页面状态已变更（未登录入口消失）";
  console.log(`\n  ✓ 检测到浏览器已登录，${detail} (${opts.base})`);
  console.log(`  当前 URL: ${page.url()}`);
  opts._loginConfirmed = true;
}

/** 轮询 localStorage token，定期提醒；检测到登录立即返回 true */
async function waitForBrowserLogin(page, cfg, opts, { maxWaitMs = 180000, intervalMs = 2000, remindEveryMs = 10000 } = {}) {
  const start = Date.now();
  let lastRemind = 0;
  while (Date.now() - start < maxWaitMs) {
    const detected = await detectBrowserLoggedIn(page, cfg);
    if (detected.loggedIn) {
      await notifyBrowserLoginDetected(page, opts, cfg, detected.via);
      return true;
    }
    const elapsed = Date.now() - start;
    if (elapsed - lastRemind >= remindEveryMs) {
      const sec = Math.round(elapsed / 1000);
      console.log(`  ⏳ 等待登录中… ${sec}s（可在浏览器页面操作，脚本每 2 秒自动检测）`);
      lastRemind = elapsed;
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
}

/**
 * 终端提问时并行监听浏览器登录；用户在页面手动登录会立即打断等待并提示。
 */
async function promptLineWithBrowserWatch(page, cfg, opts, question, defaultValue = "") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultValue !== "" ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollId);
      rl.close();
      resolve(result);
    };
    const pollId = setInterval(async () => {
      try {
        const detected = await detectBrowserLoggedIn(page, cfg);
        if (detected.loggedIn) {
          await notifyBrowserLoginDetected(page, opts, cfg, detected.via);
          finish({ browserLogin: true });
        }
      } catch {
        /* page 可能已关闭 */
      }
    }, 2000);
    rl.question(`${question}${hint}: `, (answer) => {
      const trimmed = answer.trim();
      finish({ browserLogin: false, value: trimmed !== "" ? trimmed : defaultValue });
    });
  });
}

/**
 * 到达登录页后：优先检测浏览器手动登录，也可终端输入；compare 复用缓存。
 */
async function resolveLoginCredentials(page, opts, cfg, { forcePrompt = false } = {}) {
  if (!forcePrompt && opts._cachedMobile != null && opts._cachedPassword != null) {
    return { mobile: opts._cachedMobile, password: opts._cachedPassword };
  }
  if (!forcePrompt && !opts.promptLogin && hasConfiguredCredentials(opts)) {
    return { mobile: opts.mobile, password: opts.password };
  }
  console.log("\n  ┌─────────────────────────────────────────────┐");
  console.log("  │  登录页已打开                                 │");
  console.log("  │  方式一：在浏览器页面直接登录（自动检测）     │");
  console.log("  │  方式二：在本终端输入账号密码                 │");
  console.log("  │  脚本每 2 秒检测 token，每 10 秒输出等待提示  │");
  console.log("  └─────────────────────────────────────────────┘\n");

  if (await waitForBrowserLogin(page, cfg, opts, { maxWaitMs: 12000, remindEveryMs: 6000 })) {
    return { manualBrowserLogin: true };
  }

  const mobileResult = await promptLineWithBrowserWatch(page, cfg, opts, "  手机号", opts.mobile);
  if (mobileResult.browserLogin) return { manualBrowserLogin: true };

  let password = await promptPassword("  密码");
  const detectedAfterPwd = await detectBrowserLoggedIn(page, cfg);
  if (detectedAfterPwd.loggedIn) {
    await notifyBrowserLoginDetected(page, opts, cfg, detectedAfterPwd.via);
    return { manualBrowserLogin: true };
  }
  if (password === "" && hasConfiguredCredentials(opts)) {
    password = opts.password;
    console.log("  （使用 defaults.json / CLI 中的密码）");
  }
  opts._cachedMobile = mobileResult.value;
  opts._cachedPassword = password;
  return { mobile: mobileResult.value, password };
}

/** 提交前确认：y=提交, n=重新输入, s=跳过 */
async function confirmLoginSubmit(page, opts, cfg, creds) {
  if (opts._loginConfirmed) return "submit";
  console.log(`  即将提交: 手机号 ${maskMobile(creds.mobile)}, 密码长度 ${creds.password.length}`);
  while (true) {
    const result = await promptLineWithBrowserWatch(
      page,
      cfg,
      opts,
      "  确认提交登录? y=提交, n=重新输入, s=跳过",
      "y",
    );
    if (result.browserLogin) return "browser";
    const answer = result.value.toLowerCase();
    if (answer === "y" || answer === "") {
      opts._loginConfirmed = true;
      return "submit";
    }
    if (answer === "n") return "reinput";
    if (answer === "s") return "skip";
    console.log("  请输入 y / n / s");
  }
}

/** 登录失败后：r=重试, s=跳过, q=退出 */
async function promptLoginFailureAction(reason) {
  console.log(`\n  ⚠ ${reason}`);
  while (true) {
    const answer = (await promptLine("  r=重试, s=跳过继续未登录探索, q=退出", "r")).toLowerCase();
    if (answer === "r" || answer === "") return "retry";
    if (answer === "s") return "skip";
    if (answer === "q") return "quit";
    console.log("  请输入 r / s / q");
  }
}

async function readLoginToken(page, cfg) {
  return page.evaluate((key) => {
    const direct = localStorage.getItem(key);
    if (direct != null && direct !== "") return direct;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null && (k === key || k.endsWith(`_${key}`) || k.endsWith(key))) {
        const v = localStorage.getItem(k);
        if (v != null && v !== "") return v;
      }
    }
    return "";
  }, cfg.tokenKey);
}

/** token 或页面 UI（「点击登录」消失且离开 login 路由） */
async function detectBrowserLoggedIn(page, cfg) {
  const token = await readLoginToken(page, cfg);
  if (token != null && token !== "") return { loggedIn: true, via: "token" };
  const onLoginRoute = hashPath(page.url()).includes("login");
  if (!onLoginRoute) {
    const loginEntry = page.getByText("点击登录", { exact: true });
    const count = await loginEntry.count();
    if (count === 0 || !(await loginEntry.first().isVisible().catch(() => false))) {
      return { loggedIn: true, via: "ui" };
    }
  }
  return { loggedIn: false, via: "" };
}

function loadRoutes(projectRoot, target) {
  const cfg = TARGET_CONFIG[target];
  if (cfg == null) throw new Error(`未知 target: ${target}`);
  const jsonPath = path.join(projectRoot, cfg.pagesJson);
  const pagesDoc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const routes = (pagesDoc.pages ?? []).map((p) => p.path).filter(Boolean);
  const tabBar = (pagesDoc.tabBar?.list ?? []).map((t) => t.pagePath).filter(Boolean);
  return { routes, tabBar, cfg };
}

function appEntryUrl(base) {
  return `${base.replace(/\/$/, "")}/#/`;
}

function hashPath(url) {
  const idx = url.indexOf("#/");
  if (idx < 0) return "";
  let p = url.slice(idx + 2);
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p;
}

function isPublicRoute(routePath, cfg) {
  if (cfg.publicExact.has(routePath)) return true;
  return cfg.publicPrefix.some((prefix) => routePath.startsWith(prefix));
}

function ensureDir(dir) {
  if (dir !== "" && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
}

function filterHardErrors(errors) {
  return errors.filter(
    (e) =>
      !e.includes("签名验证失败") &&
      !e.includes("getLocation:fail") &&
      !e.includes("Preload pages") &&
      !e.includes("Native dialog overrides"),
  );
}

function parseSize(raw) {
  const [width, height] = raw.split("x").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error(`无效尺寸 "${raw}"，格式应为 WIDTHxHEIGHT，例如 1900x1100`);
  }
  return [width, height];
}

function resolveDevice(playwright, deviceName) {
  const device = playwright.devices[deviceName];
  if (device == null) {
    const samples = Object.keys(playwright.devices)
      .filter((name) => !name.includes("landscape"))
      .slice(0, 8);
    throw new Error(`未知设备 "${deviceName}"。例如: ${samples.join(", ")}`);
  }
  return device;
}

function resolveWindowBounds(opts, slot) {
  const fullWidth = opts.windowSize?.width ?? 1900;
  const height = opts.windowSize?.height ?? 1100;
  if (slot === "left") {
    const width = Math.floor(fullWidth / 2);
    return { width, height, x: 0, y: 0, label: `左 ${width}x${height}` };
  }
  if (slot === "right") {
    const width = Math.floor(fullWidth / 2);
    return { width, height, x: width, y: 0, label: `右 ${width}x${height}` };
  }
  if (opts.windowSize != null) {
    return {
      width: opts.windowSize.width,
      height: opts.windowSize.height,
      x: 0,
      y: 0,
      label: `${opts.windowSize.width}x${opts.windowSize.height}`,
    };
  }
  return null;
}

function forkSessionOpts(globalOpts) {
  return {
    ...globalOpts,
    _loginConfirmed: false,
  };
}

async function launchBrowser(playwright, opts, slot = null) {
  const launchArgs = [];
  if (opts.headed) launchArgs.push("--auto-open-devtools-for-tabs");

  const bounds = resolveWindowBounds(opts, slot);
  if (bounds != null) {
    launchArgs.push(`--window-size=${bounds.width},${bounds.height}`, `--window-position=${bounds.x},${bounds.y}`);
  }

  const browser = await playwright.chromium.launch({
    headless: !opts.headed,
    slowMo: opts.headed ? 60 : 0,
    devtools: opts.headed,
    args: launchArgs,
  });

  const contextOptions = {
    locale: "zh-CN",
    geolocation: { latitude: 34.6197, longitude: 112.454 },
    permissions: ["geolocation"],
  };

  if (opts.viewport != null) {
    contextOptions.viewport = opts.viewport;
    if (slot == null) {
      console.log(`页面视口: ${opts.viewport.width}x${opts.viewport.height}（无设备模拟）`);
    }
  } else {
    const device = resolveDevice(playwright, opts.device);
    Object.assign(contextOptions, device);
    if (slot == null) {
      const { width, height } = device.viewport;
      console.log(
        `设备模拟: ${opts.device}（页面 ${width}x${height}, mobile=${device.isMobile === true}, touch=${device.hasTouch === true}）`,
      );
    }
  }
  if (bounds != null && slot == null) {
    console.log(`浏览器窗口: ${bounds.label}`);
  }

  const context = await browser.newContext(contextOptions);
  return { browser, context, slot, bounds };
}

/** 为单次路由/操作挂载控制台监听，返回解除函数 */
function attachRouteConsole(page, bucket) {
  const onConsole = (msg) => {
    if (msg.type() === "error") bucket.push(`[console.error] ${msg.text()}`);
  };
  const onPageError = (err) => bucket.push(`[pageerror] ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return () => {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  };
}

async function readPageHealth(page) {
  return page.evaluate(() => {
    const textLen = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length;
    const hasRoot = document.querySelector("uni-app, #app, body") != null;
    return { textLen, hasRoot };
  });
}

async function screenshot(page, dir, name) {
  if (dir === "") return;
  ensureDir(dir);
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** 仅首次加载 SPA（非路由直跳） */
async function bootstrapApp(page, base) {
  await page.goto(appEntryUrl(base), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function clickTabByJs(page, label) {
  return page.evaluate((tabLabel) => {
    const norm = (s) => (s ?? "").replace(/\s+/g, "").trim();
    const want = norm(tabLabel);
    const nodes = document.querySelectorAll(".uni-tabbar__label, .uni-tabbar__bd, .uni-tabbar__item");
    for (const el of nodes) {
      const text = norm(el.textContent);
      if (text !== want && !text.includes(want)) continue;
      const target =
        el.closest(".uni-tabbar__bd") ?? el.closest(".uni-tabbar__item") ?? el.parentElement ?? el;
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  }, label);
}

async function clickTab(page, label, cfg, waitMs) {
  try {
    if (await clickTabByJs(page, label)) {
      await page.waitForTimeout(waitMs);
      return true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.warn(`  tab JS点击失败 [${label}]: ${msg}`);
  }
  const loc = page.locator(".uni-tabbar__bd").filter({ hasText: label });
  const tabCount = await loc.count();
  const targets = tabCount > 0 ? [loc.last()] : [page.getByText(label, { exact: true }).last()];
  for (const target of targets) {
    if ((await target.count()) === 0) continue;
    try {
      await target.click({ timeout: 5000, force: true });
      await page.waitForTimeout(waitMs);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.warn(`  tab 点击失败 [${label}]: ${msg}`);
    }
  }
  return false;
}

async function fillLoginForm(page, mobile, password) {
  const accountTab = page.getByText("账号登录", { exact: true });
  if ((await accountTab.count()) > 0) {
    await accountTab.first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
  }
  const mobileInput = page.locator("input.login-field-input").first();
  const pwdInput = page.locator("input.login-field-input[type='password'], input[type='password']").first();
  await mobileInput.waitFor({ state: "visible", timeout: 15000 });
  await mobileInput.fill(mobile);
  await pwdInput.fill(password);
  await page.getByText("立即登录", { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(3500);
}

async function loginScreenshot(page, opts, name) {
  if (opts.phase !== "login") return;
  const dir = path.join(opts.screenshotRoot, "login-test");
  const file = await screenshot(page, dir, name);
  if (file != null) console.log(`  截图: ${file}`);
}

async function navigateToLoginPage(page, opts, cfg) {
  await clickTab(page, "我的", cfg, opts.crawlWaitMs);
  await loginScreenshot(page, opts, "01_me_page");
  const loginEntry = page.getByText("点击登录", { exact: true });
  if ((await loginEntry.count()) > 0 && (await loginEntry.first().isVisible().catch(() => false))) {
    await loginEntry.first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    await loginScreenshot(page, opts, "02_login_page");
    return "on_login_page";
  }
  if (!hashPath(page.url()).includes("login")) {
    const token = await readLoginToken(page, cfg);
    if (token != null && token !== "") {
      console.log(`  已登录 (${opts.base})`);
      return "already_logged_in";
    }
  }
  const onLoginPage =
    hashPath(page.url()).includes("login") || (await page.locator("input.login-field-input").count()) > 0;
  if (onLoginPage) return "on_login_page";
  if (!hasConfiguredCredentials(opts) && !opts.promptLogin) return "no_login_page";
  return "no_login_page";
}

/** 有头默认：仅在浏览器等待手动登录，终端不问账号密码 */
async function performBrowserOnlyLogin(page, opts, cfg) {
  console.log("\n  ┌─────────────────────────────────────────────┐");
  console.log("  │  请在浏览器页面完成登录                       │");
  console.log(`  │  ${opts.base}`.padEnd(46) + "│");
  console.log("  │  脚本每 2 秒自动检测，每 10 秒输出等待提示    │");
  console.log("  └─────────────────────────────────────────────┘\n");
  while (true) {
    if (await waitForBrowserLogin(page, cfg, opts, { maxWaitMs: 300000, remindEveryMs: 10000 })) {
      return true;
    }
    console.warn("  等待浏览器登录超时（5 分钟）");
    if (!opts.loginRetryOnFail) return false;
    const action = await promptLoginFailureAction("未在浏览器完成登录");
    if (action === "quit") process.exit(1);
    if (action === "skip") return false;
  }
}

/** 无头 / 全自动：用配置账号自动填表 */
async function performAutoFillLogin(page, opts, cfg) {
  console.log(`  使用配置账号自动登录 (${maskMobile(opts.mobile)})`);
  try {
    await fillLoginForm(page, opts.mobile, opts.password);
  } catch (err) {
    console.warn(`  自动登录失败: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const token = await readLoginToken(page, cfg);
  if (token != null && token !== "") {
    await loginScreenshot(page, opts, "03_login_success");
    console.log(`  登录成功 (${opts.base})`);
    return true;
  }
  console.warn("  自动登录后未检测到 token");
  return false;
}

/** 填表、确认、失败重试（无 route goto） */
async function performLoginWithRetry(page, opts, cfg) {
  if (opts.promptLogin !== true) {
    if (opts.headed && !opts.headless) return performBrowserOnlyLogin(page, opts, cfg);
    if (hasConfiguredCredentials(opts)) return performAutoFillLogin(page, opts, cfg);
    console.log("  未配置账号密码，跳过登录（无头模式请加 --mobile/--password）");
    return false;
  }
  let forcePrompt = false;
  while (true) {
    const creds = await resolveLoginCredentials(page, opts, cfg, { forcePrompt });
    forcePrompt = false;
    if (creds.manualBrowserLogin) return true;
    if (creds.mobile === "" || creds.password === "") {
      console.log("  未输入账号密码，跳过登录");
      return false;
    }
    if (opts.confirmLogin) {
      const action = await confirmLoginSubmit(page, opts, cfg, creds);
      if (action === "browser") return true;
      if (action === "reinput") {
        clearCredentialCache(opts);
        forcePrompt = true;
        continue;
      }
      if (action === "skip") {
        console.log("  已跳过登录");
        return false;
      }
    }
    try {
      await fillLoginForm(page, creds.mobile, creds.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  填表/提交失败: ${msg}`);
      if (!opts.loginRetryOnFail) return false;
      const action = await promptLoginFailureAction(`填表或提交异常: ${msg}`);
      if (action === "quit") process.exit(1);
      if (action === "skip") return false;
      clearCredentialCache(opts);
      forcePrompt = true;
      continue;
    }
    const token = await readLoginToken(page, cfg);
    if (token != null && token !== "") {
      await loginScreenshot(page, opts, "03_login_success");
      console.log(`  登录成功 (${opts.base})`);
      return true;
    }
    console.warn("  登录后未检测到 token");
    if (!opts.loginRetryOnFail) return false;
    const action = await promptLoginFailureAction("未检测到 token（可能账号密码错误或接口失败）");
    if (action === "quit") process.exit(1);
    if (action === "skip") return false;
    clearCredentialCache(opts);
    forcePrompt = true;
  }
}

/** 通过点击 Tab / 点击登录 进入并完成登录（无 route goto） */
async function ensureLoggedIn(page, opts, cfg) {
  if (!opts.login) {
    console.log("  跳过 UI 登录（--no-login）");
    return false;
  }
  try {
    const nav = await navigateToLoginPage(page, opts, cfg);
    if (nav === "already_logged_in") return true;
    if (nav === "no_login_page") {
      console.log("  未到达登录页且未配置账号密码，跳过登录");
      return false;
    }
    return await performLoginWithRetry(page, opts, cfg);
  } catch (err) {
    console.warn(`  登录失败: ${err instanceof Error ? err.message : String(err)}`);
    if (!opts.loginRetryOnFail) return false;
    const action = await promptLoginFailureAction(err instanceof Error ? err.message : String(err));
    if (action === "quit") process.exit(1);
    if (action === "skip") return false;
    clearCredentialCache(opts);
    return performLoginWithRetry(page, opts, cfg);
  }
}

/**
 * Phase1+3 合并：仅通过页面内可点击元素导航，记录到达的路由并截图。
 * 不对 pages.json 路由使用 page.goto。
 */
async function runClickExplore(page, runOpts, routes, cfg) {
  const shotDir = path.join(runOpts.screenshotRoot, runOpts.label);
  const routeHits = new Map();
  const edgeKeys = new Set();
  const edges = [];
  const failures = [];
  const sessionErrors = [];
  const detach = attachRouteConsole(page, sessionErrors);

  const currentPath = () => hashPath(page.url());

  const recordRoute = async (via, errors, { kind = "click" } = {}) => {
    const pathNow = await currentPath();
    if (pathNow === "") return pathNow;
    const hard = filterHardErrors(errors);
    let status = "ok";
    let note = `via: ${via}`;
    const health = await readPageHealth(page);
    if (!health.hasRoot || health.textLen < 8) {
      status = "blank";
      note = `可见文本过少 (${health.textLen}); ${note}`;
    }
    if (hard.length > 0 && status === "ok") {
      status = "console_error";
      note = `${hard.slice(0, 2).join(" | ")}; ${note}`;
    }
    const prev = routeHits.get(pathNow);
    if (prev == null || prev.status !== "ok") {
      routeHits.set(pathNow, { routePath: pathNow, status, note, via, errors: hard });
      await screenshot(page, shotDir, pageShotName(pathNow));
      const mark = kind === "scan" ? "◎" : status === "ok" ? "✓" : "✗";
      const verb = kind === "scan" ? "扫描" : "点击";
      process.stdout.write(`  ${mark} [${runOpts.label}] ${verb}→${pathNow} (${status}) ← ${via}\n`);
    }
    return pathNow;
  };

  /** 探索前扫描当前 URL，补登记手动跳转或点击失败但已导航的页面 */
  const scanCurrentRoute = async (via, fromPath = "") => {
    const pathNow = await currentPath();
    if (pathNow === "") return "";
    const prev = routeHits.get(pathNow);
    if (prev != null && prev.status === "ok") return pathNow;
    if (fromPath !== "" && fromPath !== pathNow) {
      recordEdge(fromPath, pathNow, via);
    }
    await recordRoute(via, [], { kind: "scan" });
    return pathNow;
  };

  const recordEdge = (from, to, label) => {
    const key = `${from}|${to}|${label}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, label });
  };

  const tryClick = async (el, fromPath, viaLabel) => {
    const routeErrors = [];
    const unhook = attachRouteConsole(page, routeErrors);
    try {
      await el.click({ timeout: 5000, force: true });
      await page.waitForTimeout(runOpts.crawlWaitMs);
      const toPath = await currentPath();
      if (toPath !== "" && toPath !== fromPath) {
        recordEdge(fromPath, toPath, viaLabel);
        await recordRoute(viaLabel, routeErrors);
        return toPath;
      }
    } catch {
      failures.push({ from: fromPath, label: viaLabel, error: "click_failed" });
    } finally {
      unhook();
    }
    return fromPath;
  };

  const exploreClickables = async (anchorTab, fromPath, budget) => {
    if (budget <= 0) return 0;
    let used = 0;
    let anchorPath = await scanCurrentRoute(`scan:pre-explore:${anchorTab}`, fromPath);
    if (anchorPath === "") anchorPath = fromPath;
    const selectors = [
      "uni-view[class*='grid-item']",
      "uni-view[class*='cell']",
      "uni-view[class*='entry']",
      "uni-view[class*='service-entry']",
      "uni-view[class*='me-header-icon']",
      "uni-view[class*='me-vip-btn']",
      "uni-text",
    ];
    const candidates = page.locator(selectors.join(", "));
    const total = await candidates.count();
    for (let i = 0; i < total && used < budget; i++) {
      const el = candidates.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = ((await el.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      if (label !== "" && cfg.tabLabels.includes(label)) continue;
      if (label.length > 32) continue;
      const box = await el.boundingBox().catch(() => null);
      const vp = page.viewportSize();
      const maxY = (vp?.height ?? 667) - 8;
      if (box == null || box.y < 40 || box.y > maxY) continue;
      const via = label === "" ? `click#${i}` : label;
      const before = await scanCurrentRoute(`scan:round:${anchorTab}`, anchorPath);
      const clickFrom = before !== "" ? before : anchorPath;
      const after = await tryClick(el, clickFrom, via);
      if (after !== clickFrom) {
        used++;
        anchorPath = after;
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 12000 }).catch(async () => {
          await clickTab(page, anchorTab, cfg, runOpts.crawlWaitMs);
        });
        await page.waitForTimeout(600);
        const backPath = await scanCurrentRoute(`scan:post-back:${anchorTab}`, after);
        if (backPath !== "") anchorPath = backPath;
      } else {
        const lingerPath = await scanCurrentRoute(`scan:post-click:${anchorTab}`, clickFrom);
        if (lingerPath !== "" && lingerPath !== clickFrom) {
          anchorPath = lingerPath;
          used++;
          await page.goBack({ waitUntil: "domcontentloaded", timeout: 12000 }).catch(async () => {
            await clickTab(page, anchorTab, cfg, runOpts.crawlWaitMs);
          });
          await page.waitForTimeout(600);
          const backPath = await scanCurrentRoute(`scan:post-back:${anchorTab}`, lingerPath);
          if (backPath !== "") anchorPath = backPath;
        }
      }
    }
    return used;
  };

  try {
    const startPath = await currentPath();
    await screenshot(page, shotDir, `00_start_${safeFilename(startPath || "entry")}`);
    process.stdout.write(`  📷 [${runOpts.label}] 起始页 ${startPath || "(空)"}\n`);
    await scanCurrentRoute("scan:start", "");

    let clicksLeft = runOpts.crawlMaxClicks;
    for (const tabLabel of cfg.tabLabels) {
      if (clicksLeft <= 0) break;
      const fromPath = await scanCurrentRoute(`scan:pre-tab:${tabLabel}`, "");
      const tabClicked = await clickTab(page, tabLabel, cfg, runOpts.crawlWaitMs);
      const toPath = await currentPath();
      await screenshot(page, shotDir, `tab_${safeFilename(tabLabel)}`);
      process.stdout.write(
        `  📷 [${runOpts.label}] tab:${tabLabel} → ${toPath || "(空)"}${tabClicked ? "" : " (点击可能失败)"}\n`,
      );
      if (!tabClicked) {
        failures.push({ from: fromPath, label: `tab:${tabLabel}`, error: "tab_not_found" });
        continue;
      }
      recordEdge(fromPath, toPath, `tab:${tabLabel}`);
      await recordRoute(`tab:${tabLabel}`, []);
      clicksLeft -= 1;
      const tabPath = await scanCurrentRoute(`scan:post-tab:${tabLabel}`, fromPath);
      const exploreFrom = tabPath !== "" ? tabPath : toPath;
      const budget = tabLabel === "我的" ? 20 : tabLabel === "首页" ? 12 : 8;
      clicksLeft -= await exploreClickables(tabLabel, exploreFrom, Math.min(budget, clicksLeft));
    }
  } catch (err) {
    failures.push({
      from: "explore",
      label: "fatal",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    detach();
  }

  const smoke = routes.map((routePath) => {
    const hit = routeHits.get(routePath);
    if (hit != null) return hit;
    return {
      routePath,
      status: "unvisited",
      note: "点击探索未到达（无直链 goto）",
      via: "",
      errors: [],
    };
  });

  const crawlOnlyRoutes = [...routeHits.keys()].filter((p) => !routes.includes(p));
  return {
    smoke,
    crawl: {
      edges,
      failures,
      errors: filterHardErrors(sessionErrors),
      crawlOnlyRoutes,
    },
  };
}

/** 并行对比：仅打开首页，不进入登录页（用户自行登录） */
async function prepareComparePage(page, base, cfg, opts) {
  await bootstrapApp(page, base);
  const onHome = await clickTab(page, "首页", cfg, opts.crawlWaitMs);
  if (!onHome) {
    const homeUrl = `${base.replace(/\/$/, "")}/#/pages/u/home/home`;
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);
  }
}

function compareStartTriggerPath(opts) {
  return opts.compareStartFile ?? path.join(TEST_ROOT, ".compare-start");
}

async function waitEnterBeforeCompare(opts) {
  const triggerFile = compareStartTriggerPath(opts);
  try {
    if (fs.existsSync(triggerFile)) fs.unlinkSync(triggerFile);
  } catch {
    /* ignore */
  }

  console.log("\n  ┌─────────────────────────────────────────────┐");
  console.log("  │  左右两窗口已打开（首页），请自行登录       │");
  console.log(`  │  左: ${opts.baseA}`.padEnd(46) + "│");
  console.log(`  │  右: ${opts.baseB}`.padEnd(46) + "│");
  console.log("  │  1. 自行进入登录页并完成登录               │");
  if (process.stdin.isTTY) {
    console.log("  │  2. 全部登录完成后，回到终端按回车开始对比 │");
    console.log("  └─────────────────────────────────────────────┘");
    await promptLine("\n  确认已登录，按回车开始对比", "");
    return;
  }
  console.log("  │  2. 登录完成后执行以下操作开始对比：       │");
  console.log(`  │  touch ${triggerFile}`.padEnd(46) + "│");
  console.log("  └─────────────────────────────────────────────┘");
  console.log("\n  等待开始信号…");
  while (!fs.existsSync(triggerFile)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  try {
    fs.unlinkSync(triggerFile);
  } catch {
    /* ignore */
  }
  console.log("  收到开始信号，开始对比…");
}

/** 跳过登录，仅执行点击探索 */
async function runExploreOnly(page, globalOpts, label, base, phase) {
  const runOpts = {
    ...globalOpts,
    label,
    base,
    phase,
    screenshotRoot: globalOpts.screenshotRoot,
  };
  const { routes, cfg } = loadRoutes(globalOpts.project, globalOpts.target);
  const token = await readLoginToken(page, cfg);
  const loggedIn = token != null && token !== "";
  if (!loggedIn) {
    console.warn(`  [${label}] 未检测到 token，仍将开始探索`);
  } else {
    console.log(`  [${label}] 已检测到登录 token，开始探索`);
  }

  let smoke = null;
  let crawl = null;
  if (phase === "smoke" || phase === "crawl" || phase === "all") {
    console.log(`\n=== [${label}] 点击探索（Tab + 页面内链接，无 route.goto）===`);
    if (hashPath(page.url()).includes("login")) {
      await clickTab(page, "首页", cfg, runOpts.crawlWaitMs);
    }
    await page.waitForTimeout(800);
    const explored = await runClickExplore(page, runOpts, routes, cfg);
    smoke = explored.smoke;
    crawl = explored.crawl;
    const visited = smoke.filter((r) => r.status !== "unvisited").length;
    const bad = smoke.filter((r) => r.status !== "ok" && r.status !== "unvisited").length;
    console.log(
      `\n  [${label}] 探索结束: ${visited} 到达, ${smoke.length - visited} 未到达, ${bad} 异常` +
        (explored.crawl.failures.length > 0 ? `, ${explored.crawl.failures.length} 次点击失败` : ""),
    );
  }
  return {
    label,
    base,
    loggedIn,
    smoke,
    crawl,
    routesCount: routes.length,
  };
}

async function runSessionWithPage(page, globalOpts, label, base, phase) {
  const runOpts = {
    ...globalOpts,
    label,
    base,
    phase,
    screenshotRoot: globalOpts.screenshotRoot,
  };
  const { routes, tabBar, cfg } = loadRoutes(globalOpts.project, globalOpts.target);
  let smoke = null;
  let crawl = null;
  let loggedIn = false;

  const modeHint = globalOpts.compareParallel ? "并行窗口" : "单窗口";
  console.log(`\n>>> 会话 [${label}] ${base}（${modeHint}，仅点击导航）`);
  await bootstrapApp(page, base);
  loggedIn = await ensureLoggedIn(page, runOpts, cfg);
  if (phase === "login") {
    console.log(`\n=== 登录测试结束: ${loggedIn ? "成功" : "失败"} ===`);
    console.log(`  当前 URL: ${page.url()}`);
    const token = await readLoginToken(page, cfg);
    console.log(`  token: ${token != null && token !== "" ? "已写入" : "无"}`);
  }
  if (phase === "smoke" || phase === "crawl" || phase === "all") {
    console.log(`\n=== 点击探索（Tab + 页面内链接，无 route.goto）===`);
    await page.waitForTimeout(800);
    const explored = await runClickExplore(page, runOpts, routes, cfg);
    smoke = explored.smoke;
    crawl = explored.crawl;
    const visited = smoke.filter((r) => r.status !== "unvisited").length;
    const bad = smoke.filter((r) => r.status !== "ok" && r.status !== "unvisited").length;
    console.log(
      `\n  [${label}] 探索结束: ${visited} 到达, ${smoke.length - visited} 未到达, ${bad} 异常` +
        (explored.crawl.failures.length > 0 ? `, ${explored.crawl.failures.length} 次点击失败` : ""),
    );
  }
  return {
    label,
    base,
    loggedIn,
    smoke,
    crawl,
    routesCount: routes.length,
  };
}

async function runSession(playwright, globalOpts, label, base, phase) {
  const { browser, context } = await launchBrowser(playwright, globalOpts);
  const page = await context.newPage();
  try {
    return await runSessionWithPage(page, globalOpts, label, base, phase);
  } finally {
    await page.close().catch(() => {});
    await browser.close();
  }
}

function summarizeSmoke(results) {
  if (results == null) return null;
  const ok = results.filter((r) => r.status === "ok").length;
  const auth = results.filter((r) => r.status === "auth_redirect").length;
  const unvisited = results.filter((r) => r.status === "unvisited").length;
  const bad = results.filter((r) => !["ok", "auth_redirect", "unvisited"].includes(r.status));
  return { ok, auth, unvisited, bad, total: results.length };
}

function diffSmoke(a, b) {
  const mapB = new Map((b ?? []).map((r) => [r.routePath, r]));
  const diffs = [];
  for (const rowA of a ?? []) {
    const rowB = mapB.get(rowA.routePath);
    if (rowB == null) {
      diffs.push({ routePath: rowA.routePath, statusA: rowA.status, statusB: "missing", noteA: rowA.note, noteB: "" });
      continue;
    }
    if (rowA.status !== rowB.status) {
      diffs.push({
        routePath: rowA.routePath,
        statusA: rowA.status,
        statusB: rowB.status,
        noteA: rowA.note,
        noteB: rowB.note,
      });
    }
  }
  return diffs;
}

function diffCrawlEdges(a, b) {
  const key = (e) => `${e.from}|${e.label}|${e.to}`;
  const setA = new Set((a?.edges ?? []).map(key));
  const setB = new Set((b?.edges ?? []).map(key));
  const onlyA = [...setA].filter((k) => !setB.has(k));
  const onlyB = [...setB].filter((k) => !setA.has(k));
  return { onlyA, onlyB };
}

function collectGalleryShotNames(screenshotRoot) {
  const names = new Set();
  for (const side of ["source", "obfuscated"]) {
    const dir = path.join(screenshotRoot, side);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".png")) names.add(file.replace(/\.png$/, ""));
    }
  }
  return [...names].sort();
}

function writeGallery(screenshotRoot, smokeDiffs, galleryAll, smokeA, smokeB) {
  const rows = [];
  const routeNames = galleryAll
    ? [...new Set([...(smokeA ?? []).map((r) => pageShotName(r.routePath))])]
    : smokeDiffs.map((d) => pageShotName(d.routePath));
  const shotNames = [...new Set([...routeNames, ...collectGalleryShotNames(screenshotRoot)])];

  for (const shotName of shotNames) {
    const srcA = `source/${shotName}.png`;
    const srcB = `obfuscated/${shotName}.png`;
    const fullA = path.join(screenshotRoot, srcA);
    const fullB = path.join(screenshotRoot, srcB);
    if (!fs.existsSync(fullA) && !fs.existsSync(fullB)) continue;
    const routePath = shotName.startsWith(PAGE_SHOT_PREFIX)
      ? shotName.slice(PAGE_SHOT_PREFIX.length)
      : shotName;
    const diff = smokeDiffs.find((d) => pageShotName(d.routePath) === shotName);
    const statusLine = diff
      ? `${diff.statusA} → ${diff.statusB}`
      : shotName.startsWith("tab_") || shotName.startsWith("00_start_")
        ? "Tab/起始截图"
        : `${smokeA?.find((r) => r.routePath === routePath)?.status ?? "?"} / ${smokeB?.find((r) => r.routePath === routePath)?.status ?? "?"}`;
    rows.push({ routePath: shotName, srcA, srcB, hasA: fs.existsSync(fullA), hasB: fs.existsSync(fullB), statusLine });
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>路由截图对比</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;background:#f5f6f7;}
h1{font-size:18px;} .row{background:#fff;border-radius:8px;padding:12px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.path{font-family:monospace;font-size:13px;color:#333;margin-bottom:8px;}
.status{font-size:12px;color:#c0392b;margin-bottom:8px;}
.imgs{display:flex;gap:12px;flex-wrap:wrap;}
.col{flex:1;min-width:180px;}
.col h3{font-size:12px;color:#666;margin:0 0 6px;}
img{max-width:100%;border:1px solid #ddd;border-radius:4px;}
.missing{color:#999;font-size:12px;}
</style></head><body>
<h1>源码 vs 混淆 — 路由截图对比</h1>
<p>共 ${rows.length} 条。异常优先展示。</p>
${rows
  .map(
    (r) => `<div class="row">
<div class="path">${r.routePath}</div>
<div class="status">${r.statusLine}</div>
<div class="imgs">
<div class="col"><h3>source (5181)</h3>${r.hasA ? `<img src="${r.srcA}" alt="source"/>` : `<div class="missing">无截图</div>`}</div>
<div class="col"><h3>obfuscated (5183)</h3>${r.hasB ? `<img src="${r.srcB}" alt="obfuscated"/>` : `<div class="missing">无截图</div>`}</div>
</div></div>`,
  )
  .join("\n")}
</body></html>`;
  const out = path.join(screenshotRoot, "index.html");
  ensureDir(screenshotRoot);
  fs.writeFileSync(out, html, "utf8");
  return out;
}

function writeCompareReport(opts, resultA, resultB, smokeDiffs, crawlDiff) {
  const lines = [];
  lines.push("# 路由对比报告");
  lines.push("");
  lines.push(`- 时间: ${new Date().toISOString()}`);
  lines.push(`- 源码: \`${resultA.base}\` (${resultA.label})`);
  lines.push(`- 混淆: \`${resultB.base}\` (${resultB.label})`);
  lines.push(`- 登录: ${opts.login ? `${opts.mobile} (UI)` : "未登录"}`);
  lines.push(`- 截图画廊: [screenshots/index.html](../screenshots/index.html)`);
  lines.push("");

  const sA = summarizeSmoke(resultA.smoke);
  const sB = summarizeSmoke(resultB.smoke);
  lines.push("## Phase1 冒烟汇总");
  lines.push("");
  lines.push("| 端 | 点击到达 | 未到达 | 异常 | 注册总数 |");
  lines.push("|----|----------|--------|------|----------|");
  lines.push(`| source | ${sA?.ok ?? 0} | ${sA?.unvisited ?? 0} | ${sA?.bad.length ?? 0} | ${sA?.total ?? 0} |`);
  lines.push(`| obfuscated | ${sB?.ok ?? 0} | ${sB?.unvisited ?? 0} | ${sB?.bad.length ?? 0} | ${sB?.total ?? 0} |`);
  lines.push("");

  if (smokeDiffs.length > 0) {
    lines.push("## Phase1 状态不一致");
    lines.push("");
    for (const d of smokeDiffs) {
      lines.push(`- \`${d.routePath}\`: **${d.statusA}** → **${d.statusB}**`);
      if (d.noteA || d.noteB) lines.push(`  - source: ${d.noteA || "-"}`);
      if (d.noteB) lines.push(`  - obfuscated: ${d.noteB}`);
    }
    lines.push("");
  } else {
    lines.push("## Phase1 状态不一致");
    lines.push("");
    lines.push("无（两边 smoke status 一致）。");
    lines.push("");
  }

  lines.push("## Phase3 爬链差异");
  lines.push("");
  if (crawlDiff.onlyA.length > 0) {
    lines.push("### 仅 source 有的边");
    for (const k of crawlDiff.onlyA.slice(0, 30)) lines.push(`- ${k}`);
    lines.push("");
  }
  if (crawlDiff.onlyB.length > 0) {
    lines.push("### 仅 obfuscated 有的边");
    for (const k of crawlDiff.onlyB.slice(0, 30)) lines.push(`- ${k}`);
    lines.push("");
  }
  if (crawlDiff.onlyA.length === 0 && crawlDiff.onlyB.length === 0) {
    lines.push("爬链边集合一致（或均为空）。");
    lines.push("");
  }

  ensureDir(path.dirname(opts.out));
  fs.writeFileSync(opts.out, lines.join("\n"), "utf8");

  const json = {
    generatedAt: new Date().toISOString(),
    opts: {
      baseA: resultA.base,
      baseB: resultB.base,
      mobile: opts.mobile ? "***" : "",
      headed: opts.headed,
    },
    source: resultA,
    obfuscated: resultB,
    smokeDiffs,
    crawlDiff,
  };
  ensureDir(path.dirname(opts.jsonOut));
  fs.writeFileSync(opts.jsonOut, JSON.stringify(json, null, 2), "utf8");

  fs.writeFileSync(
    path.join(path.dirname(opts.jsonOut), "route-test-source.json"),
    JSON.stringify(resultA, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(path.dirname(opts.jsonOut), "route-test-obfuscated.json"),
    JSON.stringify(resultB, null, 2),
    "utf8",
  );
}

function printHelp() {
  console.log(`用法: node scripts/route-test.mjs [options]

对比模式（推荐）:
  --compare --base-a http://localhost:5181 --base-b http://localhost:5183 --headed
  默认并行：左右两窗口打开首页，自行登录后按回车才开始对比
  --no-wait-enter  跳过回车等待，登录检测通过后立即探索
  --compare-sequential  改回单窗口先后跑

单端模式:
  --base http://localhost:5183 --phase smoke|crawl|all

视口 / 设备:
  --device "iPhone SE (3rd gen)"  页面设备模拟（默认开启）
  --window-size 1900x1100         浏览器窗口大小（不影响页面视口）
  --viewport 1900x1100            强制页面视口（会关闭设备模拟）

输出（默认在 obfuscated_test/ 下）:
  reports/route-compare.md
  reports/route-compare.json
  screenshots/source|obfuscated/
  screenshots/index.html

登录:
  默认（有头）         浏览器手动登录，脚本自动检测，终端不问账号密码
  --prompt-login       改为终端输入账号密码（旧交互模式）
  --no-prompt-login    无头时用 defaults.json / CLI 自动填表
  --confirm-login      终端模式下提交前需输入 y 确认
  --login-retry        登录失败/超时时可选 r/s/q（有头默认开启）
  --no-login-retry     失败后直接跳过
  --no-login           跳过登录

配置: 复制 config/defaults.example.json → config/defaults.json
`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("缺少 playwright。请执行: cd obfuscated_test && npm install && npx playwright install chromium");
    process.exit(1);
  }

  ensureDir(path.join(TEST_ROOT, "reports"));
  ensureDir(path.join(opts.screenshotRoot, "source"));
  ensureDir(path.join(opts.screenshotRoot, "obfuscated"));

  if (opts.compare) {
    let resultA;
    let resultB;
    if (opts.compareParallel) {
      const [left, right] = await Promise.all([
        launchBrowser(playwright, opts, "left"),
        launchBrowser(playwright, opts, "right"),
      ]);
      const pageA = await left.context.newPage();
      const pageB = await right.context.newPage();
      const optsA = forkSessionOpts(opts);
      const optsB = forkSessionOpts(opts);
      try {
        const { cfg } = loadRoutes(opts.project, opts.target);
        console.log("\n=== 对比模式：左右两窗口并行 ===");
        console.log(`  左: ${opts.baseA} (${left.bounds?.label ?? "默认窗口"})`);
        console.log(`  右: ${opts.baseB} (${right.bounds?.label ?? "默认窗口"})`);
        await Promise.all([
          prepareComparePage(pageA, opts.baseA, cfg, optsA),
          prepareComparePage(pageB, opts.baseB, cfg, optsB),
        ]);
        if (opts.waitEnterBeforeCompare && opts.headed && !opts.headless) {
          await waitEnterBeforeCompare(opts);
        } else {
          console.log("  自动模式：登录检测通过后立即开始探索\n");
          await Promise.all([
            ensureLoggedIn(pageA, optsA, cfg),
            ensureLoggedIn(pageB, optsB, cfg),
          ]);
        }
        [resultA, resultB] = await Promise.all([
          runExploreOnly(pageA, optsA, opts.labelA, opts.baseA, opts.phase),
          runExploreOnly(pageB, optsB, opts.labelB, opts.baseB, opts.phase),
        ]);
      } finally {
        await Promise.all([
          pageA.close().catch(() => {}),
          pageB.close().catch(() => {}),
          left.browser.close().catch(() => {}),
          right.browser.close().catch(() => {}),
        ]);
      }
    } else {
      const { browser, context } = await launchBrowser(playwright, opts);
      const page = await context.newPage();
      try {
        console.log("\n=== 对比模式：单窗口先后跑 5181 → 5183 ===");
        resultA = await runSessionWithPage(page, opts, opts.labelA, opts.baseA, opts.phase);
        resultB = await runSessionWithPage(page, opts, opts.labelB, opts.baseB, opts.phase);
      } finally {
        await page.close().catch(() => {});
        await browser.close();
      }
    }
    const smokeDiffs = diffSmoke(resultA.smoke, resultB.smoke);
    const crawlDiff = diffCrawlEdges(resultA.crawl, resultB.crawl);
    writeCompareReport(opts, resultA, resultB, smokeDiffs, crawlDiff);
    const gallery = writeGallery(
      opts.screenshotRoot,
      smokeDiffs,
      opts.galleryAll,
      resultA.smoke,
      resultB.smoke,
    );
    console.log(`\n报告: ${opts.out}`);
    console.log(`JSON: ${opts.jsonOut}`);
    console.log(`画廊: ${gallery}`);
    console.log(`冒烟差异: ${smokeDiffs.length} 条`);
    if (smokeDiffs.length > 0) process.exitCode = 1;
    return;
  }

  const result = await runSession(playwright, opts, "single", opts.base, opts.phase);
  if (opts.phase === "login") {
    if (!result.loggedIn) process.exitCode = 1;
    return;
  }
  const out = opts.out || path.join(TEST_ROOT, "reports", "route-single.md");
  ensureDir(path.dirname(out));
  const lines = [
    "# 单端路由测试",
    "",
    `- base: \`${result.base}\``,
    `- 时间: ${new Date().toISOString()}`,
    "",
  ];
  const s = summarizeSmoke(result.smoke);
  if (s != null) {
    lines.push(`- 探索: ${s.ok} 到达, ${s.unvisited} 未到达, ${s.bad.length} 异常 / ${s.total}`);
  }
  fs.writeFileSync(out, lines.join("\n"), "utf8");
  console.log(`\n报告: ${out}`);
  if (s != null) {
    console.log(`\n探索: ${s.ok} 到达, ${s.unvisited} 未到达, ${s.bad.length} 异常 / ${s.total} 注册路由`);
    if (s.bad.length > 0) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
