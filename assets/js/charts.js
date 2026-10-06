/*
 * MAPS Performance Tracker — dependency-free SVG charts.
 *
 * line(container, opts)    single-series trend over a time axis, crosshair tooltip
 * columns(container, opts) single-series columns, per-bar tooltip
 *
 * Both are responsive (ResizeObserver), keyboard accessible (←/→ on the focused
 * chart) and theme-aware (colors come from CSS custom properties).
 */
(function (root) {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const core = root.MapsCore;

    function el(name, attrs, parent) {
        const node = document.createElementNS(NS, name);
        if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        if (parent) parent.appendChild(node);
        return node;
    }

    function text(parent, x, y, value, attrs) {
        const t = el('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
        t.textContent = value;
        return t;
    }

    /** Shared scaffolding: tooltip node, resize handling, cleanup. */
    function mount(container, render) {
        if (container._chartCleanup) container._chartCleanup();
        container.classList.add('chart');
        container.innerHTML = '';
        container._animated = false;

        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.hidden = true;

        let lastWidth = 0;
        function draw() {
            const width = Math.round(container.clientWidth);
            if (!width || width === lastWidth) return;
            lastWidth = width;
            Array.prototype.slice.call(container.querySelectorAll('svg')).forEach(function (n) { n.remove(); });
            tooltip.hidden = true;
            render(width, tooltip);
            container.appendChild(tooltip);
        }

        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(function () { draw(); });
            ro.observe(container);
        }
        draw();
        container._chartCleanup = function () { if (ro) ro.disconnect(); };
    }

    function showTooltip(tooltip, x, y, title, value) {
        tooltip.textContent = '';
        const strong = document.createElement('strong');
        const key = document.createElement('span');
        key.className = 'key';
        strong.appendChild(key);
        strong.appendChild(document.createTextNode(value));
        const sub = document.createElement('div');
        sub.textContent = title;
        tooltip.appendChild(strong);
        tooltip.appendChild(sub);
        tooltip.hidden = false;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    function clampTooltipX(x, width) {
        return Math.max(70, Math.min(width - 70, x));
    }

    /**
     * opts: {
     *   points: [{ date: 'YYYY-MM-DD', value: number }]  (chronological)
     *   format(value) → string           axis / label formatting
     *   formatDate(iso, long) → string
     *   label: string                     accessible name
     *   height?: number
     * }
     */
    function line(container, opts) {
        mount(container, function (width, tooltip) {
            const points = opts.points;
            const height = opts.height || (width < 480 ? 220 : 260);
            const m = { top: 16, right: 48, bottom: 32, left: 44 };
            const iw = Math.max(10, width - m.left - m.right);
            const ih = height - m.top - m.bottom;

            const values = points.map(function (p) { return p.value; });
            const min = Math.min.apply(null, values);
            const max = Math.max.apply(null, values);
            const pad = (max - min) * 0.15 || Math.max(1, max * 0.1);
            const ticks = core.niceTicks(Math.max(0, min - pad), max + pad, height < 240 ? 3 : 4);
            const y0 = ticks[0], y1 = ticks[ticks.length - 1];

            const times = points.map(function (p) { return core.parseISODate(p.date).getTime(); });
            const t0 = times[0], t1 = times[times.length - 1];
            const xOf = function (i) { return t1 === t0 ? iw / 2 : (times[i] - t0) / (t1 - t0) * iw; };
            const yOf = function (v) { return ih - (v - y0) / (y1 - y0) * ih; };

            const svg = el('svg', {
                viewBox: '0 0 ' + width + ' ' + height,
                width: width, height: height,
                role: 'img', tabindex: '0',
                'aria-label': opts.label
            });
            const g = el('g', { transform: 'translate(' + m.left + ',' + m.top + ')' }, svg);

            const grid = el('g', { class: 'grid' }, g);
            ticks.forEach(function (t) {
                const y = Math.round(yOf(t)) + 0.5;
                if (t !== y0) el('line', { x1: 0, x2: iw, y1: y, y2: y }, grid);
                text(g, -10, y + 4, opts.format(t), { class: 'tick', 'text-anchor': 'end' });
            });
            el('line', { class: 'baseline', x1: 0, x2: iw, y1: ih + 0.5, y2: ih + 0.5 }, g);

            // X ticks: first, last and up to two evenly spaced in between.
            const xTickCount = Math.min(points.length, width < 480 ? 3 : 5);
            const xIdx = [];
            for (let k = 0; k < xTickCount; k++) {
                const i = xTickCount === 1 ? 0 : Math.round(k * (points.length - 1) / (xTickCount - 1));
                if (xIdx.indexOf(i) === -1) xIdx.push(i);
            }
            xIdx.forEach(function (i, k) {
                const anchor = points.length === 1 ? 'middle' : k === 0 ? 'start' : k === xIdx.length - 1 ? 'end' : 'middle';
                text(g, xOf(i), ih + 22, opts.formatDate(points[i].date, false), { class: 'tick', 'text-anchor': anchor });
            });

            const coords = points.map(function (p, i) { return [xOf(i), yOf(p.value)]; });
            let lineEl = null;
            if (coords.length > 1) {
                const d = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join('');
                el('path', { class: 'series-area' + (opts.animate && !container._animated ? ' animate' : ''), d: d + 'L' + coords[coords.length - 1][0].toFixed(1) + ' ' + ih + 'L' + coords[0][0].toFixed(1) + ' ' + ih + 'Z' }, g);
                lineEl = el('path', { class: 'series-line', d: d }, g);
            }
            if (coords.length <= 40) {
                coords.forEach(function (c, i) {
                    const dot = el('circle', { class: 'series-dot' + (opts.animate && !container._animated ? ' animate' : ''), cx: c[0], cy: c[1], r: 4 }, g);
                    if (opts.animate) dot.style.setProperty('--i', Math.min(i, 30));
                });
            }
            // End label (the latest value) — selective direct labeling.
            const last = coords[coords.length - 1];
            text(g, last[0] + 10, last[1] + 4, opts.format(points[points.length - 1].value), { class: 'end-label', 'text-anchor': 'start' });

            const cross = el('line', { class: 'crosshair', y1: 0, y2: ih, visibility: 'hidden' }, g);
            const focusDot = el('circle', { class: 'series-dot', r: 6, visibility: 'hidden' }, g);
            el('rect', { class: 'hit', x: -m.left, y: -m.top, width: width, height: height }, g);

            let active = -1;
            function activate(i) {
                active = i;
                if (i < 0) {
                    cross.setAttribute('visibility', 'hidden');
                    focusDot.setAttribute('visibility', 'hidden');
                    tooltip.hidden = true;
                    return;
                }
                const c = coords[i];
                const x = Math.round(c[0]) + 0.5;
                cross.setAttribute('x1', x); cross.setAttribute('x2', x);
                cross.setAttribute('visibility', 'visible');
                focusDot.setAttribute('cx', c[0]); focusDot.setAttribute('cy', c[1]);
                focusDot.setAttribute('visibility', 'visible');
                showTooltip(tooltip, clampTooltipX(c[0] + m.left, width), c[1] + m.top,
                    opts.formatDate(points[i].date, true), opts.format(points[i].value));
            }
            function nearest(clientX) {
                const rect = svg.getBoundingClientRect();
                const x = (clientX - rect.left) * (width / rect.width) - m.left;
                let best = 0, dist = Infinity;
                coords.forEach(function (c, i) { const dd = Math.abs(c[0] - x); if (dd < dist) { dist = dd; best = i; } });
                return best;
            }
            svg.addEventListener('pointermove', function (e) { activate(nearest(e.clientX)); });
            svg.addEventListener('pointerdown', function (e) { activate(nearest(e.clientX)); });
            svg.addEventListener('pointerleave', function () { activate(-1); });
            svg.addEventListener('blur', function () { activate(-1); });
            svg.addEventListener('focus', function () { activate(points.length - 1); });
            svg.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowLeft') { activate(Math.max(0, active - 1)); e.preventDefault(); }
                else if (e.key === 'ArrowRight') { activate(Math.min(points.length - 1, active + 1)); e.preventDefault(); }
                else if (e.key === 'Home') { activate(0); e.preventDefault(); }
                else if (e.key === 'End') { activate(points.length - 1); e.preventDefault(); }
            });

            container.insertBefore(svg, container.firstChild);
            if (opts.animate && lineEl && !container._animated) {
                // Draw the line on once; later resizes render statically.
                const len = Math.ceil(lineEl.getTotalLength());
                lineEl.style.setProperty('--len', len);
                lineEl.classList.add('animate');
            }
            container._animated = true;
        });
    }

    /**
     * opts: {
     *   bars: [{ key, label, title, value }]
     *   format(value) → string
     *   highlight?: key of the bar drawn at full strength (others muted)
     *   label: string
     * }
     */
    function columns(container, opts) {
        mount(container, function (width, tooltip) {
            const bars = opts.bars;
            const height = opts.height || (width < 480 ? 200 : 240);
            const m = { top: 24, right: 8, bottom: 30, left: 48 };
            const iw = Math.max(10, width - m.left - m.right);
            const ih = height - m.top - m.bottom;
            const max = Math.max.apply(null, bars.map(function (b) { return b.value; }).concat([0]));
            const ticks = core.niceTicks(0, max || 1, 3);
            const yMax = ticks[ticks.length - 1];
            const band = iw / bars.length;
            const bw = Math.min(24, Math.max(4, band - 6));
            const yOf = function (v) { return ih - v / yMax * ih; };

            const svg = el('svg', {
                viewBox: '0 0 ' + width + ' ' + height,
                width: width, height: height,
                role: 'img', tabindex: '0',
                'aria-label': opts.label
            });
            const g = el('g', { transform: 'translate(' + m.left + ',' + m.top + ')' }, svg);
            const grid = el('g', { class: 'grid' }, g);
            ticks.forEach(function (t) {
                const y = Math.round(yOf(t)) + 0.5;
                if (t !== 0) el('line', { x1: 0, x2: iw, y1: y, y2: y }, grid);
                text(g, -10, y + 4, opts.format(t), { class: 'tick', 'text-anchor': 'end' });
            });

            const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(iw / 56)));
            const rects = [];
            bars.forEach(function (b, i) {
                const cx = band * i + band / 2;
                const h = b.value > 0 ? Math.max(2, ih - yOf(b.value)) : 0;
                const x = cx - bw / 2, y = ih - h, r = Math.min(4, h, bw / 2);
                if (h > 0) {
                    // Rounded data-end (top), square at the baseline.
                    const d = 'M' + x + ' ' + ih + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
                        'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) + 'V' + ih + 'Z';
                    const cls = 'series-bar' + (opts.highlight && opts.highlight !== b.key ? ' is-muted' : '') + (opts.animate && !container._animated ? ' animate' : '');
                    const bar = el('path', { class: cls, d: d }, g);
                    bar.style.setProperty('--i', i);
                    rects.push(bar);
                } else {
                    rects.push(null);
                }
                if (i % labelEvery === 0 || i === bars.length - 1) {
                    if (i === bars.length - 1 || bars.length - 1 - i >= labelEvery / 2) {
                        text(g, cx, ih + 20, b.label, { class: 'tick', 'text-anchor': 'middle' });
                    }
                }
            });
            el('line', { class: 'baseline', x1: 0, x2: iw, y1: ih + 0.5, y2: ih + 0.5 }, g);

            // Direct label: the highlighted (current) bar only.
            const hi = bars.findIndex(function (b) { return b.key === opts.highlight; });
            if (hi !== -1 && bars[hi].value > 0) {
                text(g, band * hi + band / 2, yOf(bars[hi].value) - 8, opts.format(bars[hi].value), { class: 'end-label', 'text-anchor': hi === bars.length - 1 ? 'end' : 'middle' });
            }

            let active = -1;
            function activate(i) {
                rects.forEach(function (r, k) {
                    if (r) r.style.opacity = i === -1 ? '' : (k === i ? '1' : '0.35');
                });
                active = i;
                if (i < 0) { tooltip.hidden = true; return; }
                const b = bars[i];
                showTooltip(tooltip, clampTooltipX(band * i + band / 2 + m.left, width), yOf(b.value) + m.top, b.title, opts.format(b.value));
            }
            bars.forEach(function (b, i) {
                const hit = el('rect', { class: 'hit', x: band * i, y: -m.top, width: band, height: ih + m.top + m.bottom }, g);
                hit.addEventListener('pointerenter', function () { activate(i); });
                hit.addEventListener('pointerdown', function () { activate(i); });
            });
            svg.addEventListener('pointerleave', function () { activate(-1); });
            svg.addEventListener('blur', function () { activate(-1); });
            svg.addEventListener('focus', function () { activate(bars.length - 1); });
            svg.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowLeft') { activate(Math.max(0, active - 1)); e.preventDefault(); }
                else if (e.key === 'ArrowRight') { activate(Math.min(bars.length - 1, active + 1)); e.preventDefault(); }
            });

            container.insertBefore(svg, container.firstChild);
            container._animated = true;
        });
    }

    root.MapsCharts = { line: line, columns: columns };
})(typeof self !== 'undefined' ? self : this);
