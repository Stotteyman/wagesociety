const fs = require('fs');
const path = require('path');
const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.md']);
const prefixes = [
  'SUPABASE', 'VITE_SUPABASE', 'NEXT_PUBLIC_SUPABASE',
  'STRIPE', 'YOUTUBE', 'TWITCH', 'KICK', 'RESEND', 'AUTOCLIPPER', 'MOBILE_APP',
  'DATABASE_URL', 'VITE_AUTH_REDIRECT_ORIGIN', 'NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN',
  'EXTERNAL_API_KEY', 'BOT_API_SECRET', 'VITE_APP_NAME'
];
const envUsages = new Map();
const regex = /(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g;
function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (full.includes('node_modules') || full.includes('.git')) continue;
      walk(full);
    } else if (exts.has(path.extname(name.name))) {
      const txt = fs.readFileSync(full, 'utf8');
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        while ((m = regex.exec(line))) {
          const key = m[1];
          if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
          const loc = `${path.relative(root, full)}:${i + 1}`;
          const set = envUsages.get(key) || new Set();
          set.add(loc);
          envUsages.set(key, set);
        }
      }
    }
  }
}
walk(root);
for (const [name, locations] of [...envUsages.entries()].sort()) {
  console.log(name);
  for (const loc of [...locations].sort()) {
    console.log(`  ${loc}`);
  }
}