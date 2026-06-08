import fs from 'fs-extra';
import fg from 'fast-glob';
import path from 'node:path';

const project = path.resolve(process.argv[2] ?? '../uni-test_20260606_150442_ieEHURxm5uhQOEcy');
const token = process.argv[3] ?? 'ieEHURxm5uhQOEcy';
const scopes = (process.argv[4] ?? 'uni_modules,pages,windows,components,store,common').split(',');

const exts = ['', '.uts', '.ts', '.js', '.vue', '.uvue', '.scss', '.css', '.json'];
const importRe = /(from\s+['"]|import\s+['"]|@import\s+['"])(\.[^'"]+)(['"])/g;

function resolveImport(baseDir, importPath) {
  const abs = path.normalize(path.join(baseDir, importPath));
  for (const ext of exts) {
    const candidate = ext && !abs.endsWith(ext) ? abs + ext : abs;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  }
  return false;
}

function stripToken(importPath) {
  return importPath
    .split('/')
    .map((seg) => (seg.startsWith(token) ? seg.slice(token.length) : seg))
    .join('/');
}

let changed = 0;
for (const scope of scopes) {
  const root = path.join(project, scope);
  if (!(await fs.pathExists(root))) continue;
  const files = await fg('**/*', { cwd: root, onlyFiles: true, dot: false });
  for (const rel of files) {
    if (!/\.(uts|ts|js|vue|uvue|scss|css)$/.test(rel)) continue;
    const abs = path.join(root, rel);
    const orig = await fs.readFile(abs, 'utf8');
    if (!orig.includes(token)) continue;
    const dir = path.dirname(abs);
    const updated = orig.replace(importRe, (full, prefix, importPath, suffix) => {
      if (!importPath.includes(token)) return full;
      const plain = stripToken(importPath);
      if (plain === importPath) return full;
      if (resolveImport(dir, plain)) return `${prefix}${plain}${suffix}`;
      return full;
    });
    if (updated !== orig) {
      await fs.writeFile(abs, updated, 'utf8');
      changed++;
    }
  }
}
console.log(`reverted wrong token imports in ${changed} files`);
