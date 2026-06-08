import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEST_ROOT = path.resolve(__dirname, "..");
export const DEV_PORTS_PATH = path.join(TEST_ROOT, "config", "dev-ports.json");

export function loadDevPorts(testRoot = TEST_ROOT) {
  const p = path.join(testRoot, "config", "dev-ports.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function saveDevPorts(data, testRoot = TEST_ROOT) {
  const p = path.join(testRoot, "config", "dev-ports.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
  return p;
}

function normalizeBase(url) {
  if (url == null || url === "") return null;
  return String(url).replace(/\/+$/, "");
}

/** auto / 空值时从 dev-ports.json 读取 */
export function resolveBaseUrl(value, devPortsKey, devPorts) {
  const useAuto = value == null || value === "" || value === "auto";
  if (useAuto && devPorts?.[devPortsKey]?.base) {
    return normalizeBase(devPorts[devPortsKey].base);
  }
  return normalizeBase(value);
}

export function applyDevPortsToOpts(opts, testRoot = TEST_ROOT) {
  const devPorts = loadDevPorts(testRoot);
  opts.devPorts = devPorts;

  const resolvedA = resolveBaseUrl(opts.baseA, "source", devPorts);
  const resolvedB = resolveBaseUrl(opts.baseB, "obfuscated", devPorts);

  if (resolvedA) opts.baseA = resolvedA;
  if (resolvedB) {
    opts.baseB = resolvedB;
    if (!opts.compare) opts.base = resolvedB;
  }

  return opts;
}

export function requireDevPortsOrThrow(opts, testRoot = TEST_ROOT) {
  const needA = opts.compare || opts.baseA === "auto" || !opts.baseA;
  const needB = opts.compare || opts.base === "auto" || opts.baseB === "auto" || !opts.baseB;
  const devPorts = opts.devPorts ?? loadDevPorts(testRoot);

  if ((needA && !opts.baseA) || (needB && !opts.baseB && !opts.base)) {
    throw new Error(
      "未配置 H5 地址。请先启动双端 H5，再运行: node scripts/capture-dev-ports.mjs\n" +
        `或手动创建 ${path.relative(process.cwd(), DEV_PORTS_PATH)}`,
    );
  }
  return opts;
}
