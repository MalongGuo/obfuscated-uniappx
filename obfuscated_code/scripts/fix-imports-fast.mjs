import fs from 'fs-extra';
import fg from 'fast-glob';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReplacements, isTextFile } from '../dist/path/replacer.js';
import { buildContentReplacementGuard } from '../dist/path/anchors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectBasenameMappings(renameLog, protectedBasenames) {
  const map = new Map();
  const conflicts = new Set();
  const upsert = (key, value) => {
    const existing = map.get(key);
    if (existing && existing !== value) conflicts.add(key);
    else map.set(key, value);
  };
  for (const { from, to } of renameLog) {
    if (!from || !to || from === to) continue;
    const fromBase = from.split('/').pop();
    const toBase = to.split('/').pop();
    if (fromBase === toBase) continue;
    if (!protectedBasenames.has(fromBase)) upsert(fromBase, toBase);
    const fromDot = fromBase.indexOf('.');
    const toDot = toBase.indexOf('.');
    if (fromDot > 0 && toDot > 0) {
      const fromStem = fromBase.slice(0, fromDot);
      if (!protectedBasenames.has(fromStem)) upsert(fromStem, toBase.slice(0, toDot));
    }
  }
  for (const key of conflicts) map.delete(key);
  for (const key of protectedBasenames) map.delete(key);
  return map;
}

const project = path.resolve(process.argv[2] ?? path.join(__dirname, '../../uni-test_20260606_150442_ieEHURxm5uhQOEcy'));
const mapPath = path.resolve(
  process.argv[3] ?? path.join(__dirname, '../../log/uni-test_20260606_150434_ieEHURxm5uhQOEcy/obfuscation-map-paths.json'),
);

const map = await fs.readJson(mapPath);
const renameLog = [...map.mappings, ...map.fileMappings];
const guard = buildContentReplacementGuard();
const basenameMap = collectBasenameMappings(renameLog, guard);
const reps = [...basenameMap].map(([fromBase, toBase]) => ({ from: `./${fromBase}`, to: `./${toBase}` }));
reps.sort((a, b) => b.from.length - a.from.length);

const scopes = (process.argv[4] ?? 'pages,windows,components,store').split(',');
const files = [];
for (const scope of scopes) {
  const root = path.join(project, scope);
  if (await fs.pathExists(root)) {
    files.push(...(await fg('**/*', { cwd: root, onlyFiles: true, dot: false })).map((f) => path.join(scope, f)));
  }
}
const importRe = /from\s+['"]\.\//;
let changed = 0;

for (const rel of files) {
  if (!isTextFile(rel) || rel.endsWith('package.json')) continue;
  const abs = path.join(project, rel);
  const orig = await fs.readFile(abs, 'utf8');
  if (!importRe.test(orig)) continue;
  const updated = applyReplacements(orig, reps);
  if (updated !== orig) {
    await fs.writeFile(abs, updated, 'utf8');
    changed++;
  }
}

console.log(`basename reps: ${reps.length}, fixed ${changed} files`);
