#!/usr/bin/env node
/**
 * 捕获 HBuilderX H5 实际端口，写入 config/dev-ports.json
 * 用法:
 *   node scripts/capture-dev-ports.mjs
 *   node scripts/capture-dev-ports.mjs --source-url http://localhost:5174 --obfuscated-url http://localhost:5173
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { saveDevPorts, TEST_ROOT } from "./dev-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(TEST_ROOT, "..");
const DEFAULT_SOURCE = path.join(WORKSPACE, "uni-starter-x");
const PORT_MIN = 5173;
const PORT_MAX = 5190;

function parseArgs(argv) {
  const opts = {
    sourceProject: DEFAULT_SOURCE,
    obfuscatedProject: "",
    sourceUrl: "",
    obfuscatedUrl: "",
    portMin: PORT_MIN,
    portMax: PORT_MAX,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source-project") opts.sourceProject = path.resolve(argv[++i]);
    else if (arg === "--obfuscated-project") opts.obfuscatedProject = path.resolve(argv[++i]);
    else if (arg === "--source-url") opts.sourceUrl = argv[++i];
    else if (arg === "--obfuscated-url") opts.obfuscatedUrl = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

async function probePort(port) {
  const base = `http://localhost:${port}`;
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(2500) });
    const text = await res.text();
    const looksLikeUni =
      res.ok &&
      (text.includes("uni-app") ||
        text.includes('id="app"') ||
        text.includes("/@vite/client") ||
        text.includes("vite"));
    if (!looksLikeUni) return null;
    return { port, base };
  } catch {
    return null;
  }
}

async function scanLivePorts(min, max) {
  const ports = [];
  for (let p = min; p <= max; p++) {
    const hit = await probePort(p);
    if (hit) ports.push(hit);
  }
  return ports;
}

const L1_L4_OBFUSCATED_DIR = "uni-starter-x_yPhMVaVR6HcrZm1R";

function isObfuscatedProjectDirName(name) {
  if (name === "uni-starter-x") return false;
  if (/^uni-starter-x_[A-Za-z0-9]+$/.test(name)) return true;
  if (/^uni-starter-x_[^_]+_[A-Za-z0-9]+$/.test(name)) return true;
  return false;
}

function guessObfuscatedProjectDir() {
  if (!fs.existsSync(WORKSPACE)) return "";
  const preferred = path.join(WORKSPACE, L1_L4_OBFUSCATED_DIR);
  if (fs.existsSync(preferred)) return preferred;
  const entries = fs
    .readdirSync(WORKSPACE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isObfuscatedProjectDirName(e.name))
    .map((e) => path.join(WORKSPACE, e.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] ?? "";
}

function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pickUrl(label, candidates, preset) {
  if (preset) return preset.replace(/\/+$/, "");
  if (candidates.length === 1) {
    console.log(`  ${label}: 自动选用 ${candidates[0].base}`);
    return candidates[0].base;
  }
  console.log(`\n${label} 候选:`);
  candidates.forEach((c, i) => console.log(`  [${i + 1}] ${c.base}`));
  const raw = await askLine(`${label} URL（输入序号或完整 URL）: `);
  const idx = Number.parseInt(raw, 10);
  if (!Number.isNaN(idx) && idx >= 1 && idx <= candidates.length) {
    return candidates[idx - 1].base;
  }
  if (raw.startsWith("http")) return raw.replace(/\/+$/, "");
  throw new Error(`${label} 未选择有效 URL`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`用法: node scripts/capture-dev-ports.mjs [--source-url URL] [--obfuscated-url URL]`);
    process.exit(0);
  }

  console.log("扫描本地 H5 端口...");
  const live = await scanLivePorts(opts.portMin, opts.portMax);
  if (live.length === 0) {
    console.error("未发现运行中的 H5（5173–5190）。请先在 HBuilderX 启动源码与混淆项目。");
    process.exit(1);
  }
  console.log(`发现 ${live.length} 个候选: ${live.map((x) => x.base).join(", ")}`);

  let sourceUrl = opts.sourceUrl;
  let obfuscatedUrl = opts.obfuscatedUrl;

  if (!sourceUrl || !obfuscatedUrl) {
    if (live.length >= 2 && !sourceUrl && !obfuscatedUrl) {
      sourceUrl = live[0].base;
      obfuscatedUrl = live[1].base;
      console.log(`\n默认: 源码=${sourceUrl}, 混淆=${obfuscatedUrl}（按端口升序）`);
      const confirm = await askLine("直接写入 dev-ports.json? [Y/n]: ");
      if (confirm.toLowerCase() === "n") {
        sourceUrl = await pickUrl("源码", live, "");
        const rest = live.filter((x) => x.base !== sourceUrl);
        obfuscatedUrl = await pickUrl("混淆", rest.length ? rest : live, "");
      }
    } else {
      if (!sourceUrl) sourceUrl = await pickUrl("源码", live, "");
      const rest = live.filter((x) => x.base !== sourceUrl);
      if (!obfuscatedUrl) obfuscatedUrl = await pickUrl("混淆", rest.length ? rest : live, "");
    }
  }

  const obfuscatedProject = opts.obfuscatedProject || guessObfuscatedProjectDir();
  const data = {
    source: {
      project: opts.sourceProject,
      base: sourceUrl,
    },
    obfuscated: {
      project: obfuscatedProject,
      base: obfuscatedUrl,
    },
    updatedAt: new Date().toISOString(),
  };

  const out = saveDevPorts(data);
  console.log(`\n已写入 ${out}`);
  console.log(`  源码:   ${data.source.base}`);
  console.log(`  混淆:   ${data.obfuscated.base}`);
  if (data.obfuscated.project) console.log(`  混淆目录: ${data.obfuscated.project}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
