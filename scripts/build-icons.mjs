// Renders assets/icons/icon.svg into the PNG sizes required by iOS and the web manifest.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../assets/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const targets = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, true]
];
for (const [name, size, fullBleed] of targets) {
    // Maskable / Apple icons: full-bleed background, artwork inside the 80% safe zone.
    const inner = fullBleed
        ? `<div style="width:${size}px;height:${size}px;background:#0d0f12;display:grid;place-items:center"><div style="width:${size * 0.86}px;height:${size * 0.86}px">${svg.replace('rx="112"', 'rx="0"')}</div></div>`
        : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${inner}`);
    await writeFile(new URL(`../assets/icons/${name}`, import.meta.url), await page.screenshot({ omitBackground: !fullBleed }));
    console.log('✓', name);
}
await browser.close();
