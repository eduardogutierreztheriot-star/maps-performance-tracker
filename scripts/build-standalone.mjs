// Bundles the app into one self-contained HTML file (fonts, CSS, JS inlined).
// Useful for sharing a single file or opening it without a server.
//   node scripts/build-standalone.mjs [output]   (default: dist/maps-performance-tracker.html)
// Options: --fragment  omit <!doctype>/<html>/<head>/<body> (for hosts that add their own skeleton)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find((a) => !a.startsWith('--')) || resolve(root, 'dist/maps-performance-tracker.html'));
const read = (p) => readFile(resolve(root, p), 'utf8');

let css = await read('assets/css/app.css');
for (const [, file] of css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
    const data = (await readFile(resolve(root, 'assets/fonts', file))).toString('base64');
    css = css.replace(`url("../fonts/${file}")`, `url(data:font/woff2;base64,${data})`);
}
const js = (await Promise.all(['program', 'core', 'charts', 'app'].map((n) => read(`assets/js/${n}.js`)))).join('\n');
const html = await read('index.html');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const themeScript = html.match(/<script>\s*\/\* Resolve the theme[\s\S]*?<\/script>/)[0];
const body = html.match(/<body>([\s\S]*?)<script src=/)[1];
const icon = 'data:image/svg+xml;base64,' + (await readFile(resolve(root, 'assets/icons/icon.svg'))).toString('base64');
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const head = `${title}
<meta name="description" content="Registro de entrenamientos MAPS Performance Blueprint.">
<meta name="theme-color" content="#0d0f12">
<link rel="icon" href="${icon}">
${themeScript}
<style>${css}</style>`;
const page = fragment
    ? `${head}\n${body}<script>${safeJs}</script>\n`
    : `<!DOCTYPE html>\n<html lang="es" data-theme="dark">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>${body}<script>${safeJs}</script>\n</body>\n</html>\n`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
console.log(`✓ ${out} (${(page.length / 1024).toFixed(0)} KB)`);
