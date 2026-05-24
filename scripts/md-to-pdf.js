import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  const mdPath = path.join(__dirname, '..', 'docs', 'supabase-express-oauth-explain.md');
  const outPdf = path.join(__dirname, '..', 'docs', 'supabase-express-oauth.pdf');
  const md = await fs.readFile(mdPath, 'utf8');
  const htmlBody = marked(md);
  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Supabase OAuth + Express/EJS</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; margin: 40px; color: #111827; }
      h1, h2, h3 { color: #0f172a; }
      pre { background: #f3f4f6; padding: 12px; overflow: auto; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Courier New', monospace; }
      /* ensure page breaks between sections when printing */
      h1 { page-break-before: always; }
    </style>
  </head>
  <body>
    ${htmlBody}
  </body>
  </html>`;

  console.log('Launching headless browser (may download Chromium on first run)...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: outPdf, format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();
  console.log('PDF generated at', outPdf);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
