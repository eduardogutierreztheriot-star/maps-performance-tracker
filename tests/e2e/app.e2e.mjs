/*
 * End-to-end suite: drives the real app in Chromium.
 *   node tests/e2e/app.e2e.mjs            run all checks
 *   SCREENSHOTS=dir node tests/e2e/...    also save screenshots to `dir`
 * Exits non-zero on the first failing check.
 */
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SCREENSHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const server = createServer().listen(0);
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

let passed = 0;
const results = [];
async function check(name, fn) {
    const started = Date.now();
    try {
        await fn();
        passed++;
        results.push(`  ✓ ${name} (${Date.now() - started} ms)`);
        console.log(results[results.length - 1]);
    } catch (err) {
        console.log(`  ✗ ${name}\n${err.stack}`);
        await browser.close();
        server.close();
        process.exit(1);
    }
}

async function newPage(opts = {}) {
    const context = await browser.newContext({
        viewport: opts.viewport || { width: 390, height: 844 },
        deviceScaleFactor: opts.dpr || 1,
        locale: 'es-MX',
        timezoneId: 'America/Mexico_City',
        colorScheme: opts.colorScheme || 'dark',
        reducedMotion: opts.reducedMotion || 'reduce',
        acceptDownloads: true,
        serviceWorkers: opts.serviceWorkers || 'block'
    });
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
    if (opts.init) await page.addInitScript(opts.init);
    return { context, page };
}

const appState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('maps.v2')));

async function axe(page, label) {
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    assert.deepEqual(res, [], `axe violations on ${label}:\n${res.join('\n')}`);
}

/* Legacy v1 data, written exactly like the old app did (evening session in UTC−6). */
const LEGACY_INIT = () => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const evening = new Date(2026, 8, 30, 19, 45); // 30 sep 2026, 7:45 pm local
    const earlier = new Date(2026, 8, 23, 7, 0);
    localStorage.setItem('maps_logs', JSON.stringify([
        {
            timestamp: evening.getTime(), workoutDate: evening.toISOString(), date: '30/9/2026',
            phase: 'P1', phaseName: 'Phase I', day: 'Día 1', notes: '<b>no html</b>',
            exercises: [
                { name: 'Phase 1 Squat', target: '3', sets: [{ set: 1, weight: '100', reps: '3', done: true }, { set: 2, weight: '102.5', reps: '3', done: true }] },
                { name: 'Phase 1 Bench Press', target: '3', sets: [{ set: 1, weight: '70', reps: '3', done: true }] }
            ]
        },
        {
            timestamp: earlier.getTime(), workoutDate: earlier.toISOString(), date: '23/9/2026',
            phase: 'P1', phaseName: 'Phase I', day: 'Día 1', notes: '',
            exercises: [{ name: 'Phase 1 Squat', target: '3', sets: [{ set: 1, weight: '95', reps: '3', done: true }] }]
        }
    ]));
    localStorage.setItem('workout_schedule', JSON.stringify({ 'P1-D2': '2030-01-15' }));
    localStorage.setItem('theme', 'light');
};

console.log('MAPS Performance Tracker — e2e');

await check('boots with no console errors on every view', async () => {
    const { context, page } = await newPage();
    for (const r of ['train', 'program', 'history', 'progress', 'settings']) {
        await page.goto(BASE + '#' + r);
        await page.waitForSelector('.page-title');
    }
    assert.deepEqual(page.errors, []);
    await context.close();
});

await check('migrates v1 data with correct local dates, keeps the legacy backup', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#history');
    await page.waitForSelector('.log');
    const st = await appState(page);
    assert.equal(st.sessions.length, 2);
    assert.equal(st.sessions[0].date, '2026-09-30', 'evening session must stay on its local day');
    assert.equal(st.sessions[0].dayId, 'D1');
    assert.equal(st.sessions[0].exercises[0].sets[1].weight, 102.5);
    assert.equal(st.settings.theme, 'light');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    assert.ok(await page.evaluate(() => localStorage.getItem('maps_logs')), 'legacy key preserved');
    // Notes are rendered as text, never HTML.
    await page.click('.log-summary >> nth=0');
    assert.equal(await page.locator('.log-notes').first().textContent(), '<b>no html</b>');
    assert.equal(await page.locator('.log-notes b').count(), 0);
    assert.deepEqual(page.errors, []);
    await context.close();
});

await check('logs a full strength session: two-tap sets, auto rest, PR, summary, history', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#train');
    await page.click('[data-action="start"][data-day="D1"].day-card');
    await page.waitForSelector('.session-title');
    assert.match(await page.textContent('.session-title'), /Fase I · Día 1/);
    assert.equal(await page.inputValue('#sessionDate'), await page.evaluate(() => window.MapsCore.todayISO()));

    // Previous performance is shown as hints.
    const firstRow = page.locator('.exercise[data-ex="0"] .set-row:not(.is-head)').first();
    assert.equal((await firstRow.locator('.set-prev').textContent()).trim(), '100 × 3');
    assert.equal(await firstRow.locator('[data-field="weight"]').getAttribute('placeholder'), '100');

    // Type a PR on set 1, then tick it.
    await firstRow.locator('[data-field="weight"]').fill('110');
    await firstRow.locator('[data-field="reps"]').fill('3');
    await firstRow.locator('.check').click();
    await page.waitForSelector('#restTimer:not([hidden])');
    assert.match(await page.textContent('.timer-time'), /^[23]:\d\d$/);
    // Set 2: tick with empty fields → takes the previous values (two-tap logging).
    const row2 = page.locator('.exercise[data-ex="0"] .set-row:not(.is-head)').nth(1);
    await row2.locator('.check').click();
    assert.equal(await row2.locator('[data-field="weight"]').inputValue(), '102.5');
    assert.equal(await row2.locator('[data-field="reps"]').inputValue(), '3');
    assert.equal(await page.textContent('#progressText'), '2/17 sets');

    // Timer controls.
    await page.click('[data-action="rest-adjust"][data-delta="15"]');
    await page.click('[data-action="rest-pause"]');
    assert.match(await page.textContent('.timer-label'), /pausa/i);
    await page.click('[data-action="rest-stop"]');
    assert.ok(await page.isHidden('#restTimer'));

    // Draft survives a reload.
    await page.fill('#sessionNotes', 'Buen día');
    await page.waitForTimeout(400);
    await page.reload();
    await page.goto(BASE + '#session');
    await page.waitForSelector('.session-title');
    assert.equal(await page.inputValue('#sessionNotes'), 'Buen día');
    assert.equal(await page.locator('.set-row.is-done').count(), 2);

    // Save → summary with the record.
    await page.click('.session-actions [data-action="save-session"]');
    await page.waitForSelector('dialog[open] .summary');
    assert.match(await page.textContent('dialog[open]'), /Phase 1 Squat/);
    assert.match(await page.textContent('dialog[open]'), /110/);
    await page.click('dialog[open] .btn-primary');
    const st = await appState(page);
    assert.equal(st.sessions.length, 3);
    const saved = st.sessions.find((s) => s.notes === 'Buen día');
    assert.equal(saved.exercises[0].sets[0].weight, 110);
    assert.equal(saved.exercises[0].sets.length, 2, 'empty sets are not stored');
    assert.equal(await page.evaluate(() => localStorage.getItem('maps.v2.draft')), null, 'draft cleared');

    await page.goto(BASE + '#history');
    await page.waitForSelector('.log');
    assert.equal(await page.locator('.log').count(), 3);
    assert.deepEqual(page.errors, []);
    await context.close();
});

await check('mobility session logs completion and notes', async () => {
    const { context, page } = await newPage();
    await page.goto(BASE + '#train');
    await page.click('[data-action="pick-phase"][data-phase="MOB"]');
    await page.click('.day-card[data-day="S1"]');
    await page.waitForSelector('.mob-row');
    await page.locator('.mob-row .check').first().click();
    await page.locator('.mob-row [data-field="note"]').first().fill('Cadera suelta');
    await page.click('.session-actions [data-action="save-session"]');
    await page.waitForSelector('dialog[open]');
    const st = await appState(page);
    assert.equal(st.sessions[0].phase, 'MOB');
    assert.equal(st.sessions[0].exercises[0].completed, true);
    assert.equal(st.sessions[0].exercises[0].note, 'Cadera suelta');
    await context.close();
});

await check('refuses to save an empty session', async () => {
    const { context, page } = await newPage();
    await page.goto(BASE + '#train');
    await page.click('.hero [data-action="start"]');
    await page.click('.session-actions [data-action="save-session"]');
    await page.waitForSelector('.toast-error');
    assert.equal((await appState(page)).sessions.length, 0);
    await context.close();
});

await check('progress view: KPIs, line chart, metric switch, weekly volume, records', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#progress');
    await page.waitForSelector('#exerciseChart svg path.series-line');
    assert.equal(await page.locator('.kpi').count(), 4);
    assert.equal(await page.locator('#volumeChart svg .series-bar').count(), 2); // 23 sep and 30 sep are different weeks
    await page.click('[data-action="metric"][data-metric="max"]');
    assert.match(await page.textContent('#exChartTitle'), /Peso máximo/);
    assert.match(await page.textContent('.chart-figure'), /102\.5/);
    // Keyboard access to chart values.
    await page.focus('#exerciseChart svg');
    await page.keyboard.press('Home');
    assert.ok(await page.isVisible('#exerciseChart .chart-tooltip'));
    assert.match(await page.textContent('#exerciseChart .chart-tooltip'), /95/);
    // Records table.
    assert.match(await page.textContent('.table-wrap.card .table'), /Phase 1 Squat/);
    // Exercise detail sheet.
    await page.click('.table-wrap.card [data-action="exercise-detail"] >> nth=0');
    await page.waitForSelector('dialog[open]');
    await page.keyboard.press('Escape');
    assert.deepEqual(page.errors, []);
    await context.close();
});

await check('settings: units convert history, theme switches, rest override persists', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#settings');
    await page.click('[data-action="set-unit"][data-value="lb"]');
    await page.click('[data-action="set-theme"][data-value="dark"]');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await page.selectOption('#rest-P1', '120');
    await page.goto(BASE + '#history');
    await page.click('.log-summary >> nth=0');
    assert.match(await page.textContent('.log-body'), /226 lb/); // 102.5 kg
    const st = await appState(page);
    assert.equal(st.settings.unit, 'lb');
    assert.equal(st.settings.restOverrides.P1, 120);
    // Logged in lb → stored as kg.
    await page.goto(BASE + '#train');
    await page.click('.day-card[data-day="D2"]');
    const row = page.locator('.exercise[data-ex="0"] .set-row:not(.is-head)').first();
    await row.locator('[data-field="weight"]').fill('225');
    await row.locator('[data-field="reps"]').fill('6');
    await row.locator('.check').click();
    assert.match(await page.textContent('.timer-time'), /^(2:00|1:59|1:58)$/);
    await page.click('.session-actions [data-action="save-session"]');
    await page.waitForSelector('dialog[open]');
    const after = await appState(page);
    const d2 = after.sessions.find((s) => s.dayId === 'D2');
    assert.ok(Math.abs(d2.exercises[0].sets[0].weight - 102.058) < 0.01);
    await context.close();
});

await check('export JSON/CSV, import merges without duplicates', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-json"]')]);
    const path = await dl.path();
    const backup = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(backup.app, 'maps-performance-tracker');
    assert.equal(backup.sessions.length, 2);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-csv"]')]);
    const csvText = await readFile(await csv.path(), 'utf8');
    assert.match(csvText, /fecha,fase,dia,ejercicio/);
    assert.match(csvText, /2026-09-30,Fase I,Día 1,Phase 1 Squat,2,102\.5,kg,3,si/);

    // Re-import same backup → nothing added.
    await page.setInputFiles('#importFile', path);
    await page.waitForSelector('.toast-info');
    assert.equal((await appState(page)).sessions.length, 2);
    // Import into an empty profile.
    await page.click('[data-action="clear-all"]');
    await page.click('#confirmOk');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('maps.v2')).sessions.length === 0);
    await page.setInputFiles('#importFile', path);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('maps.v2')).sessions.length === 2);
    // Invalid file → friendly error.
    await page.setInputFiles('#importFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
    await page.waitForSelector('.toast-error');
    await context.close();
});

await check('history: filter, search, delete with undo', async () => {
    const { context, page } = await newPage({ init: LEGACY_INIT });
    await page.goto(BASE + '#history');
    await page.fill('#historySearch', 'bench');
    assert.equal(await page.locator('.log').count(), 1);
    await page.fill('#historySearch', '');
    await page.click('[data-action="history-filter"][data-filter="P2"]');
    assert.match(await page.textContent('#historyList'), /No hay sesiones/);
    await page.click('[data-action="history-filter"][data-filter="all"]');
    await page.click('.log-summary >> nth=0');
    await page.click('[data-action="delete-session"] >> nth=0');
    await page.click('#confirmOk');
    await page.waitForSelector('.toast-action');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('maps.v2')).sessions.length === 1);
    assert.equal((await appState(page)).sessions.length, 1);
    await page.click('.toast-action');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('maps.v2')).sessions.length === 2);
    await context.close();
});

await check('program view: schedule a day and see it upcoming', async () => {
    const { context, page } = await newPage();
    await page.goto(BASE + '#program');
    await page.click('.phase-block >> nth=0 >> details >> nth=0 >> summary');
    await page.fill('#sch-P1-D1', '2031-03-04');
    await page.dispatchEvent('#sch-P1-D1', 'change');
    await page.waitForSelector('.upcoming-item');
    assert.equal((await appState(page)).schedule['P1-D1'], '2031-03-04');
    await context.close();
});

await check('accessibility: axe WCAG 2.2 AA clean on every view, both themes', async () => {
    for (const colorScheme of ['dark', 'light']) {
        const { context, page } = await newPage({ init: LEGACY_INIT, colorScheme });
        await page.goto(BASE + '#train');
        await page.evaluate((t) => { const d = JSON.parse(localStorage.getItem('maps.v2')); d.settings.theme = t; localStorage.setItem('maps.v2', JSON.stringify(d)); }, colorScheme);
        for (const r of ['train', 'program', 'history', 'progress', 'settings']) {
            await page.goto(BASE + '#' + r);
            await page.reload();
            await page.waitForSelector('.page-title');
            await page.waitForTimeout(150);
            await axe(page, `${r} (${colorScheme})`);
        }
        await page.goto(BASE + '#train');
        await page.click('.day-card[data-day="D1"]');
        await page.waitForSelector('.session-title');
        await axe(page, `session (${colorScheme})`);
        await context.close();
    }
});

await check('layout: no horizontal overflow from 320px to 1440px', async () => {
    for (const width of [320, 390, 768, 1024, 1440]) {
        const { context, page } = await newPage({ init: LEGACY_INIT, viewport: { width, height: 900 } });
        for (const r of ['train', 'program', 'history', 'progress', 'settings', 'session']) {
            if (r === 'session') { await page.goto(BASE + '#train'); await page.click('.day-card[data-day="D1"]'); }
            else await page.goto(BASE + '#' + r);
            await page.waitForTimeout(100);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            assert.ok(overflow <= 0, `${r} overflows by ${overflow}px at ${width}px`);
        }
        await context.close();
    }
});

await check('PWA: service worker installs and the app works offline', async () => {
    const { context, page } = await newPage({ serviceWorkers: 'allow' });
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.page-title');
    assert.match(await page.textContent('.page-title'), /Entrenar/);
    assert.ok(await page.evaluate(() => document.fonts.check('700 16px "Barlow Condensed"')), 'fonts available offline');
    await context.setOffline(false);
    const manifest = await (await fetch(BASE + 'manifest.json')).json();
    assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
    await context.close();
});

if (SHOTS) {
    await check('screenshots', async () => {
        const views = ['train', 'session', 'progress', 'history', 'program', 'settings'];
        for (const [name, viewport, colorScheme] of [['mobile-dark', { width: 390, height: 844 }, 'dark'], ['mobile-light', { width: 390, height: 844 }, 'light'], ['desktop-dark', { width: 1440, height: 900 }, 'dark']]) {
            const { context, page } = await newPage({ init: LEGACY_INIT, viewport, colorScheme, dpr: 2, reducedMotion: 'no-preference' });
            await page.goto(BASE + '#train');
            await page.evaluate((t) => { const d = JSON.parse(localStorage.getItem('maps.v2')); d.settings.theme = t; localStorage.setItem('maps.v2', JSON.stringify(d)); }, colorScheme);
            for (const v of views) {
                if (v === 'session') { await page.goto(BASE + '#train'); await page.waitForTimeout(400); await page.click('.day-card[data-day="D1"]'); }
                else { await page.goto(BASE + '#' + v); await page.reload(); }
                await page.waitForTimeout(1800);
                await page.screenshot({ path: `${SHOTS}/${name}-${v}.png` });
            }
            await context.close();
        }
    });
}

await browser.close();
server.close();
console.log(`\n${passed} checks passed`);
