/**
 * Playwright：验证 ux-page-loading 遮罩消失 + 布局 class 数量
 * 用法:
 *   node scripts/loading-style-test.mjs --base http://localhost:5173
 *   node scripts/loading-style-test.mjs --compare --base-a http://localhost:5181 --base-b http://localhost:5183
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyDevPortsToOpts, requireDevPortsOrThrow } from "./dev-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.resolve(__dirname, "..");

const ROUTES = {
  order: {
    path: "pages/u/order/order",
    loadingText: "正在加载最新订单",
    minRootClasses: 4,
  },
  "service-list": {
    path: "pages/u/category/service-list/service-list",
    query: "categoryId=1&title=日常保洁",
    loadingText: "正在加载服务列表",
    minRootClasses: 4,
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
    base: d.baseB ?? "auto",
    baseA: d.baseA ?? "auto",
    baseB: d.baseB ?? "auto",
    labelA: d.labelA ?? "source",
    labelB: d.labelB ?? "obfuscated",
    compare: false,
    routes: ["order", "service-list"],
    headed: false,
    headless: true,
    device: d.device ?? "iPhone SE (3rd gen)",
    timeoutMs: 12000,
    styleOnly: false,
    out: path.join(TEST_ROOT, "reports", "loading-style-test.json"),
    mdOut: path.join(TEST_ROOT, "reports", "loading-style-test.md"),
    screenshotDir: path.join(TEST_ROOT, "screenshots", "loading-test"),
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") opts.base = argv[++i];
    else if (arg === "--base-a") opts.baseA = argv[++i];
    else if (arg === "--base-b") opts.baseB = argv[++i];
    else if (arg === "--compare") opts.compare = true;
    else if (arg === "--routes") opts.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--headed") {
      opts.headed = true;
      opts.headless = false;
    }
    else if (arg === "--headless") {
      opts.headed = false;
      opts.headless = true;
    }
    else if (arg === "--timeout") opts.timeoutMs = Number.parseInt(argv[++i], 10);
    else if (arg === "--style-only") opts.styleOnly = true;
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  applyDevPortsToOpts(opts, TEST_ROOT);
  requireDevPortsOrThrow(opts, TEST_ROOT);
  return opts;
}

function routeUrl(base, routeKey) {
  const cfg = ROUTES[routeKey];
  if (!cfg) throw new Error(`未知路由: ${routeKey}`);
  const q = cfg.query ? `?${cfg.query}` : "";
  return `${base.replace(/\/$/, "")}/#/${cfg.path}${q}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function launchContext(playwright, opts) {
  const browser = await playwright.chromium.launch({
    headless: opts.headless,
    slowMo: opts.headed ? 80 : 0,
  });
  const device = playwright.devices[opts.device] ?? playwright.devices["iPhone SE (3rd gen)"];
  const context = await browser.newContext({
    ...device,
    locale: "zh-CN",
  });
  return { browser, context };
}

async function inspectLoadingOverlay(page, loadingText) {
  return page.evaluate((text) => {
    const bodyText = document.body?.innerText ?? "";
    const loadingVisible = bodyText.includes(text);

    function classCount(el) {
      return (el.className ?? "").split(/\s+/).filter(Boolean).length;
    }

    /** 从 loading 文案向上找 overlay 根节点；找不到时用 class/布局兜底 */
    function findOverlayRoot() {
      const candidates = [...document.querySelectorAll("uni-text, text, span, uni-view")];
      for (const el of candidates) {
        const own = (el.textContent ?? "").trim();
        if (!own.includes(text) || own.length > text.length + 8) continue;
        let node = el;
        for (let depth = 0; depth < 14 && node; depth++) {
          const style = window.getComputedStyle(node);
          const count = classCount(node);
          const cls = node.className ?? "";
          const isOverlay =
            count >= 1 &&
            (style.position === "absolute" ||
              style.position === "fixed" ||
              cls.includes("page-loading") ||
              /c[a-f0-9]{10}/.test(cls));
          if (isOverlay && count >= 1) {
            return node;
          }
          node = node.parentElement;
        }
      }

      for (const el of document.querySelectorAll("uni-view")) {
        const cls = el.className ?? "";
        const count = classCount(el);
        if (count < 4) continue;
        const style = window.getComputedStyle(el);
        if (
          (cls.includes("page-loading") || (cls.includes("ux-flex") && /c[a-f0-9]{10}/.test(cls))) &&
          (style.position === "absolute" || style.position === "fixed") &&
          style.display === "flex"
        ) {
          return el;
        }
      }
      return null;
    }

    function overlayMeta(node) {
      const style = window.getComputedStyle(node);
      return {
        className: node.className ?? "",
        classCount: classCount(node),
        position: style.position,
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        width: style.width,
        zIndex: style.zIndex,
      };
    }

    const overlayNode = findOverlayRoot();

    function findDotsRowIn(root) {
      if (!root) return null;
      for (const el of root.querySelectorAll("uni-view")) {
        const children = [...el.children].filter((c) => c.tagName.toLowerCase().includes("view"));
        if (children.length < 3) continue;
        const style = window.getComputedStyle(el);
        const count = classCount(el);
        if (style.display === "flex" && style.flexDirection === "row" && count >= 2) {
          return {
            className: el.className ?? "",
            classCount: count,
            flexDirection: style.flexDirection,
            childCount: children.length,
          };
        }
      }
      return null;
    }

    return {
      loadingVisible,
      overlay: overlayNode ? overlayMeta(overlayNode) : null,
      dotsRow: findDotsRowIn(overlayNode),
      consoleErrors: [],
    };
  }, loadingText);
}

async function waitLoadingGone(page, loadingText, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const visible = await page.evaluate(
      (text) => (document.body?.innerText ?? "").includes(text),
      loadingText,
    );
    if (!visible) return { gone: true, waitedMs: Date.now() - start };
    await page.waitForTimeout(400);
  }
  return { gone: false, waitedMs: timeoutMs };
}

async function testRouteOnBase(page, base, label, routeKey, opts) {
  const cfg = ROUTES[routeKey];
  const url = routeUrl(base, routeKey);
  const errors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  // 等待 loading 文案出现（若会显示）
  try {
    await page.getByText(cfg.loadingText).first().waitFor({ state: "visible", timeout: 3000 });
  } catch {
    /* 可能已消失或无需 loading */
  }
  await page.waitForTimeout(400);
  const inspect = await inspectLoadingOverlay(page, cfg.loadingText);
  const dismiss = await waitLoadingGone(page, cfg.loadingText, opts.timeoutMs);

  const shotDir = path.join(opts.screenshotDir, label.replace(/[^\w-]+/g, "_"));
  ensureDir(shotDir);
  const shotPath = path.join(shotDir, `${routeKey}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  const issues = [];
  const styleIssues = [];
  const behaviorIssues = [];

  if (!dismiss.gone) behaviorIssues.push(`loading 文案「${cfg.loadingText}」在 ${opts.timeoutMs}ms 内未消失`);
  if (inspect.overlay == null) {
    styleIssues.push("未找到 loading overlay 根节点");
  } else {
    if (inspect.overlay.classCount < cfg.minRootClasses) {
      styleIssues.push(
        `overlay class 过少: ${inspect.overlay.classCount} < ${cfg.minRootClasses} (${inspect.overlay.className})`,
      );
    }
    if (inspect.overlay.display !== "flex") {
      styleIssues.push(`overlay 非 flex 布局: display=${inspect.overlay.display}`);
    }
  }
  if (inspect.dotsRow == null) {
    styleIssues.push("overlay 内未检测到横向 flex dots 行");
  } else if (inspect.dotsRow.classCount < 2) {
    styleIssues.push(`dots 行 class 过少: ${inspect.dotsRow.className}`);
  }

  issues.push(...styleIssues, ...behaviorIssues);

  return {
    label,
    base,
    routeKey,
    url,
    pass: styleIssues.length === 0 && behaviorIssues.length === 0,
    stylePass: styleIssues.length === 0,
    behaviorPass: behaviorIssues.length === 0,
    issues,
    styleIssues,
    behaviorIssues,
    dismiss,
    inspect,
    errors: errors.slice(0, 10),
    screenshot: shotPath,
  };
}

async function runSingleBase(playwright, base, label, opts) {
  const { browser, context } = await launchContext(playwright, opts);
  const page = await context.newPage();
  const results = [];
  try {
    for (const routeKey of opts.routes) {
      if (!ROUTES[routeKey]) continue;
      console.log(`\n>>> [${label}] ${routeKey} @ ${base}`);
      const result = await testRouteOnBase(page, base, label, routeKey, opts);
      results.push(result);
      console.log(
        result.pass
          ? "  ✓ PASS"
          : result.stylePass
            ? "  ~ STYLE OK / BEHAVIOR FAIL"
            : `  ✗ FAIL: ${result.issues.join("; ")}`,
      );
      if (result.inspect.overlay) {
        console.log(
          `    overlay classes(${result.inspect.overlay.classCount}): ${result.inspect.overlay.className}`,
        );
      }
      if (result.inspect.dotsRow) {
        console.log(
          `    dots row classes(${result.inspect.dotsRow.classCount}): ${result.inspect.dotsRow.className}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    "# Loading / Style Playwright 测试",
    "",
    `时间: ${report.timestamp}`,
    "",
    "| 端 | 路由 | 结果 | 问题 | overlay classes | dots row |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of report.results) {
    const overlay = r.inspect.overlay
      ? `${r.inspect.overlay.classCount}: \`${r.inspect.overlay.className.slice(0, 80)}\``
      : "-";
    const dots = r.inspect.dotsRow
      ? `${r.inspect.dotsRow.classCount}: \`${r.inspect.dotsRow.className.slice(0, 60)}\``
      : "-";
    lines.push(
      `| ${r.label} | ${r.routeKey} | ${r.pass ? "PASS" : "FAIL"} | ${r.issues.join("<br>") || "-"} | ${overlay} | ${dots} |`,
    );
  }
  lines.push("", "## 截图", "");
  for (const r of report.results) {
    lines.push(`- ${r.label}/${r.routeKey}: \`${path.relative(TEST_ROOT, r.screenshot)}\``);
  }
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`用法:
  node scripts/loading-style-test.mjs --base http://localhost:5173
  node scripts/loading-style-test.mjs --compare --base-a URL --base-b URL
  --routes order,service-list  --headless  --headed  --timeout 12000`);
    process.exit(0);
  }

  const playwright = await import("playwright");
  const results = [];

  if (opts.compare) {
    for (const basePair of [
      [opts.baseA, opts.labelA],
      [opts.baseB, opts.labelB],
    ]) {
      const [base, label] = basePair;
      const { browser, context } = await launchContext(playwright, opts);
      const page = await context.newPage();
      try {
        for (const routeKey of opts.routes) {
          if (!ROUTES[routeKey]) continue;
          console.log(`\n>>> [${label}] ${routeKey} @ ${base}`);
          const result = await testRouteOnBase(page, base, label, routeKey, opts);
          results.push(result);
          console.log(
            result.stylePass
              ? "  ✓ STYLE PASS"
              : `  ✗ STYLE FAIL: ${result.styleIssues.join("; ")}`,
          );
          if (result.inspect.overlay) {
            console.log(
              `    overlay classes(${result.inspect.overlay.classCount}): ${result.inspect.overlay.className}`,
            );
          }
          if (result.inspect.dotsRow) {
            console.log(
              `    dots row classes(${result.inspect.dotsRow.classCount}): ${result.inspect.dotsRow.className}`,
            );
          }
        }
      } finally {
        await browser.close();
      }
    }
  } else {
    results.push(...(await runSingleBase(playwright, opts.base, "single", opts)));
  }

  const report = {
    timestamp: new Date().toISOString(),
    opts: {
      compare: opts.compare,
      base: opts.base,
      baseA: opts.baseA,
      baseB: opts.baseB,
      routes: opts.routes,
    },
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    },
  };

  ensureDir(path.dirname(opts.out));
  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));
  fs.writeFileSync(opts.mdOut, renderMarkdown(report));

  console.log(`\n报告: ${opts.mdOut}`);
  console.log(`JSON: ${opts.out}`);
  console.log(`通过 ${report.summary.passed}/${report.summary.total}`);

  process.exit(
    opts.styleOnly
      ? report.results.some((r) => !r.stylePass)
        ? 1
        : 0
      : report.summary.failed > 0
        ? 1
        : 0,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
