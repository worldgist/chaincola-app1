import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules') continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (name.name.endsWith('.tsx') || name.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

let n = 0;
for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))]) {
  let s = fs.readFileSync(file, 'utf8');
  let next = s.replace(/,\s*\n\s*,\s*\n/g, ',\n');
  next = next.replace(/, {2,}([A-Za-z{])/g, ', $1');
  if (next !== s) {
    fs.writeFileSync(file, next, 'utf8');
    console.log('fixed', path.relative(root, file));
    n++;
  }
}
console.log('total', n);
