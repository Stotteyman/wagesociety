const fs = require('fs');
const path = require('path');
const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.md']);
const names = new Set();
const regex = /process\.env\.([A-Z0-9_]+)|import\.meta\.env\.([A-Z0-9_]+)|\b([A-Z0-9_]+)_([A-Z0-9_]+)/g;
function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (full.includes('node_modules') || full.includes('.git')) continue;
      walk(full);
    } else if (exts.has(path.extname(name.name))) {
      const txt = fs.readFileSync(full, 'utf8');
      let m;
      while ((m = regex.exec(txt))) {
        if (m[1]) names.add(m[1]);
        else if (m[2]) names.add(m[2]);
        else if (/^[A-Z0-9_]+$/.test(m[0])) names.add(m[0]);
      }
    }
  }
}
walk(root);
[...names].sort().forEach((n) => console.log(n));
