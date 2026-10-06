/*
 * MAPS Performance Tracker — UI layer.
 * Hash router + views rendered from state, delegated events, rest timer,
 * 3D barbell hero, celebrations. Depends on MapsProgram, MapsCore, MapsCharts.
 */
(function () {
    'use strict';

    const P = window.MapsProgram;
    const C = window.MapsCore;
    const Charts = window.MapsCharts;
    const esc = C.escapeHTML;
    const LOCALE = 'es-MX';
    const VERSION = '2.0.0';

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    /* ------------------------------------------------------------------ *
     * Safe storage (private mode / sandboxed frames can throw)
     * ------------------------------------------------------------------ */
    const storage = {
        getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        setItem(k, v) {
            try { window.localStorage.setItem(k, v); return true; }
            catch (e) { toast('No se pudo guardar en este dispositivo. Libera espacio o exporta un respaldo desde Ajustes.', { type: 'error' }); return false; }
        },
        removeItem(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    };

    /* ------------------------------------------------------------------ *
     * State
     * ------------------------------------------------------------------ */
    const loaded = C.loadState(storage, P);
    const state = loaded.state;
    const ui = {
        route: 'train',
        phase: null,
        historyFilter: 'all',
        historyQuery: '',
        historyLimit: 20,
        expanded: {},
        progressExercise: null,
        progressMetric: 'e1rm',
        rendered: false
    };
    let draft = readDraft();

    /** Returns false when the browser refused the write (quota, private mode). */
    function persist() { return C.saveState(storage, state) !== false; }

    function readDraft() {
        try {
            const d = JSON.parse(storage.getItem(C.KEYS.draft) || 'null');
            if (d && P.getDay(d.phase, d.dayId) && Array.isArray(d.exercises)) return reconcileDraft(d);
        } catch (e) { /* ignore */ }
        return null;
    }

    /** Re-align a stored draft with the current program (exercises may have been edited). */
    function reconcileDraft(d) {
        const day = P.getDay(d.phase, d.dayId);
        const byName = {};
        d.exercises.forEach((ex) => { if (ex && typeof ex.name === 'string') byName[ex.name] = ex; });
        d.exercises = day.exercises.map((ex) => {
            const old = byName[ex.name];
            const sets = old && Array.isArray(old.sets) ? old.sets.filter((s) => s && typeof s === 'object').map((s) => ({
                weight: typeof s.weight === 'string' ? s.weight : '', reps: typeof s.reps === 'string' ? s.reps : '', done: !!s.done
            })) : [];
            while (sets.length < (ex.sets || 1)) sets.push({ weight: '', reps: '', done: false });
            return { name: ex.name, done: !!(old && old.done), note: old && typeof old.note === 'string' ? old.note : '', sets: sets };
        });
        if (!C.isISODate(d.date)) d.date = C.todayISO();
        if (d.unit !== 'kg' && d.unit !== 'lb') d.unit = 'kg';
        if (typeof d.notes !== 'string') d.notes = '';
        return d;
    }
    let draftTimer = null;
    function saveDraftSoon() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraftNow, 250);
    }
    function saveDraftNow() {
        clearTimeout(draftTimer);
        if (draft) storage.setItem(C.KEYS.draft, JSON.stringify(draft));
        else storage.removeItem(C.KEYS.draft);
    }

    /* ------------------------------------------------------------------ *
     * Formatting
     * ------------------------------------------------------------------ */
    const fmt = {
        day: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }),
        dayShort: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
        long: new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        longNoYear: new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
        month: new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }),
        dow: new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }),
        dowNarrow: new Intl.DateTimeFormat(LOCALE, { weekday: 'narrow' }),
        int: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }),
        dec: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }),
        compact: new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
    };
    const d = (iso) => C.parseISODate(iso);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const fmtDay = (iso) => fmt.day.format(d(iso)).replace(/\./g, '');
    const fmtDayShort = (iso) => fmt.dayShort.format(d(iso)).replace(/\./g, '');
    const fmtLong = (iso) => cap(fmt.long.format(d(iso)));
    const fmtMonth = (iso) => cap(fmt.month.format(d(iso)));
    const unit = () => state.settings.unit;
    const w = (kg) => C.displayWeight(kg, unit());
    const wu = (kg) => fmt.dec.format(C.round(C.fromKg(kg, unit()), 1)) + ' ' + unit();
    const vol = (kg) => fmt.compact.format(C.fromKg(kg, unit()));
    const today = () => C.todayISO();

    function relDays(iso) {
        const n = C.daysBetween(iso, today());
        if (n === 0) return 'Hoy';
        if (n === 1) return 'Ayer';
        if (n === -1) return 'Mañana';
        if (n < 0) return 'En ' + (-n) + ' días';
        if (n < 7) return 'Hace ' + n + ' días';
        if (n < 14) return 'Hace 1 semana';
        if (n < 60) return 'Hace ' + Math.floor(n / 7) + ' semanas';
        return fmtDay(iso);
    }
    function plural(n, one, many) { return fmt.int.format(n) + ' ' + (n === 1 ? one : many); }
    function icon(name, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

    /* ------------------------------------------------------------------ *
     * Theme
     * ------------------------------------------------------------------ */
    const THEME_META = {
        system: { icon: 'monitor', label: 'Sistema' },
        light: { icon: 'sun', label: 'Claro' },
        dark: { icon: 'moon', label: 'Oscuro' }
    };
    function resolvedTheme() {
        const pref = state.settings.theme;
        if (pref === 'light' || pref === 'dark') return pref;
        return darkQuery && darkQuery.matches ? 'dark' : 'light';
    }
    function applyTheme() {
        const t = resolvedTheme();
        document.documentElement.setAttribute('data-theme', t);
        const meta = $('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', t === 'dark' ? '#0d0f12' : '#eef0f3');
        const btn = $('#themeBtn');
        if (btn) {
            const m = THEME_META[state.settings.theme];
            btn.innerHTML = icon(m.icon);
            btn.setAttribute('aria-label', 'Tema: ' + m.label + '. Cambiar tema');
            btn.title = 'Tema: ' + m.label;
        }
    }
    if (darkQuery && darkQuery.addEventListener) {
        darkQuery.addEventListener('change', () => { if (state.settings.theme === 'system') { applyTheme(); rerenderCharts(); } });
    }

    /* ------------------------------------------------------------------ *
     * Toasts & dialogs
     * ------------------------------------------------------------------ */
    function toast(message, opts) {
        opts = opts || {};
        const region = $('#toasts');
        if (!region) return;
        const el = document.createElement('div');
        el.className = 'toast toast-' + (opts.type || 'success');
        const ic = opts.type === 'error' ? 'alert' : opts.type === 'record' ? 'trophy' : opts.type === 'info' ? 'info' : 'check-circle';
        el.innerHTML = icon(ic) + '<span class="toast-msg"></span>';
        el.querySelector('.toast-msg').textContent = message;
        if (opts.action) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'toast-action';
            b.textContent = opts.action.label;
            b.addEventListener('click', () => { opts.action.fn(); dismiss(); });
            el.appendChild(b);
        }
        region.appendChild(el);
        while (region.children.length > 3) region.firstChild.remove();
        let gone = false;
        function dismiss() {
            if (gone) return;
            gone = true;
            el.classList.add('is-leaving');
            setTimeout(() => el.remove(), 220);
        }
        setTimeout(dismiss, opts.duration || (opts.action ? 6000 : 3200));
    }

    function confirmDialog(title, text, okLabel) {
        const dlg = $('#confirmDialog');
        if (!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(title + '\n\n' + text));
        $('#confirmTitle').textContent = title;
        $('#confirmText').textContent = text;
        $('#confirmOk').textContent = okLabel || 'Confirmar';
        return new Promise((resolve) => {
            dlg.returnValue = 'cancel';
            dlg.addEventListener('close', function onClose() {
                dlg.removeEventListener('close', onClose);
                resolve(dlg.returnValue === 'confirm');
            });
            dlg.showModal();
            $('.btn-ghost', dlg).focus();
        });
    }

    function sheet(html, opts) {
        opts = opts || {};
        const dlg = document.createElement('dialog');
        dlg.className = 'dialog' + (opts.wide ? ' dialog-wide' : '');
        dlg.setAttribute('aria-label', opts.label || 'Detalle');
        dlg.innerHTML = html;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { dlg.remove(); if (opts.onClose) opts.onClose(); });
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
        $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
        return dlg;
    }

    /* ------------------------------------------------------------------ *
     * Effects: count-up, tilt, stagger, celebration
     * ------------------------------------------------------------------ */
    function countUp(root) {
        $$('[data-count]', root).forEach((el) => {
            const target = parseFloat(el.getAttribute('data-count'));
            const kind = el.getAttribute('data-format');
            const format = (v) => kind === 'compact' ? fmt.compact.format(v) : kind === 'dec' ? fmt.dec.format(v) : fmt.int.format(Math.round(v));
            if (!isFinite(target) || reducedMotion.matches || target === 0) { el.textContent = format(target || 0); return; }
            const start = performance.now();
            const dur = 900;
            (function frame(now) {
                const t = Math.min(1, (now - start) / dur);
                const e = 1 - Math.pow(2, -10 * t);
                el.textContent = format(target * (t === 1 ? 1 : e));
                if (t < 1) requestAnimationFrame(frame);
            })(start);
        });
    }

    function stagger(root) {
        $$('.stagger', root).forEach((group) => {
            Array.prototype.forEach.call(group.children, (child, i) => child.style.setProperty('--i', Math.min(i, 12)));
        });
    }

    function initTilt() {
        if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        document.addEventListener('pointermove', (e) => {
            const card = e.target.closest && e.target.closest('.tilt');
            $$('.tilt.is-tilting').forEach((c) => { if (c !== card) resetTilt(c); });
            if (!card || reducedMotion.matches) return;
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width;
            const y = (e.clientY - r.top) / r.height;
            card.classList.add('is-tilting');
            card.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
            card.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
            card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
            card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        }, { passive: true });
        document.addEventListener('pointerleave', () => $$('.tilt.is-tilting').forEach(resetTilt));
    }
    function resetTilt(c) {
        c.classList.remove('is-tilting');
        c.style.removeProperty('--rx');
        c.style.removeProperty('--ry');
    }

    /** Plate-coloured burst. Reserved for personal records. */
    function celebrate(intensity) {
        if (reducedMotion.matches) return;
        const canvas = document.createElement('canvas');
        canvas.className = 'fx-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        if (!ctx) { canvas.remove(); return; }
        ctx.scale(dpr, dpr);
        const colors = ['#d1262f', '#1f5fbf', '#f2c230', '#1f9d55', '#eef1f5'];
        const n = Math.round(90 * (intensity || 1));
        const parts = [];
        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
            const speed = 7 + Math.random() * 9;
            parts.push({
                x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.42,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                r: 4 + Math.random() * 7, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
                c: colors[i % colors.length], disc: Math.random() < 0.45
            });
        }
        const start = performance.now();
        (function frame(now) {
            const t = (now - start) / 1000;
            ctx.clearRect(0, 0, W, H);
            parts.forEach((p) => {
                p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                ctx.save();
                ctx.globalAlpha = Math.max(0, 1 - t / 1.9);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.c;
                if (p.disc) {
                    ctx.scale(1, Math.abs(Math.cos(p.rot * 2)) * 0.8 + 0.2);
                    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.3, 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
                }
                ctx.restore();
            });
            if (t < 2) requestAnimationFrame(frame); else canvas.remove();
        })(start);
    }

    /* ------------------------------------------------------------------ *
     * Audio, vibration, wake lock
     * ------------------------------------------------------------------ */
    let audioCtx = null;
    function unlockAudio() {
        if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { audioCtx = new AC(); } catch (e) { audioCtx = null; } }
    }
    function beep(pattern) {
        if (!state.settings.sound || !audioCtx) return;
        try {
            let t = audioCtx.currentTime;
            (pattern || [880, 880, 1320]).forEach((freq, i, arr) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === arr.length - 1 ? 0.45 : 0.16));
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.5);
                t += 0.2;
            });
        } catch (e) { /* ignore */ }
    }
    function buzz(pattern) {
        if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
    }
    let wakeLock = null;
    async function keepAwake(on) {
        try {
            if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            } else if (!on && wakeLock) {
                await wakeLock.release();
                wakeLock = null;
            }
        } catch (e) { wakeLock = null; }
    }

    /* ------------------------------------------------------------------ *
     * Rest timer — timestamp based, survives background throttling
     * ------------------------------------------------------------------ */
    const timer = { endAt: 0, total: 0, pausedLeft: null, tick: null, doneAt: 0, hideT: null };
    const RING = 2 * Math.PI * 21;

    function restFor(phaseId) {
        const o = state.settings.restOverrides[phaseId];
        if (o !== undefined) return o;
        const p = P.getPhase(phaseId);
        return p ? p.restTime : 0;
    }
    function timerLeft() {
        if (timer.pausedLeft !== null) return timer.pausedLeft;
        return Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    }
    function startRest(seconds) {
        if (!(seconds > 0)) return;
        clearTimeout(timer.hideT);
        timer.total = seconds;
        timer.endAt = Date.now() + seconds * 1000;
        timer.pausedLeft = null;
        timer.doneAt = 0;
        renderTimer();
        clearInterval(timer.tick);
        timer.tick = setInterval(updateTimer, 250);
    }
    function adjustRest(delta) {
        if (timer.doneAt) {
            // Extending a finished rest restarts the countdown.
            if (delta <= 0) return;
            clearTimeout(timer.hideT);
            timer.doneAt = 0;
            timer.endAt = Date.now();
            timer.total = 0;
            $('#restTimer').classList.remove('is-done');
            renderTimer();
            clearInterval(timer.tick);
            timer.tick = setInterval(updateTimer, 250);
        }
        if (timer.pausedLeft !== null) timer.pausedLeft = Math.max(0, timer.pausedLeft + delta);
        else timer.endAt = Math.max(Date.now(), timer.endAt + delta * 1000);
        timer.total = Math.max(timer.total + delta, timerLeft(), 1);
        updateTimer();
    }
    function togglePause() {
        if (timer.doneAt) return;
        if (timer.pausedLeft !== null) {
            timer.endAt = Date.now() + timer.pausedLeft * 1000;
            timer.pausedLeft = null;
        } else {
            timer.pausedLeft = timerLeft();
        }
        renderTimer();
    }
    function stopRest() {
        clearInterval(timer.tick);
        clearTimeout(timer.hideT);
        timer.tick = null;
        timer.endAt = 0;
        const el = $('#restTimer');
        el.hidden = true;
        el.innerHTML = '';
        $('#main').classList.remove('has-timer');
    }
    function renderTimer() {
        const el = $('#restTimer');
        const paused = timer.pausedLeft !== null;
        el.hidden = false;
        $('#main').classList.add('has-timer');
        el.innerHTML =
            '<div class="timer-ring">' +
                '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="21"/><circle class="bar" cx="24" cy="24" r="21" stroke-dasharray="' + RING.toFixed(2) + '"/></svg>' +
                icon(paused ? 'pause' : 'timer') +
            '</div>' +
            '<div class="timer-text"><div class="timer-label" id="timerLabel">' + (paused ? 'En pausa' : 'Descanso') + '</div>' +
            '<div class="timer-time" role="timer" aria-live="off" aria-labelledby="timerLabel">0:00</div></div>' +
            '<button class="timer-btn" type="button" data-action="rest-adjust" data-delta="-15" aria-label="Restar 15 segundos">−15</button>' +
            '<button class="timer-btn" type="button" data-action="rest-adjust" data-delta="15" aria-label="Sumar 15 segundos">+15</button>' +
            '<button class="timer-btn" type="button" data-action="rest-pause" aria-label="' + (paused ? 'Reanudar' : 'Pausar') + '">' + icon(paused ? 'play' : 'pause') + '</button>' +
            '<button class="timer-btn" type="button" data-action="rest-stop" aria-label="Terminar descanso">' + icon('x') + '</button>';
        updateTimer();
    }
    function updateTimer() {
        const el = $('#restTimer');
        if (el.hidden) return;
        const left = timerLeft();
        const time = $('.timer-time', el);
        const bar = $('.bar', el);
        if (time) time.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        if (bar) bar.style.strokeDashoffset = (RING * (1 - left / Math.max(1, timer.total))).toFixed(2);
        el.classList.toggle('is-urgent', left > 0 && left <= 10 && timer.pausedLeft === null);
        if (left === 0 && timer.pausedLeft === null && !timer.doneAt) {
            timer.doneAt = Date.now();
            clearInterval(timer.tick);
            el.classList.remove('is-urgent');
            el.classList.add('is-done');
            $('.timer-label', el).textContent = 'Descanso terminado';
            time.textContent = '¡A levantar!';
            beep();
            buzz([180, 90, 180, 90, 320]);
            timer.hideT = setTimeout(() => { el.classList.remove('is-done'); stopRest(); }, 5000);
        } else if (left > 0) {
            el.classList.remove('is-done');
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateTimer();
            if (ui.route === 'session') keepAwake(true);
        }
    });

    /* ------------------------------------------------------------------ *
     * Router
     * ------------------------------------------------------------------ */
    const ROUTES = {
        train: { title: 'Entrenar', render: renderTrain },
        session: { title: 'Sesión', render: renderSession },
        program: { title: 'Programa', render: renderProgram },
        history: { title: 'Historial', render: renderHistory },
        progress: { title: 'Progreso', render: renderProgress },
        settings: { title: 'Ajustes', render: renderSettings }
    };

    function currentRoute() {
        const h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
        if (h === 'session' && !draft) return 'train';
        return ROUTES[h] ? h : 'train';
    }

    function go(route) {
        if (location.hash === '#' + route) render();
        else location.hash = route;
    }

    function render(opts) {
        opts = opts || {};
        const route = currentRoute();
        const changed = route !== ui.route || !ui.rendered;
        const swap = () => {
            ui.route = route;
            const main = $('#main');
            main.innerHTML = ROUTES[route].render();
            document.title = ROUTES[route].title + ' · MAPS Performance';
            $$('.nav-link').forEach((a) => {
                const active = a.getAttribute('data-route') === (route === 'session' ? 'train' : route);
                if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
            });
            stagger(main);
            countUp(main);
            afterRender(route);
            if (changed && ui.rendered && !opts.keepScroll) {
                window.scrollTo(0, 0);
                const h1 = $('.page-title, .session-title', main);
                if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
            }
            keepAwake(route === 'session');
            ui.rendered = true;
        };
        if (changed && ui.rendered && document.startViewTransition && !reducedMotion.matches) {
            try { document.startViewTransition(swap); return; } catch (e) { /* fall through */ }
        }
        swap();
    }

    function afterRender(route) {
        if (route === 'progress') drawProgressCharts();
        if (route === 'train') initRig();
        if (route === 'session') updateSessionProgress();
    }

    /* ------------------------------------------------------------------ *
     * 3D barbell
     * ------------------------------------------------------------------ */
    const PLATES = [
        { kg: 25, d: 150, t: 14, plate: '#d1262f', edge: '#8f141b' },
        { kg: 20, d: 150, t: 12, plate: '#1f5fbf', edge: '#123a78' },
        { kg: 15, d: 128, t: 10, plate: '#f2c230', edge: '#9c7a0c' },
        { kg: 10, d: 106, t: 8, plate: '#1f9d55', edge: '#0f5e31' },
        { kg: 5, d: 80, t: 6, plate: '#eef1f5', edge: '#9aa3ae' }
    ];
    function rigHTML() {
        let html = '<div class="rig" aria-hidden="true"><div class="rig-tilt"><div class="rig-spin">';
        html += '<div class="rig-shaft">' + '<div class="rig-face"></div>'.repeat(4) + '<div class="rig-knurl"></div></div>';
        [1, -1].forEach((side) => {
            html += '<div class="rig-sleeve">' +
                ['', 'rotateX(90deg)', 'rotateX(45deg)', 'rotateX(-45deg)'].map((tr) =>
                    '<div class="rig-face" style="left:' + (side > 0 ? 120 : -250) + 'px;width:130px;' + (tr ? 'transform:' + tr : '') + '"></div>').join('') +
                '</div>';
            html += collar(side * 121, 44, 5);
            let x = 128;
            PLATES.forEach((p, idx) => {
                const layers = Math.max(3, Math.round(p.t / 2.4));
                html += '<div class="rig-plate" style="--from:' + (side * 90) + 'px;animation-delay:' + (0.15 + idx * 0.12) + 's">';
                for (let k = 0; k < layers; k++) {
                    const lx = side * (x + k * (p.t / (layers - 1)));
                    const face = k === 0 || k === layers - 1;
                    html += '<div class="rig-disc' + (face ? ' is-face' : '') + '" style="--plate:' + p.plate + ';--edge:' + p.edge +
                        ';width:' + p.d + 'px;height:' + p.d + 'px;left:' + (-p.d / 2) + 'px;top:' + (-p.d / 2) +
                        'px;transform:translateX(' + lx.toFixed(1) + 'px) rotateY(90deg)"></div>';
                }
                html += '</div>';
                x += p.t + 1.5;
            });
            html += collar(side * (x + 2), 34, 7);
        });
        html += '</div></div></div>';
        return html;
    }
    function collar(x, dia, thick) {
        let s = '';
        const n = 3;
        for (let k = 0; k < n; k++) {
            const lx = x + Math.sign(x) * k * (thick / (n - 1));
            s += '<div class="rig-collar" style="width:' + dia + 'px;height:' + dia + 'px;left:' + (-dia / 2) + 'px;top:' + (-dia / 2) +
                'px;transform:translateX(' + lx.toFixed(1) + 'px) rotateY(90deg)"></div>';
        }
        return s;
    }
    function initRig() {
        const hero = $('.hero');
        const rig = $('.rig', hero);
        if (!hero || !rig) return;
        const move = (e) => {
            if (reducedMotion.matches) return;
            const r = hero.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            rig.style.setProperty('--px', (x * 40).toFixed(1) + 'deg');
            rig.style.setProperty('--py', (-y * 18).toFixed(1) + 'deg');
        };
        hero.addEventListener('pointermove', move, { passive: true });
        hero.addEventListener('pointerleave', () => { rig.style.setProperty('--px', '0deg'); rig.style.setProperty('--py', '0deg'); });
    }

    /* ------------------------------------------------------------------ *
     * View: Train (Hoy)
     * ------------------------------------------------------------------ */
    function defaultPhase() {
        if (ui.phase) return ui.phase;
        const st = C.computeStats(state.sessions, today(), state.settings.weeklyGoal);
        return st.currentPhase && P.getPhase(st.currentPhase) ? st.currentPhase : 'P1';
    }

    function weekStrip() {
        const t = today();
        const start = C.startOfWeek(t);
        const byDate = {};
        state.sessions.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s.phase); });
        let html = '<ol class="week" aria-label="Esta semana">';
        for (let i = 0; i < 7; i++) {
            const iso = C.addDays(start, i);
            const phases = byDate[iso] || [];
            const label = cap(fmt.longNoYear.format(d(iso))) + (phases.length ? ': ' + plural(phases.length, 'sesión', 'sesiones') : ': sin sesiones');
            html += '<li class="week-day' + (iso === t ? ' is-today' : '') + (phases.length ? ' has-session' : '') + (iso > t ? ' is-future' : '') + '" aria-label="' + esc(label) + '">' +
                '<span class="week-dow" aria-hidden="true">' + esc(fmt.dowNarrow.format(d(iso)).toUpperCase()) + '</span>' +
                '<span class="week-dom" aria-hidden="true">' + d(iso).getDate() + '</span>' +
                '<span class="week-dots" aria-hidden="true">' + phases.slice(0, 3).map((p) => '<i class="phase-dot-' + esc(p) + '"></i>').join('') + '</span>' +
                '</li>';
        }
        return html + '</ol>';
    }

    function renderTrain() {
        const phaseId = defaultPhase();
        const phase = P.getPhase(phaseId);
        const next = C.nextDayInRotation(state.sessions, phase);
        const nextDay = P.getDay(phaseId, next);
        const st = C.computeStats(state.sessions, today(), state.settings.weeklyGoal);
        const rest = restFor(phaseId);

        let html = demoBanner();
        if (draft) {
            const dp = P.getPhase(draft.phase);
            const prog = draftProgress();
            html += '<div class="resume-banner" role="region" aria-label="Sesión en curso">' + icon('timer', 'icon-lg') +
                '<div class="grow"><div class="strong">Sesión en curso</div><div class="text-sm muted">' +
                esc(dp.label + ' · ' + P.getDay(draft.phase, draft.dayId).name) + ' · ' + prog.done + '/' + prog.total + ' sets</div></div>' +
                '<button class="btn btn-ghost btn-sm" type="button" data-action="discard-draft">Descartar</button>' +
                '<a class="btn btn-primary btn-sm" href="#session">Continuar ' + icon('chevron-right', 'icon-sm') + '</a></div>';
        }

        html += '<div class="page-head"><div><h1 class="page-title">Entrenar</h1><p class="page-sub">' + esc(fmtLong(today())) + '</p></div>' +
            '<div class="week-wrap"><div class="week-meta"><span class="strong num">' + st.thisWeek + '</span><span class="muted">/' + st.weeklyGoal + ' esta semana</span>' +
            (st.weekStreak > 1 ? '<span class="badge badge-warning">' + icon('flame', 'icon-sm') + st.weekStreak + ' sem</span>' : '') + '</div>' + weekStrip() + '</div></div>';

        html += '<div class="chips" role="group" aria-label="Fase">' + P.phases.map((p) =>
            '<button class="chip" type="button" data-action="pick-phase" data-phase="' + p.id + '" aria-pressed="' + (p.id === phaseId) + '">' +
            '<span class="dot phase-dot-' + p.id + '"></span>' + esc(p.label) + '</button>').join('') + '</div>';

        html += '<section class="hero phase-' + phaseId + '" aria-labelledby="heroTitle" style="margin-top:var(--s-4)">' +
            '<div class="hero-copy">' +
                '<div class="hero-kicker"><span class="plate-chip" aria-hidden="true"></span>' + esc(phase.label) + ' · ' + esc(phase.length) + '</div>' +
                '<h2 class="hero-title" id="heroTitle">' + esc(phase.title) + '</h2>' +
                '<p class="hero-text">' + esc(phase.objective) + '. ' + esc(phase.expect) + '</p>' +
                '<dl class="hero-meta"><div><dt>Descanso</dt><dd>' + (rest ? esc(fmtRest(rest)) : 'Circuito') + '</dd></div>' +
                '<div><dt>Tempo</dt><dd>' + esc(phase.tempo.split(' ')[0]) + '</dd></div>' +
                '<div><dt>Intensidad</dt><dd>' + esc(phase.intensity) + '</dd></div></dl>' +
                '<div class="hero-cta"><button class="btn btn-primary btn-lg" type="button" data-action="start" data-phase="' + phaseId + '" data-day="' + nextDay.id + '">' +
                    icon('play') + 'Empezar ' + esc(nextDay.name) + '</button>' +
                    '<span class="text-sm muted">' + plural(nextDay.exercises.length, 'ejercicio', 'ejercicios') + ' · ' + estimateMinutes(phase, nextDay) + ' min aprox.</span></div>' +
            '</div>' + rigHTML() +
        '</section>';

        if (phase.alternate) {
            html += '<div class="callout" style="margin-top:var(--s-4)">' + icon('info') + '<span>Alterna Workout 1 y Workout 2 hasta completar tres sesiones por semana.</span></div>';
        }

        html += '<section class="section"><div class="section-head"><h2 class="section-title">Sesiones</h2><span class="section-hint">' +
            plural(phase.days.length, 'día', 'días') + '</span></div><div class="day-grid stagger">';
        phase.days.forEach((day) => {
            const prev = C.previousSessionFor(state.sessions, phaseId, day.id);
            const sched = state.schedule[phaseId + '-' + day.id];
            const sets = day.exercises.reduce((n, ex) => n + (ex.sets || 1), 0);
            const isNext = day.id === next;
            html += '<button class="day-card tilt phase-' + phaseId + (isNext ? ' is-next' : '') + '" type="button" data-action="start" data-phase="' + phaseId + '" data-day="' + day.id + '">' +
                '<span class="day-card-head"><span class="row" style="gap:var(--s-3)"><span class="plate-chip" aria-hidden="true"></span><span class="day-card-title">' + esc(day.name) + '</span></span>' +
                (isNext ? '<span class="badge badge-accent">Siguiente</span>' : '') + '</span>' +
                '<ul class="day-card-list">' + day.exercises.slice(0, 4).map((ex) => '<li>' + esc(ex.name) + '</li>').join('') +
                (day.exercises.length > 4 ? '<li class="muted">+' + (day.exercises.length - 4) + ' más</li>' : '') + '</ul>' +
                (sched && sched >= today() ? '<span class="badge">' + icon('calendar', 'icon-sm') + 'Programado ' + esc(relDays(sched).toLowerCase() === 'hoy' ? 'hoy' : fmtDay(sched)) + '</span>' : '') +
                '<span class="day-card-last">' + icon('history', 'icon-sm') + (prev ? 'Última vez: ' + esc(relDays(prev.date).toLowerCase()) : 'Aún sin registros') + '</span>' +
                '<span class="day-card-foot"><span>' + plural(day.exercises.length, 'ejercicio', 'ejercicios') + (phase.kind === 'strength' ? ' · ' + sets + ' sets' : '') +
                '</span><span class="day-card-cta">Empezar ' + icon('chevron-right', 'icon-sm') + '</span></span>' +
                '</button>';
        });
        html += '</div></section>';
        return html;
    }

    function fmtRest(s) {
        if (s < 60) return s + ' s';
        const m = Math.floor(s / 60), r = s % 60;
        return r ? m + ':' + String(r).padStart(2, '0') + ' min' : m + ' min';
    }
    function estimateMinutes(phase, day) {
        if (phase.kind === 'mobility') return 30;
        const sets = day.exercises.reduce((n, ex) => n + (ex.sets || 1), 0);
        const rest = restFor(phase.id) || 20;
        return Math.max(15, Math.round(sets * (45 + rest) / 60 / 5) * 5);
    }

    /* ------------------------------------------------------------------ *
     * Session logger
     * ------------------------------------------------------------------ */
    function newDraft(phaseId, dayId) {
        const day = P.getDay(phaseId, dayId);
        return {
            phase: phaseId,
            dayId: dayId,
            date: today(),
            unit: unit(),
            startedAt: Date.now(),
            notes: '',
            exercises: day.exercises.map((ex) => ({
                name: ex.name,
                done: false,
                note: '',
                sets: Array.from({ length: ex.sets || 1 }, () => ({ weight: '', reps: '', done: false }))
            }))
        };
    }

    async function startSession(phaseId, dayId) {
        if (draft && (draft.phase !== phaseId || draft.dayId !== dayId) && draftProgress().touched) {
            const ok = await confirmDialog('¿Reemplazar la sesión en curso?',
                'Tienes datos sin guardar en ' + P.getPhase(draft.phase).label + ' · ' + P.getDay(draft.phase, draft.dayId).name + '. Se descartarán.', 'Reemplazar');
            if (!ok) return;
        }
        if (!draft || draft.phase !== phaseId || draft.dayId !== dayId) {
            draft = newDraft(phaseId, dayId);
            saveDraftNow();
        }
        ui.phase = phaseId;
        go('session');
    }

    function draftProgress() {
        let total = 0, done = 0, touched = false;
        if (!draft) return { total: 0, done: 0, touched: false };
        const mobility = P.getPhase(draft.phase).kind === 'mobility';
        draft.exercises.forEach((ex) => {
            if (mobility) { total++; if (ex.done) done++; if (ex.done || ex.note) touched = true; }
            else ex.sets.forEach((s) => { total++; if (s.done) done++; if (s.done || s.weight || s.reps) touched = true; });
        });
        if (draft.notes) touched = true;
        return { total, done, touched };
    }

    function renderSession() {
        const phase = P.getPhase(draft.phase);
        const day = P.getDay(draft.phase, draft.dayId);
        const mobility = phase.kind === 'mobility';
        const prevSession = C.previousSessionFor(state.sessions, draft.phase, draft.dayId);
        const rest = restFor(draft.phase);

        let html = '<div class="session-bar phase-' + phase.id + '">' +
            '<a class="icon-btn" href="#train" aria-label="Volver a Entrenar (la sesión queda guardada como borrador)">' + icon('chevron-left') + '</a>' +
            '<div class="grow"><h1 class="session-title">' + esc(phase.label + ' · ' + day.name) + '</h1>' +
            '<div class="session-progress"><div class="progress" role="progressbar" aria-label="Sets completados" aria-valuemin="0"><span></span></div><span class="num" id="progressText"></span></div></div>' +
            '<button class="icon-btn" type="button" data-action="rest-start" aria-label="Iniciar descanso" title="Descanso">' + icon('timer') + '</button>' +
            '<button class="btn btn-primary btn-sm" type="button" data-action="save-session">' + icon('check', 'icon-sm') + 'Guardar</button>' +
            '</div>';

        html += '<div class="session-meta">' +
            '<div class="field"><label class="field-label" for="sessionDate">Fecha</label>' +
            '<input class="input input-date" type="date" id="sessionDate" data-field="date" value="' + esc(draft.date) + '" max="' + C.addDays(today(), 1) + '"></div>' +
            '<div class="row session-tools">' +
            (prevSession ? '<button class="btn btn-secondary" type="button" data-action="fill-last">' + icon('rotate') + 'Repetir pesos del ' + esc(fmtDayShort(prevSession.date)) + '</button>' : '') +
            (rest ? '<span class="badge">' + icon('timer', 'icon-sm') + 'Descanso ' + esc(fmtRest(rest)) + (state.settings.autoRest ? ' · auto' : '') + '</span>' : '<span class="badge">' + icon('flame', 'icon-sm') + 'Circuito sin pausa</span>') +
            '</div></div>';

        html += '<div class="exercises phase-' + phase.id + '">';
        day.exercises.forEach((ex, i) => {
            const dEx = draft.exercises[i];
            const last = C.lastPerformance(state.sessions, ex.name);
            const link = C.safeUrl(P.exerciseLinks[ex.name]);
            const target = (ex.sets ? ex.sets + ' × ' : '') + ex.reps + (/\d$/.test(ex.reps) ? ' reps' : '');
            const complete = mobility ? dEx.done : dEx.sets.length && dEx.sets.every((s) => s.done);
            html += '<article class="exercise' + (complete ? ' is-complete' : '') + '" data-ex="' + i + '" aria-labelledby="ex-name-' + i + '">' +
                '<header class="exercise-head"><span class="exercise-index num" aria-hidden="true">' + (i + 1) + '</span>' +
                '<div class="grow"><h2 class="exercise-name" id="ex-name-' + i + '"><button type="button" class="link-btn" data-action="exercise-detail" data-name="' + esc(ex.name) + '">' + esc(ex.name) + '</button></h2>' +
                '<div class="exercise-target">' + esc(target) + (last && !mobility ? ' · última vez ' + esc(relDays(last.date).toLowerCase()) : '') + '</div>' +
                (ex.note ? '<p class="exercise-note">' + icon('lightbulb', 'icon-sm') + '<span>' + esc(ex.note) + '</span></p>' : '') + '</div>' +
                (link ? '<a class="icon-btn" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" aria-label="Ver demo de ' + esc(ex.name) + ' (abre en otra pestaña)" title="Ver demo">' + icon('video') + '</a>' : '') +
                '</header>';
            if (mobility) {
                html += '<div class="mob-row"><label class="check">' +
                    '<input type="checkbox" data-field="done" data-ex="' + i + '"' + (dEx.done ? ' checked' : '') + ' aria-label="Completar ' + esc(ex.name) + '">' +
                    '<span class="check-box">' + icon('check') + '</span></label>' +
                    '<input class="input" type="text" data-field="note" data-ex="' + i + '" value="' + esc(dEx.note) + '" placeholder="Nota (opcional)" aria-label="Nota para ' + esc(ex.name) + '" maxlength="200"></div>';
            } else {
                html += '<div class="sets" role="group" aria-label="Sets de ' + esc(ex.name) + '">' +
                    '<div class="set-row is-head" aria-hidden="true"><span>Set</span><span>Anterior</span><span>' + esc(draft.unit) + '</span><span>Reps</span><span>' + icon('check', 'icon-sm') + '</span></div>';
                dEx.sets.forEach((s, j) => { html += setRow(i, j, s, ex, last); });
                html += '</div><div class="set-add"><button class="btn btn-ghost btn-sm" type="button" data-action="add-set" data-ex="' + i + '">' + icon('plus', 'icon-sm') + 'Añadir set</button></div>';
            }
            html += '</article>';
        });
        html += '</div>';

        html += '<div class="field" style="margin-top:var(--s-6)"><label class="field-label" for="sessionNotes">Notas de la sesión</label>' +
            '<textarea class="textarea" id="sessionNotes" data-field="notes" placeholder="Cómo te sentiste, ajustes de carga, molestias…" maxlength="2000">' + esc(draft.notes) + '</textarea></div>';
        html += '<div class="session-actions">' +
            '<button class="btn btn-primary btn-lg" type="button" data-action="save-session">' + icon('check') + 'Guardar sesión</button>' +
            '<button class="btn btn-danger-ghost btn-lg" type="button" data-action="discard-draft">' + icon('trash') + 'Descartar</button></div>';
        return html;
    }

    function setRow(i, j, s, ex, last) {
        const prev = last && last.sets[j + 1];
        const prevW = prev && prev.weight !== null ? C.displayWeight(prev.weight, draft.unit) : '';
        const prevR = prev && prev.reps !== null ? String(prev.reps) : '';
        const prevText = prev ? (prevW ? prevW + ' × ' : '') + (prevR || '—') : '—';
        const repsHint = prevR || (String(ex.reps).match(/^\d+/) || [''])[0];
        const label = ex.name + ', set ' + (j + 1);
        return '<div class="set-row' + (s.done ? ' is-done' : '') + '" data-set="' + j + '">' +
            '<span class="set-num num">' + (j + 1) + '</span>' +
            '<span class="set-prev num" title="Sesión anterior">' + esc(prevText) + '</span>' +
            '<input class="set-input" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-field="weight" data-ex="' + i + '" data-set="' + j + '" value="' + esc(s.weight) + '" placeholder="' + esc(prevW || '–') + '" aria-label="Peso en ' + esc(draft.unit) + ', ' + esc(label) + '">' +
            '<input class="set-input" type="text" inputmode="numeric" enterkeyhint="next" autocomplete="off" data-field="reps" data-ex="' + i + '" data-set="' + j + '" value="' + esc(s.reps) + '" placeholder="' + esc(repsHint || '–') + '" aria-label="Repeticiones, ' + esc(label) + '">' +
            '<label class="check"><input type="checkbox" data-field="set-done" data-ex="' + i + '" data-set="' + j + '"' + (s.done ? ' checked' : '') + ' aria-label="Completar ' + esc(label) + '"><span class="check-box">' + icon('check') + '</span></label>' +
            '</div>';
    }

    function updateSessionProgress() {
        if (!draft) return;
        const p = draftProgress();
        const bar = $('.session-bar .progress');
        if (bar) {
            bar.setAttribute('aria-valuemax', p.total);
            bar.setAttribute('aria-valuenow', p.done);
            $('span', bar).style.transform = 'scaleX(' + (p.total ? p.done / p.total : 0) + ')';
        }
        const t = $('#progressText');
        if (t) t.textContent = p.done + '/' + p.total + ' sets';
        // Highlight the next set to do.
        $$('.set-row.is-active').forEach((r) => r.classList.remove('is-active'));
        const nextRow = $$('.set-row:not(.is-head)').find((r) => !r.classList.contains('is-done'));
        if (nextRow) nextRow.classList.add('is-active');
    }

    function onSessionInput(target) {
        const field = target.getAttribute('data-field');
        const i = +target.getAttribute('data-ex');
        const j = +target.getAttribute('data-set');
        if (field === 'date') { if (C.isISODate(target.value)) draft.date = target.value; }
        else if (field === 'notes') draft.notes = target.value;
        else if (field === 'note') draft.exercises[i].note = target.value;
        else if (field === 'weight' || field === 'reps') draft.exercises[i].sets[j][field] = target.value.replace(/[^\d.,]/g, '').slice(0, 7);
        saveDraftSoon();
    }

    function onSetToggle(input) {
        const i = +input.getAttribute('data-ex');
        const field = input.getAttribute('data-field');
        const article = input.closest('.exercise');
        if (field === 'done') {
            draft.exercises[i].done = input.checked;
            article.classList.toggle('is-complete', input.checked);
        } else {
            const j = +input.getAttribute('data-set');
            const s = draft.exercises[i].sets[j];
            const row = input.closest('.set-row');
            s.done = input.checked;
            if (input.checked) {
                // Two-tap logging: an empty field takes the hinted value.
                const wIn = $('[data-field="weight"]', row), rIn = $('[data-field="reps"]', row);
                if (!s.weight && C.parseNumber(wIn.placeholder) !== null) { s.weight = wIn.placeholder; wIn.value = s.weight; }
                if (!s.reps && C.parseNumber(rIn.placeholder) !== null) { s.reps = rIn.placeholder; rIn.value = s.reps; }
                const box = input.parentElement;
                box.classList.remove('is-burst'); void box.offsetWidth; box.classList.add('is-burst');
                row.classList.add('is-flash');
                setTimeout(() => row.classList.remove('is-flash'), 160);
                buzz(12);
                const rest = restFor(draft.phase);
                if (state.settings.autoRest && rest > 0) startRest(rest);
            }
            row.classList.toggle('is-done', input.checked);
            article.classList.toggle('is-complete', draft.exercises[i].sets.every((x) => x.done));
        }
        saveDraftNow();
        updateSessionProgress();
    }

    function fillFromLast() {
        const prev = C.previousSessionFor(state.sessions, draft.phase, draft.dayId);
        if (!prev) return;
        let n = 0;
        draft.exercises.forEach((ex) => {
            const p = prev.exercises.find((e) => e.name === ex.name);
            if (!p) return;
            p.sets.forEach((ps) => {
                const s = ex.sets[ps.set - 1];
                if (!s) return;
                if (!s.weight && ps.weight !== null) { s.weight = C.displayWeight(ps.weight, draft.unit); n++; }
                if (!s.reps && ps.reps !== null) { s.reps = String(ps.reps); n++; }
            });
        });
        saveDraftNow();
        render({ keepScroll: true });
        toast(n ? 'Pesos y reps del ' + fmtDayShort(prev.date) + ' cargados' : 'No había valores nuevos que cargar', { type: n ? 'success' : 'info' });
    }

    function buildSessionRecord() {
        const phase = P.getPhase(draft.phase);
        const day = P.getDay(draft.phase, draft.dayId);
        return C.normalizeSession({
            id: C.createId(),
            date: draft.date,
            createdAt: Date.now(),
            phase: phase.id,
            dayId: day.id,
            dayName: day.name,
            notes: draft.notes.trim(),
            exercises: day.exercises.map((ex, i) => {
                const dEx = draft.exercises[i];
                const out = { name: ex.name, target: ex.reps };
                if (phase.kind === 'mobility') {
                    out.sets = [];
                    out.completed = !!dEx.done;
                    if (dEx.note.trim()) out.note = dEx.note.trim();
                } else {
                    out.sets = dEx.sets.map((s, j) => ({
                        set: j + 1,
                        weight: C.toKg(C.parseNumber(s.weight), draft.unit),
                        reps: C.parseNumber(s.reps),
                        done: s.done
                    }));
                }
                return out;
            })
        }, P);
    }

    function saveSession() {
        if (!C.isISODate(draft.date)) { toast('Elige una fecha válida para la sesión.', { type: 'error' }); $('#sessionDate').focus(); return; }
        const record = buildSessionRecord();
        if (!record.exercises.some(C.exerciseHasData) && !record.notes) {
            toast('Registra al menos un set o ejercicio antes de guardar.', { type: 'error' });
            return;
        }
        const records = C.detectNewRecords(state.sessions, record);
        const before = state.sessions;
        state.sessions = C.sortSessions(state.sessions.concat([record]));
        if (!persist()) {
            // Keep the draft so nothing is lost; the storage wrapper already explained why.
            state.sessions = before;
            saveDraftNow();
            return;
        }
        const phaseId = draft.phase;
        draft = null;
        saveDraftNow();
        stopRest();
        ui.phase = phaseId;
        go('train');
        showSummary(record, records);
    }

    function showSummary(record, records) {
        const sum = C.summarizeSession(record);
        const phase = P.getPhase(record.phase);
        const logged = record.exercises.filter(C.exerciseHasData).length;
        const html = '<div class="dialog-body summary phase-' + phase.id + '">' +
            '<div class="summary-plate" aria-hidden="true"></div>' +
            '<h2 class="dialog-title">Sesión guardada</h2>' +
            '<p class="dialog-text">' + esc(phase.label + ' · ' + record.dayName + ' · ' + fmtDay(record.date)) + '</p>' +
            '<div class="summary-grid">' +
                '<div class="summary-stat"><div class="summary-figure" data-count="' + sum.doneSets + '">' + sum.doneSets + '</div><div class="summary-label">Sets</div></div>' +
                '<div class="summary-stat"><div class="summary-figure" data-count="' + C.round(C.fromKg(sum.volume, unit()), 0) + '" data-format="compact">' + vol(sum.volume) + '</div><div class="summary-label">Vol. ' + unit() + '</div></div>' +
                '<div class="summary-stat"><div class="summary-figure" data-count="' + (records.length || logged) + '">' + (records.length || logged) + '</div><div class="summary-label">' + (records.length ? 'Récords' : 'Ejercicios') + '</div></div>' +
            '</div>' +
            (records.length ? '<ul class="summary-prs">' + records.map((r, i) =>
                '<li class="summary-pr" style="--i:' + i + '">' + icon('trophy') + '<span class="grow"><b>' + esc(r.name) + '</b><br><span class="muted">' +
                (r.type === 'weight' ? 'Nuevo peso máximo: ' + esc(wu(r.value)) + ' (antes ' + esc(wu(r.previous)) + ')' : '1RM estimado: ' + esc(wu(r.value)) + ' (antes ' + esc(wu(r.previous)) + ')') +
                '</span></span></li>').join('') + '</ul>' : '') +
            '</div><div class="dialog-actions"><a class="btn btn-ghost" href="#progress" data-close>Ver progreso</a><button class="btn btn-primary" type="button" data-close autofocus>Listo</button></div>';
        const dlg = sheet(html, { label: 'Resumen de la sesión' });
        countUp(dlg);
        if (records.length) { celebrate(1.2); beep([660, 880, 1320]); buzz([40, 60, 120]); }
    }

    /* Exercise detail sheet (editorial layer) */
    function showExercise(name) {
        const prs = C.personalRecords(state.sessions).find((p) => p.name === name);
        const series = C.exerciseSeries(state.sessions, name, 'e1rm').slice(-12);
        const recent = state.sessions.filter((s) => s.exercises.some((e) => e.name === name && e.sets.length)).slice(0, 4);
        const link = C.safeUrl(P.exerciseLinks[name]);
        let html = '<div class="dialog-body">' +
            '<div class="row" style="justify-content:space-between;align-items:flex-start"><h2 class="dialog-title" style="min-width:0">' + esc(name) + '</h2>' +
            '<button class="icon-btn" type="button" data-close aria-label="Cerrar">' + icon('x') + '</button></div>';
        if (prs) {
            html += '<div class="summary-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
                '<div class="summary-stat"><div class="summary-figure num">' + esc(w(prs.weight)) + '</div><div class="summary-label">Máx. ' + unit() + (prs.reps ? ' × ' + prs.reps : '') + '</div></div>' +
                '<div class="summary-stat"><div class="summary-figure num">' + esc(w(prs.e1rm)) + '</div><div class="summary-label">1RM est. ' + unit() + '</div></div></div>';
        }
        if (series.length > 1) html += '<div class="chart" id="exerciseChart" style="margin-top:var(--s-5)"></div>';
        if (recent.length) {
            html += '<h3 class="field-label" style="margin-top:var(--s-5)">Últimas sesiones</h3><ul>';
            recent.forEach((s) => {
                const ex = s.exercises.find((e) => e.name === name);
                html += '<li class="log-ex"><span class="log-ex-name">' + esc(fmtDay(s.date)) + '</span><span class="log-sets">' + ex.sets.map(pill).join('') + '</span></li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="dialog-text">Aún no hay registros de este ejercicio. Tus pesos aparecerán aquí después de tu primera sesión.</p>';
        }
        html += '</div>' + (link ? '<div class="dialog-actions"><a class="btn btn-secondary" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + icon('video') + 'Ver demo</a></div>' : '');
        const dlg = sheet(html, { label: name, wide: true });
        const chartEl = $('#exerciseChart', dlg);
        if (chartEl) {
            Charts.line(chartEl, {
                points: series, height: 200, label: '1RM estimado de ' + name + ' en las últimas sesiones',
                format: (v) => w(v), formatDate: (iso, long) => long ? fmtDay(iso) : fmtDayShort(iso), animate: !reducedMotion.matches
            });
        }
    }

    function pill(s) {
        const txt = (s.weight !== null ? w(s.weight) + ' ' + unit() : '') + (s.weight !== null && s.reps !== null ? ' × ' : '') + (s.reps !== null ? s.reps : '');
        return '<span class="set-pill' + (s.done ? ' is-done' : '') + '">' + (s.done ? icon('check') : '') + esc(txt || '—') + '</span>';
    }

    /* ------------------------------------------------------------------ *
     * View: Program
     * ------------------------------------------------------------------ */
    function renderProgram() {
        const t = today();
        const upcoming = Object.keys(state.schedule)
            .map((k) => ({ key: k, date: state.schedule[k], phase: k.split('-')[0], dayId: k.split('-')[1] }))
            .filter((u) => u.date >= t && P.getDay(u.phase, u.dayId))
            .sort((a, b) => a.date < b.date ? -1 : 1);

        let html = '<div class="page-head"><div><h1 class="page-title">Programa</h1><p class="page-sub">MAPS Performance Blueprint · 4 fases de fuerza + movilidad</p></div></div>';

        html += '<section class="section"><div class="section-head"><h2 class="section-title">Próximas sesiones</h2></div>';
        if (upcoming.length) {
            html += '<ul class="upcoming stagger">' + upcoming.slice(0, 6).map((u) => {
                const ph = P.getPhase(u.phase);
                return '<li class="card upcoming-item phase-' + u.phase + '"><span class="plate-chip" aria-hidden="true"></span>' +
                    '<span class="upcoming-date">' + esc(cap(fmtDay(u.date))) + '</span>' +
                    '<span class="grow"><span class="strong">' + esc(P.getDay(u.phase, u.dayId).name) + '</span> <span class="muted">· ' + esc(ph.label) + ' · ' + esc(relDays(u.date)) + '</span></span>' +
                    '<button class="btn btn-secondary btn-sm" type="button" data-action="start" data-phase="' + u.phase + '" data-day="' + u.dayId + '">Empezar</button></li>';
            }).join('') + '</ul>';
        } else {
            html += '<p class="card card-pad muted text-sm">' + icon('calendar', 'icon-sm') + ' Programa fechas en cada día de abajo para verlas aquí.</p>';
        }
        html += '</section>';

        html += '<section class="section stagger">';
        P.phases.forEach((ph) => {
            html += '<article class="card phase-block phase-' + ph.id + '" aria-labelledby="ph-' + ph.id + '">' +
                '<div class="phase-block-head"><span class="phase-numeral" aria-hidden="true">' + esc(ph.numeral) + '</span><div class="grow">' +
                '<h2 class="section-title" id="ph-' + ph.id + '">' + esc(ph.label) + ' · ' + esc(ph.title) + '</h2>' +
                '<p class="text-sm" style="margin-top:4px"><b>' + esc(ph.objective) + '.</b> <span class="muted">' + esc(ph.expect) + '</span></p>' +
                '<dl class="facts"><div><dt>Duración</dt><dd>' + esc(ph.length) + '</dd></div><div><dt>Frecuencia</dt><dd>' + esc(ph.freq) + '</dd></div>' +
                '<div><dt>Descanso</dt><dd>' + esc(ph.rest) + '</dd></div><div><dt>Tempo</dt><dd>' + esc(ph.tempo) + '</dd></div>' +
                '<div><dt>Intensidad</dt><dd>' + esc(ph.intensity) + '</dd></div></dl></div></div>';
            ph.days.forEach((day) => {
                const key = ph.id + '-' + day.id;
                const sched = state.schedule[key] || '';
                html += '<details class="program-day"><summary><span class="grow strong">' + esc(day.name) + '</span>' +
                    (sched ? '<span class="badge">' + icon('calendar', 'icon-sm') + esc(fmtDay(sched)) + '</span>' : '') +
                    '<span class="muted text-sm">' + plural(day.exercises.length, 'ejercicio', 'ejercicios') + '</span>' + icon('chevron-down', 'chev') + '</summary>' +
                    '<ul style="margin-top:var(--s-2)">' + day.exercises.map((ex) =>
                        '<li class="program-ex"><button type="button" class="link-btn" data-action="exercise-detail" data-name="' + esc(ex.name) + '">' + esc(ex.name) + '</button>' +
                        '<span class="program-ex-target">' + (ex.sets ? ex.sets + ' × ' : '') + esc(ex.reps) + '</span></li>').join('') + '</ul>' +
                    '<div class="schedule-row"><label class="field-label" for="sch-' + key + '">Programar</label>' +
                    '<input class="input input-date" type="date" id="sch-' + key + '" data-schedule="' + key + '" value="' + esc(sched) + '">' +
                    (sched ? '<button class="btn btn-ghost btn-sm" type="button" data-action="clear-schedule" data-key="' + key + '">Quitar fecha</button>' : '') +
                    '<span class="grow"></span><button class="btn btn-secondary btn-sm" type="button" data-action="start" data-phase="' + ph.id + '" data-day="' + day.id + '">' + icon('play', 'icon-sm') + 'Empezar</button></div>' +
                    '</details>';
            });
            html += '</article>';
        });
        html += '</section>';
        return html;
    }

    /* ------------------------------------------------------------------ *
     * View: History
     * ------------------------------------------------------------------ */
    function filteredSessions() {
        const q = ui.historyQuery.trim().toLowerCase();
        return state.sessions.filter((s) => {
            if (ui.historyFilter !== 'all' && s.phase !== ui.historyFilter) return false;
            if (!q) return true;
            return s.dayName.toLowerCase().includes(q) || s.notes.toLowerCase().includes(q) ||
                s.exercises.some((e) => C.exerciseHasData(e) && e.name.toLowerCase().includes(q));
        });
    }

    function renderHistory() {
        let html = demoBanner() + '<div class="page-head"><div><h1 class="page-title">Historial</h1><p class="page-sub">' + plural(state.sessions.length, 'sesión registrada', 'sesiones registradas') + '</p></div></div>';
        if (!state.sessions.length) return html + emptyState('history', 'Sin entrenamientos todavía', 'Guarda tu primera sesión y aquí verás cada set, peso y nota.', '#train', 'Empezar a entrenar');

        html += '<div class="filters"><div class="search">' + icon('search') +
            '<input class="input" type="search" id="historySearch" placeholder="Buscar ejercicio o nota" value="' + esc(ui.historyQuery) + '" aria-label="Buscar en el historial"></div>' +
            '<div class="chips" role="group" aria-label="Filtrar por fase">' +
            '<button class="chip" type="button" data-action="history-filter" data-filter="all" aria-pressed="' + (ui.historyFilter === 'all') + '">Todas</button>' +
            P.phases.map((p) => '<button class="chip" type="button" data-action="history-filter" data-filter="' + p.id + '" aria-pressed="' + (ui.historyFilter === p.id) + '"><span class="dot phase-dot-' + p.id + '"></span>' + esc(p.label) + '</button>').join('') +
            '</div></div><div id="historyList">' + historyList() + '</div>';
        return html;
    }

    function historyList() {
        const list = filteredSessions();
        if (!list.length) return '<p class="card card-pad muted">No hay sesiones que coincidan con el filtro.</p>';
        let html = '', month = '';
        list.slice(0, ui.historyLimit).forEach((s) => {
            const m = s.date.slice(0, 7);
            if (m !== month) {
                if (month) html += '</div>';
                month = m;
                html += '<h2 class="month-head">' + esc(fmtMonth(s.date)) + '</h2><div class="stagger">';
            }
            html += logCard(s);
        });
        if (month) html += '</div>';
        if (list.length > ui.historyLimit) {
            html += '<div style="text-align:center;margin-top:var(--s-5)"><button class="btn btn-secondary" type="button" data-action="history-more">Mostrar más (' + (list.length - ui.historyLimit) + ')</button></div>';
        }
        return html;
    }

    function logCard(s) {
        const ph = P.getPhase(s.phase);
        const sum = C.summarizeSession(s);
        const open = !!ui.expanded[s.id];
        const dt = d(s.date);
        let html = '<article class="card log phase-' + esc(s.phase) + '">' +
            '<button class="log-summary" type="button" data-action="toggle-log" data-id="' + esc(s.id) + '" aria-expanded="' + open + '" aria-controls="log-' + esc(s.id) + '">' +
            '<span class="log-date"><span class="dow">' + esc(fmt.dow.format(dt).replace('.', '')) + '</span><span class="dom">' + dt.getDate() + '</span></span>' +
            '<span class="log-main"><span class="log-title">' + esc(s.dayName || 'Sesión') + ' <span class="badge"><span class="dot phase-dot-' + esc(s.phase) + '"></span>' + esc(ph ? ph.label : s.phase) + '</span>' + (s.demo ? '<span class="badge badge-demo">Ejemplo</span>' : '') + '</span>' +
            '<span class="log-stats"><span><b>' + sum.exercises + '</b> ejercicios</span>' +
            (sum.sets ? '<span><b>' + sum.sets + '</b> sets</span>' : '') +
            (sum.volume ? '<span><b>' + esc(vol(sum.volume)) + '</b> ' + unit() + ' vol.</span>' : '') +
            (sum.maxWeight ? '<span><b>' + esc(w(sum.maxWeight)) + '</b> ' + unit() + ' máx.</span>' : '') + '</span></span>' +
            icon('chevron-down', 'log-chevron') + '</button>';
        html += '<div class="log-body" id="log-' + esc(s.id) + '"' + (open ? '' : ' hidden') + '>';
        s.exercises.filter(C.exerciseHasData).forEach((ex) => {
            html += '<div class="log-ex"><span class="log-ex-name">' + esc(ex.name) + '</span><span class="log-sets">' +
                (ex.sets.length ? ex.sets.map(pill).join('') :
                    (ex.completed ? '<span class="set-pill is-done">' + icon('check') + 'Hecho</span>' : '') + (ex.note ? '<span class="set-pill">' + esc(ex.note) + '</span>' : '')) +
                '</span></div>';
        });
        if (s.notes) html += '<p class="log-notes">' + esc(s.notes) + '</p>';
        html += '<div class="log-actions"><button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-session" data-id="' + esc(s.id) + '">' + icon('trash', 'icon-sm') + 'Eliminar</button>' +
            (s.dayId && P.getDay(s.phase, s.dayId) ? '<button class="btn btn-secondary btn-sm" type="button" data-action="start" data-phase="' + esc(s.phase) + '" data-day="' + esc(s.dayId) + '">' + icon('rotate', 'icon-sm') + 'Repetir</button>' : '') +
            '</div></div></article>';
        return html;
    }

    async function deleteSession(id) {
        const idx = state.sessions.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const s = state.sessions[idx];
        const ok = await confirmDialog('¿Eliminar esta sesión?', s.dayName + ' del ' + fmtDay(s.date) + '. Podrás deshacerlo justo después.', 'Eliminar');
        if (!ok) return;
        state.sessions.splice(idx, 1);
        persist();
        render({ keepScroll: true });
        toast('Sesión eliminada', {
            type: 'info',
            action: { label: 'Deshacer', fn: () => { state.sessions = C.sortSessions(state.sessions.concat([s])); persist(); render({ keepScroll: true }); } }
        });
    }

    /* ------------------------------------------------------------------ *
     * View: Progress
     * ------------------------------------------------------------------ */
    function renderProgress() {
        const st = C.computeStats(state.sessions, today(), state.settings.weeklyGoal);
        let html = demoBanner() + '<div class="page-head"><div><h1 class="page-title">Progreso</h1><p class="page-sub">' +
            (st.programWeek ? 'Semana ' + st.programWeek + ' del programa' : 'Tus números aparecerán después de tu primera sesión') + '</p></div></div>';

        const pct = Math.min(1, st.thisWeek / st.weeklyGoal);
        html += '<div class="kpis stagger">' +
            kpi('Sesiones', 'dumbbell', '<span data-count="' + st.total + '">' + st.total + '</span>', st.last ? 'Última: ' + esc(relDays(st.last.date).toLowerCase()) : 'Sin registros') +
            kpi('Esta semana', 'calendar', '<span data-count="' + st.thisWeek + '">' + st.thisWeek + '</span><span class="kpi-unit">/' + st.weeklyGoal + '</span>',
                '<div class="meter" role="meter" aria-label="Meta semanal" aria-valuemin="0" aria-valuemax="' + st.weeklyGoal + '" aria-valuenow="' + st.thisWeek + '"><span style="width:' + (pct * 100).toFixed(0) + '%"></span></div>') +
            kpi('Racha', 'flame', '<span data-count="' + st.weekStreak + '">' + st.weekStreak + '</span><span class="kpi-unit">' + (st.weekStreak === 1 ? 'semana' : 'semanas') + '</span>', 'Semanas seguidas entrenando') +
            kpi('Volumen 30 días', 'chart', '<span data-count="' + C.round(C.fromKg(st.volume30, unit()), 0) + '">' + fmt.int.format(C.fromKg(st.volume30, unit())) + '</span><span class="kpi-unit">' + unit() + '</span>', 'Peso × reps acumulado') +
            '</div>';

        const names = C.weightedExercises(state.sessions);
        if (!names.length) {
            return html + '<div class="section">' + emptyState('chart', 'Aún no hay pesos registrados', 'Cuando registres pesos en tus sets verás aquí tu 1RM estimado, volumen semanal y récords personales.', '#train', 'Ir a entrenar') + '</div>';
        }
        if (!ui.progressExercise || names.indexOf(ui.progressExercise) === -1) ui.progressExercise = names[0];

        html += '<section class="section card chart-card" aria-labelledby="exChartTitle">' +
            '<div class="chart-controls"><label class="visually-hidden" for="exerciseSelect">Ejercicio</label>' +
            '<select class="select" id="exerciseSelect">' + names.map((n) => '<option' + (n === ui.progressExercise ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' +
            '<div class="segmented" role="group" aria-label="Métrica">' +
            [['e1rm', '1RM est.'], ['max', 'Peso máx.'], ['volume', 'Volumen']].map((m) =>
                '<button type="button" data-action="metric" data-metric="' + m[0] + '" aria-pressed="' + (ui.progressMetric === m[0]) + '">' + m[1] + '</button>').join('') +
            '</div></div><div id="exerciseChartWrap"></div></section>';

        html += '<section class="section card chart-card" aria-labelledby="volTitle"><div class="chart-head"><div><h2 class="chart-title" id="volTitle">Volumen semanal</h2>' +
            '<p class="text-sm muted">Últimas 12 semanas · ' + unit() + ' (peso × reps)</p></div></div><div id="volumeChart"></div>' +
            '<details class="table-toggle"><summary>' + icon('chevron-down', 'icon-sm') + 'Ver como tabla</summary><div class="table-wrap" id="volumeTable"></div></details></section>';

        const prs = C.personalRecords(state.sessions);
        const prRow = (p) => '<tr><td class="name"><button type="button" class="link-btn" data-action="exercise-detail" data-name="' + esc(p.name) + '">' + esc(p.name) + '</button></td>' +
            '<td class="num">' + esc(w(p.weight)) + ' ' + unit() + (p.reps ? ' <span class="muted">× ' + p.reps + '</span>' : '') + '</td>' +
            '<td class="num">' + esc(w(p.e1rm)) + ' ' + unit() + '</td><td>' + esc(fmtDay(p.date)) + '</td></tr>';
        const prHead = '<thead><tr><th scope="col">Ejercicio</th><th scope="col" class="num">Mejor peso</th><th scope="col" class="num">1RM est.</th><th scope="col">Fecha</th></tr></thead>';
        const TOP = 8;
        html += '<section class="section"><div class="section-head"><h2 class="section-title">Récords personales</h2><span class="section-hint">' + plural(prs.length, 'ejercicio', 'ejercicios') + '</span></div>' +
            '<div class="table-wrap card"><table class="table">' + prHead + '<tbody>' + prs.slice(0, TOP).map(prRow).join('') + '</tbody></table></div>' +
            (prs.length > TOP ? '<details class="table-toggle"><summary>' + icon('chevron-down', 'icon-sm') + 'Ver los ' + prs.length + ' ejercicios</summary>' +
                '<div class="table-wrap card"><table class="table">' + prHead + '<tbody>' + prs.slice(TOP).map(prRow).join('') + '</tbody></table></div></details>' : '') +
            '</section>';
        return html;
    }

    function kpi(label, ic, value, foot) {
        return '<div class="card kpi"><span class="kpi-label">' + icon(ic, 'icon-sm') + esc(label) + '</span><span class="kpi-value">' + value + '</span><span class="kpi-foot">' + foot + '</span></div>';
    }

    function drawProgressCharts() {
        const wrap = $('#exerciseChartWrap');
        if (wrap) {
            const metric = ui.progressMetric;
            const series = C.exerciseSeries(state.sessions, ui.progressExercise, metric);
            const metricName = { e1rm: '1RM estimado', max: 'Peso máximo', volume: 'Volumen' }[metric];
            const fmtV = (v) => metric === 'volume' ? vol(v) : w(v);
            if (!series.length) {
                wrap.innerHTML = '<div class="chart-head"><h2 class="chart-title" id="exChartTitle">' + esc(metricName) + ' · ' + esc(ui.progressExercise) + '</h2></div>' +
                    '<p class="muted text-sm">Esta métrica necesita peso y repeticiones en el mismo set. Prueba “Peso máx.” o registra tus reps.</p>';
                return;
            }
            const last = series[series.length - 1], first = series[0];
            const delta = last && first && series.length > 1 ? last.value - first.value : 0;
            wrap.innerHTML = '<div class="chart-head"><div><h2 class="chart-title" id="exChartTitle">' + esc(metricName) + ' · ' + esc(ui.progressExercise) + '</h2>' +
                '<p class="text-sm muted">' + plural(series.length, 'sesión', 'sesiones') + '</p></div>' +
                '<div class="chart-figure-wrap"><div class="chart-figure">' + esc(fmtV(last.value)) + ' <span class="kpi-unit">' + unit() + '</span></div>' +
                (series.length > 1 ? '<div class="chart-delta' + (delta > 0 ? ' up' : '') + '">' + (delta > 0 ? '+' : delta < 0 ? '−' : '±') + esc(fmtV(Math.abs(delta))) + ' ' + unit() + ' desde ' + esc(fmtDayShort(first.date)) + '</div>' : '') +
                '</div></div><div id="exerciseChart"></div>' +
                '<details class="table-toggle"><summary>' + icon('chevron-down', 'icon-sm') + 'Ver como tabla</summary><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Fecha</th><th scope="col" class="num">' + esc(metricName) + ' (' + unit() + ')</th></tr></thead><tbody>' +
                series.slice().reverse().map((p) => '<tr><td>' + esc(fmtDay(p.date)) + '</td><td class="num">' + esc(fmtV(p.value)) + '</td></tr>').join('') + '</tbody></table></div></details>';
            Charts.line($('#exerciseChart'), {
                points: series,
                label: metricName + ' de ' + ui.progressExercise + ': ' + series.length + ' sesiones, último valor ' + fmtV(last.value) + ' ' + unit(),
                format: fmtV,
                formatDate: (iso, long) => long ? fmtDay(iso) : fmtDayShort(iso),
                animate: !reducedMotion.matches
            });
        }
        const volEl = $('#volumeChart');
        if (volEl) {
            const weeks = C.weeklyVolume(state.sessions, 12, today());
            const current = weeks[weeks.length - 1].weekStart;
            Charts.columns(volEl, {
                bars: weeks.map((wk) => ({
                    key: wk.weekStart,
                    label: fmtDayShort(wk.weekStart),
                    title: 'Semana del ' + fmtDayShort(wk.weekStart) + ' · ' + plural(wk.sessions, 'sesión', 'sesiones'),
                    value: C.fromKg(wk.volume, unit())
                })),
                highlight: current,
                format: (v) => fmt.compact.format(v),
                label: 'Volumen semanal de las últimas 12 semanas en ' + unit(),
                animate: !reducedMotion.matches
            });
            $('#volumeTable').innerHTML = '<table class="table"><thead><tr><th scope="col">Semana</th><th scope="col" class="num">Sesiones</th><th scope="col" class="num">Volumen (' + unit() + ')</th></tr></thead><tbody>' +
                weeks.slice().reverse().map((wk) => '<tr><td>' + esc(fmtDay(wk.weekStart)) + '</td><td class="num">' + wk.sessions + '</td><td class="num">' + fmt.int.format(C.fromKg(wk.volume, unit())) + '</td></tr>').join('') + '</tbody></table>';
        }
    }
    function rerenderCharts() { if (ui.route === 'progress') drawProgressCharts(); }

    /* ------------------------------------------------------------------ *
     * View: Settings
     * ------------------------------------------------------------------ */
    let installEvent = null;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

    function seg(group, current, options) {
        return '<div class="segmented segmented-block" role="group" aria-label="' + esc(group.label) + '">' + options.map((o) =>
            '<button type="button" data-action="' + group.action + '" data-value="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + (o[2] ? icon(o[2], 'icon-sm') : '') + esc(o[1]) + '</button>').join('') + '</div>';
    }
    function sw(id, key, label) {
        return '<label class="switch"><input type="checkbox" role="switch" id="' + id + '" data-setting="' + key + '"' + (state.settings[key] ? ' checked' : '') + ' aria-label="' + esc(label) + '"></label>';
    }
    function restSelect(phase) {
        const v = restFor(phase.id);
        const opts = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
        if (opts.indexOf(v) === -1) opts.push(v);
        return '<select class="select" id="rest-' + phase.id + '" data-rest="' + phase.id + '" style="width:auto">' +
            opts.sort((a, b) => a - b).map((s) => '<option value="' + s + '"' + (s === v ? ' selected' : '') + '>' + (s ? fmtRest(s) : 'Sin descanso') + (s === phase.restTime ? ' (programa)' : '') + '</option>').join('') + '</select>';
    }

    function renderSettings() {
        const s = state.settings;
        let html = '<div class="page-head"><div><h1 class="page-title">Ajustes</h1><p class="page-sub">Tus datos viven solo en este dispositivo</p></div></div>';

        html += '<section class="section"><div class="section-head"><h2 class="section-title">Apariencia y unidades</h2></div><div class="list">' +
            '<div class="list-item list-item-stack"><span class="list-icon">' + icon('palette') + '</span><div class="list-item-text"><div class="list-item-title">Tema</div><div class="list-item-sub">Oscuro reduce el brillo en el gym</div></div>' +
            seg({ label: 'Tema', action: 'set-theme' }, s.theme, [['system', 'Sistema', 'monitor'], ['light', 'Claro', 'sun'], ['dark', 'Oscuro', 'moon']]) + '</div>' +
            '<div class="list-item list-item-stack"><span class="list-icon">' + icon('scale') + '</span><div class="list-item-text"><div class="list-item-title">Unidad de peso</div><div class="list-item-sub">Se convierte todo tu historial al instante</div></div>' +
            seg({ label: 'Unidad', action: 'set-unit' }, s.unit, [['kg', 'Kilogramos'], ['lb', 'Libras']]) + '</div></div></section>';

        html += '<section class="section"><div class="section-head"><h2 class="section-title">Entrenamiento</h2></div><div class="list">' +
            '<div class="list-item"><span class="list-icon">' + icon('target') + '</span><div class="list-item-text"><label class="list-item-title" for="weeklyGoal">Meta semanal</label><div class="list-item-sub">Sesiones por semana</div></div>' +
            '<select class="select" id="weeklyGoal" data-setting="weeklyGoal" style="width:auto">' + [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === s.weeklyGoal ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
            '<div class="list-item"><span class="list-icon">' + icon('timer') + '</span><div class="list-item-text"><label class="list-item-title" for="autoRest">Descanso automático</label><div class="list-item-sub">Inicia el temporizador al completar un set</div></div>' + sw('autoRest', 'autoRest', 'Descanso automático') + '</div>' +
            '<div class="list-item"><span class="list-icon">' + icon('volume') + '</span><div class="list-item-text"><label class="list-item-title" for="sound">Sonido</label><div class="list-item-sub">Aviso al terminar el descanso</div></div>' + sw('sound', 'sound', 'Sonido') + '</div>' +
            '<div class="list-item"><span class="list-icon">' + icon('vibrate') + '</span><div class="list-item-text"><label class="list-item-title" for="vibrate">Vibración</label><div class="list-item-sub">En teléfonos compatibles</div></div>' + sw('vibrate', 'vibrate', 'Vibración') + '</div>' +
            P.phases.filter((p) => p.kind === 'strength').map((p) =>
                '<div class="list-item"><span class="list-icon phase-' + p.id + '"><span class="plate-chip" style="width:22px;height:22px" aria-hidden="true"></span></span><div class="list-item-text"><label class="list-item-title" for="rest-' + p.id + '">Descanso ' + esc(p.label) + '</label><div class="list-item-sub">' + esc(p.rest) + '</div></div>' + restSelect(p) + '</div>').join('') +
            '</div></section>';

        html += '<section class="section"><div class="section-head"><h2 class="section-title">Tus datos</h2><span class="section-hint">' + plural(state.sessions.length, 'sesión', 'sesiones') + '</span></div><div class="list">' +
            '<div class="list-item"><span class="list-icon">' + icon('download') + '</span><div class="list-item-text"><div class="list-item-title">Respaldo completo</div><div class="list-item-sub">Archivo JSON para restaurar en otro dispositivo</div></div><button class="btn btn-secondary btn-sm" type="button" data-action="export-json">Exportar</button></div>' +
            '<div class="list-item"><span class="list-icon">' + icon('file') + '</span><div class="list-item-text"><div class="list-item-title">Hoja de cálculo</div><div class="list-item-sub">CSV con cada set para Excel o Google Sheets</div></div><button class="btn btn-secondary btn-sm" type="button" data-action="export-csv">Exportar CSV</button></div>' +
            '<div class="list-item"><span class="list-icon">' + icon('layers') + '</span><div class="list-item-text"><div class="list-item-title">Datos de ejemplo</div><div class="list-item-sub">' +
            (demoCount() ? plural(demoCount(), 'sesión', 'sesiones') + ' de ejemplo cargadas. Quitarlas no toca tus datos reales.' : '16 semanas de entrenamiento ficticio para explorar gráficas e historial') + '</div></div>' +
            (demoCount() ? '<button class="btn btn-secondary btn-sm" type="button" data-action="remove-demo">Quitar</button>' : '<button class="btn btn-secondary btn-sm" type="button" data-action="load-demo">Cargar</button>') + '</div>' +
            '<div class="list-item"><span class="list-icon">' + icon('upload') + '</span><div class="list-item-text"><div class="list-item-title">Importar respaldo</div><div class="list-item-sub">Combina sin duplicar. Acepta respaldos de la versión anterior</div></div>' +
            '<label class="btn btn-secondary btn-sm" for="importFile">Elegir archivo</label><input class="visually-hidden" type="file" id="importFile" accept="application/json,.json"></div>' +
            '<div class="list-item"><span class="list-icon" style="color:var(--danger)">' + icon('trash') + '</span><div class="list-item-text"><div class="list-item-title">Borrar todo</div><div class="list-item-sub">Elimina historial, fechas y borrador de este dispositivo</div></div><button class="btn btn-danger-ghost btn-sm" type="button" data-action="clear-all">Borrar</button></div>' +
            '</div></section>';

        html += '<section class="section"><div class="section-head"><h2 class="section-title">App</h2></div><div class="list">' +
            '<div class="list-item"><span class="list-icon">' + icon('phone') + '</span><div class="list-item-text"><div class="list-item-title">Instalar en tu teléfono</div><div class="list-item-sub">' +
            (isStandalone ? 'Ya está instalada. Funciona sin conexión.' : installEvent ? 'Ábrela desde tu pantalla de inicio, sin navegador.' : isIOS ? 'En Safari: Compartir → Agregar a inicio.' : 'Usa el menú del navegador → Instalar app / Agregar a inicio.') + '</div></div>' +
            (installEvent && !isStandalone ? '<button class="btn btn-primary btn-sm" type="button" data-action="install">Instalar</button>' : '') + '</div>' +
            '<div class="list-item"><span class="list-icon">' + icon('info') + '</span><div class="list-item-text"><div class="list-item-title">MAPS Performance Tracker ' + VERSION + '</div><div class="list-item-sub">Sin cuentas ni servidores: tus datos no salen de este dispositivo.</div></div></div>' +
            '</div></section>';
        return html;
    }

    /* Inside the claude.ai artifact viewer files go through its `downloads` capability. */
    let viewerDownloads = null;
    function viewerSaver() {
        if (!(window.claude && typeof window.claude.use === 'function')) return Promise.resolve(null);
        if (!viewerDownloads) viewerDownloads = Promise.resolve(window.claude.use('downloads')).catch(() => null);
        return viewerDownloads;
    }

    async function download(filename, content, type) {
        const saver = await viewerSaver();
        if (saver) {
            try { await saver.save({ filename: filename, data: content }); return true; }
            catch (e) {
                if (!e || e.code !== 'declined') toast('No se pudo guardar el archivo en esta vista.', { type: 'error' });
                return false;
            }
        }
        try {
            const blob = new Blob([content], { type: type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
        } catch (e) {
            toast('Tu navegador no permitió la descarga.', { type: 'error' });
            return false;
        }
    }

    function importFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = C.parseBackup(String(reader.result), P);
                const merged = C.mergeSessions(state.sessions, parsed.sessions);
                state.sessions = merged.sessions;
                Object.keys(parsed.schedule).forEach((k) => { if (!state.schedule[k]) state.schedule[k] = parsed.schedule[k]; });
                persist();
                render({ keepScroll: true });
                toast(merged.added ? 'Importadas ' + plural(merged.added, 'sesión', 'sesiones') + (merged.skipped ? ' · ' + merged.skipped + ' ya existían' : '') : 'Todas las sesiones ya existían; no hubo cambios.', { type: merged.added ? 'success' : 'info' });
            } catch (e) {
                toast(e.message || 'No se pudo leer el archivo.', { type: 'error' });
            }
        };
        reader.onerror = () => toast('No se pudo leer el archivo.', { type: 'error' });
        reader.readAsText(file);
    }

    /* ------------------------------------------------------------------ *
     * Shared bits
     * ------------------------------------------------------------------ */
    function emptyState(ic, title, text, href, cta) {
        return '<div class="card empty"><span class="empty-icon">' + icon(ic) + '</span><h2 class="empty-title">' + esc(title) + '</h2><p class="empty-text">' + esc(text) + '</p>' +
            '<div class="row" style="justify-content:center">' +
            (href ? '<a class="btn btn-primary" href="' + href + '">' + esc(cta) + '</a>' : '') +
            '<button class="btn btn-secondary" type="button" data-action="load-demo">' + icon('layers') + 'Ver con datos de ejemplo</button></div></div>';
    }

    /* ------------------------------------------------------------------ *
     * Example data — marked `demo: true`, removable in one tap
     * ------------------------------------------------------------------ */
    const DEMO_KEY = 'maps.v2.demo';
    function demoMeta() {
        try { return JSON.parse(storage.getItem(DEMO_KEY) || 'null') || {}; } catch (e) { return {}; }
    }
    const demoCount = () => state.sessions.filter((s) => s.demo).length;

    function loadDemo(silent) {
        const data = C.generateDemoData(today(), P, 2026);
        const merged = C.mergeSessions(state.sessions.filter((s) => !s.demo), data.sessions);
        const scheduled = {};
        Object.keys(data.schedule).forEach((k) => {
            if (!state.schedule[k]) { state.schedule[k] = data.schedule[k]; scheduled[k] = data.schedule[k]; }
        });
        state.sessions = merged.sessions;
        if (!persist()) return;
        storage.setItem(DEMO_KEY, JSON.stringify({ schedule: scheduled }));
        ui.phase = null;
        ui.progressExercise = null;
        render({ keepScroll: !!silent });
        if (!silent) toast('Cargadas ' + plural(data.sessions.length, 'sesión', 'sesiones') + ' de ejemplo (16 semanas)');
    }

    function removeDemo() {
        const meta = demoMeta();
        state.sessions = state.sessions.filter((s) => !s.demo);
        Object.keys(meta.schedule || {}).forEach((k) => { if (state.schedule[k] === meta.schedule[k]) delete state.schedule[k]; });
        persist();
        storage.setItem(DEMO_KEY, JSON.stringify({ dismissed: true }));
        ui.phase = null;
        ui.progressExercise = null;
        render({ keepScroll: true });
        toast('Datos de ejemplo eliminados', { type: 'info' });
    }

    function demoBanner() {
        if (!demoCount()) return '';
        return '<div class="demo-banner" role="note">' + icon('info') + '<span class="demo-text"><b>Datos de ejemplo</b><span class="demo-sep" aria-hidden="true"> · </span><span class="demo-sub">' + plural(demoCount(), 'sesión ficticia', 'sesiones ficticias') + '. Lo que registres se guarda aparte.</span></span>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-action="remove-demo">Quitar</button></div>';
    }

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */
    const actions = {
        'cycle-theme': () => {
            const order = ['system', 'light', 'dark'];
            state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3];
            persist();
            applyTheme();
            if (ui.route === 'settings') render({ keepScroll: true }); else rerenderCharts();
            toast('Tema: ' + THEME_META[state.settings.theme].label, { type: 'info', duration: 1600 });
        },
        'set-theme': (el) => { state.settings.theme = el.dataset.value; persist(); applyTheme(); render({ keepScroll: true }); },
        'set-unit': (el) => {
            if (state.settings.unit === el.dataset.value) return;
            state.settings.unit = el.dataset.value;
            persist();
            render({ keepScroll: true });
            toast('Mostrando pesos en ' + (el.dataset.value === 'kg' ? 'kilogramos' : 'libras'), { type: 'info' });
        },
        'pick-phase': (el) => { ui.phase = el.dataset.phase; render({ keepScroll: true }); },
        'start': (el) => startSession(el.dataset.phase, el.dataset.day),
        'discard-draft': async () => {
            const ok = await confirmDialog('¿Descartar la sesión en curso?', 'Se perderán los sets que no has guardado.', 'Descartar');
            if (!ok) return;
            draft = null;
            saveDraftNow();
            stopRest();
            go('train');
            toast('Sesión descartada', { type: 'info' });
        },
        'save-session': () => saveSession(),
        'fill-last': () => fillFromLast(),
        'add-set': (el) => {
            const i = +el.dataset.ex;
            draft.exercises[i].sets.push({ weight: '', reps: '', done: false });
            saveDraftNow();
            render({ keepScroll: true });
            const rows = $$('.exercise[data-ex="' + i + '"] .set-row:not(.is-head)');
            const input = rows.length && $('[data-field="weight"]', rows[rows.length - 1]);
            if (input) input.focus();
        },
        'rest-start': () => startRest(restFor(draft ? draft.phase : 'P1') || 90),
        'rest-adjust': (el) => adjustRest(+el.dataset.delta),
        'rest-pause': () => togglePause(),
        'rest-stop': () => stopRest(),
        'exercise-detail': (el) => showExercise(el.dataset.name),
        'clear-schedule': (el) => { delete state.schedule[el.dataset.key]; persist(); render({ keepScroll: true }); toast('Fecha eliminada', { type: 'info' }); },
        'history-filter': (el) => { ui.historyFilter = el.dataset.filter; ui.historyLimit = 20; render({ keepScroll: true }); },
        'history-more': () => { ui.historyLimit += 20; $('#historyList').innerHTML = historyList(); stagger($('#historyList')); },
        'toggle-log': (el) => {
            const id = el.dataset.id;
            ui.expanded[id] = !ui.expanded[id];
            el.setAttribute('aria-expanded', String(ui.expanded[id]));
            const body = document.getElementById('log-' + id);
            if (body) body.hidden = !ui.expanded[id];
        },
        'delete-session': (el) => deleteSession(el.dataset.id),
        'metric': (el) => {
            ui.progressMetric = el.dataset.metric;
            $$('[data-action="metric"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
            drawProgressCharts();
        },
        'export-json': () => {
            download('maps-respaldo-' + today() + '.json', JSON.stringify(C.exportBackup(state), null, 2), 'application/json').then((ok) => { if (ok) toast('Respaldo exportado'); });
        },
        'export-csv': () => {
            download('maps-entrenamientos-' + today() + '.csv', '\uFEFF' + C.toCSV(state.sessions, unit(), P), 'text/csv;charset=utf-8').then((ok) => { if (ok) toast('CSV exportado'); });
        },
        'load-demo': async () => {
            const real = state.sessions.filter((s) => !s.demo).length;
            if (real) {
                const ok = await confirmDialog('¿Agregar datos de ejemplo?', 'Se sumarán sesiones de ejemplo marcadas como tales junto a tus ' + plural(real, 'sesión', 'sesiones') + '. Puedes quitarlas después sin tocar tus datos.', 'Agregar');
                if (!ok) return;
            }
            loadDemo(false);
        },
        'remove-demo': () => removeDemo(),
        'clear-all': async () => {
            const ok = await confirmDialog('¿Borrar todos tus datos?', 'Se eliminarán ' + plural(state.sessions.length, 'sesión', 'sesiones') + ' y tus fechas programadas de este dispositivo. Exporta un respaldo antes si lo quieres conservar.', 'Borrar todo');
            if (!ok) return;
            state.sessions = [];
            state.schedule = {};
            draft = null;
            saveDraftNow();
            [C.KEYS.legacyLogs, C.KEYS.legacySchedule].forEach((k) => storage.removeItem(k));
            storage.setItem(DEMO_KEY, JSON.stringify({ dismissed: true }));
            persist();
            render({ keepScroll: true });
            toast('Datos eliminados', { type: 'info' });
        },
        'install': async () => {
            if (!installEvent) return;
            installEvent.prompt();
            try { await installEvent.userChoice; } catch (e) { /* ignore */ }
            installEvent = null;
            $('#installBtn').hidden = true;
            if (ui.route === 'settings') render({ keepScroll: true });
        }
    };

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        const fn = actions[el.getAttribute('data-action')];
        if (fn) { e.preventDefault(); fn(el); }
    });

    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);

    document.addEventListener('input', (e) => {
        const t = e.target;
        if (t.id === 'historySearch') {
            ui.historyQuery = t.value;
            ui.historyLimit = 20;
            $('#historyList').innerHTML = historyList();
            return;
        }
        if (ui.route === 'session' && draft && t.hasAttribute('data-field') && t.type !== 'checkbox') onSessionInput(t);
    });

    document.addEventListener('change', (e) => {
        const t = e.target;
        if (ui.route === 'session' && draft && t.type === 'checkbox' && t.hasAttribute('data-field')) { onSetToggle(t); return; }
        if (t.hasAttribute('data-schedule')) {
            const key = t.getAttribute('data-schedule');
            if (C.isISODate(t.value)) {
                state.schedule[key] = t.value;
                toast(P.getDay(key.split('-')[0], key.split('-')[1]).name + ' programado: ' + fmtDay(t.value));
            } else {
                delete state.schedule[key];
            }
            persist();
            render({ keepScroll: true });
            return;
        }
        if (t.hasAttribute('data-setting')) {
            const key = t.getAttribute('data-setting');
            state.settings[key] = t.type === 'checkbox' ? t.checked : C.normalizeSettings({ weeklyGoal: t.value }).weeklyGoal;
            persist();
            return;
        }
        if (t.hasAttribute('data-rest')) {
            state.settings.restOverrides[t.getAttribute('data-rest')] = +t.value;
            persist();
            toast('Descanso actualizado', { duration: 1500 });
            return;
        }
        if (t.id === 'exerciseSelect') { ui.progressExercise = t.value; drawProgressCharts(); return; }
        if (t.id === 'importFile' && t.files && t.files[0]) { importFile(t.files[0]); t.value = ''; }
    });

    // Enter moves weight → reps → next set's weight, like a native keypad.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('set-input')) return;
        e.preventDefault();
        const inputs = $$('.set-input');
        const next = inputs[inputs.indexOf(e.target) + 1];
        if (next) next.focus(); else e.target.blur();
    });

    // Select all on focus so a new number replaces the old one in one go.
    document.addEventListener('focusin', (e) => {
        if (e.target.classList && e.target.classList.contains('set-input')) setTimeout(() => { try { e.target.select(); } catch (err) { /* ignore */ } }, 0);
    });

    window.addEventListener('hashchange', () => render());
    window.addEventListener('pagehide', saveDraftNow);

    /* ------------------------------------------------------------------ *
     * PWA
     * ------------------------------------------------------------------ */
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        if (!isStandalone) $('#installBtn').hidden = false;
        if (ui.route === 'settings') render({ keepScroll: true });
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null;
        $('#installBtn').hidden = true;
        toast('App instalada. Ábrela desde tu pantalla de inicio.');
    });

    function registerSW() {
        if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
        try {
            const hadController = !!navigator.serviceWorker.controller;
            navigator.serviceWorker.register('service-worker.js').catch(() => { /* offline mode unavailable */ });
            let reloading = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!hadController || reloading) return;
                toast('Nueva versión disponible', {
                    type: 'info', duration: 10000,
                    action: { label: 'Actualizar', fn: () => { reloading = true; saveDraftNow(); location.reload(); } }
                });
            });
        } catch (e) { /* sandboxed */ }
    }

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */
    applyTheme();
    initTilt();
    // Shared single-file builds open with example data so the app shows its work.
    if (window.MAPS_AUTODEMO && !state.sessions.length && !draft && !demoMeta().dismissed) {
        const data = C.generateDemoData(today(), P, 2026);
        state.sessions = data.sessions;
        Object.keys(data.schedule).forEach((k) => { if (!state.schedule[k]) state.schedule[k] = data.schedule[k]; });
        if (persist()) storage.setItem(DEMO_KEY, JSON.stringify({ schedule: data.schedule }));
    }
    render();
    registerSW();
    if (loaded.migrated) toast('Tus ' + plural(state.sessions.length, 'sesión', 'sesiones') + ' se migraron al nuevo diseño. Nada se perdió.', { duration: 5000 });
    if (loaded.recovered) toast('Había datos dañados; se guardó una copia y la app arrancó limpia.', { type: 'error', duration: 8000 });

    // Test hook (read-only snapshot).
    window.__maps = { state: state, get draft() { return draft; }, version: VERSION };
})();
