/*
 * MAPS Performance Tracker — core logic.
 *
 * Pure functions only (no DOM): dates, units, storage schema & migration,
 * statistics, personal records, import/export. Loaded as a classic script in
 * the browser (window.MapsCore) and via require() in the unit tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MapsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SCHEMA_VERSION = 2;
    const KEYS = {
        data: 'maps.v2',
        draft: 'maps.v2.draft',
        backup: 'maps.v2.corrupt-backup',
        legacyLogs: 'maps_logs',
        legacySchedule: 'workout_schedule',
        legacyTheme: 'theme'
    };
    const KG_PER_LB = 0.45359237;
    const DAY_MS = 86400000;

    const DEFAULT_SETTINGS = Object.freeze({
        theme: 'dark',        // 'system' | 'light' | 'dark' — dark by default: easier on the eyes under gym lights
        unit: 'kg',           // 'kg' | 'lb'
        autoRest: true,       // start the rest timer when a set is ticked
        sound: true,
        vibrate: true,
        weeklyGoal: 3,
        restOverrides: {}     // { [phaseId]: seconds }
    });

    /* ------------------------------------------------------------------ *
     * Dates — every workout date is a local calendar day 'YYYY-MM-DD'.
     * Working with plain strings avoids the UTC/local drift that plagued v1.
     * ------------------------------------------------------------------ */

    const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

    function pad2(n) { return String(n).padStart(2, '0'); }

    function toISODate(date) {
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function isISODate(str) {
        const m = typeof str === 'string' && ISO_DATE_RE.exec(str);
        if (!m) return false;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
    }

    /** Local-midnight Date for an ISO date string, or null. */
    function parseISODate(str) {
        if (!isISODate(str)) return null;
        const m = ISO_DATE_RE.exec(str);
        return new Date(+m[1], +m[2] - 1, +m[3]);
    }

    function todayISO(now) { return toISODate(now || new Date()); }

    /** Day number since epoch for an ISO date — DST-proof arithmetic. */
    function dayIndex(iso) {
        const m = ISO_DATE_RE.exec(iso);
        return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
    }

    function fromDayIndex(idx) {
        const d = new Date(idx * DAY_MS);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }

    function addDays(iso, n) { return fromDayIndex(dayIndex(iso) + n); }

    function daysBetween(fromIso, toIso) { return dayIndex(toIso) - dayIndex(fromIso); }

    /** Monday of the ISO week containing `iso`. */
    function startOfWeek(iso) {
        const idx = dayIndex(iso);
        // 1970-01-01 was a Thursday → (idx + 3) % 7 gives 0 for Monday.
        const weekday = ((idx + 3) % 7 + 7) % 7;
        return fromDayIndex(idx - weekday);
    }

    /**
     * v1 stored `workoutDate` as `localDate.toISOString()`. The instant is correct,
     * so converting it back with *local* getters recovers the calendar day the
     * user picked — in every timezone, including evening sessions in UTC−6 that
     * the old `split('T')[0]` approach pushed onto the next day.
     */
    function legacyInstantToISODate(value) {
        if (typeof value === 'string' && isISODate(value)) return value;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : toISODate(d);
    }

    /* ------------------------------------------------------------------ *
     * Numbers & units
     * ------------------------------------------------------------------ */

    /** Parse user input ("82,5", " 100 ", 90) → finite number ≥ 0, or null. */
    function parseNumber(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return isFinite(value) && value >= 0 ? value : null;
        const s = String(value).trim().replace(',', '.');
        if (s === '' || !/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
        const n = parseFloat(s);
        return isFinite(n) && n >= 0 ? n : null;
    }

    function toKg(value, unit) {
        if (value === null || value === undefined) return null;
        return unit === 'lb' ? value * KG_PER_LB : value;
    }

    function fromKg(kg, unit) {
        if (kg === null || kg === undefined) return null;
        return unit === 'lb' ? kg / KG_PER_LB : kg;
    }

    function round(value, decimals) {
        const f = Math.pow(10, decimals);
        return Math.round(value * f) / f;
    }

    /** Display-ready weight number in `unit` (max one decimal, no trailing ".0"). */
    function displayWeight(kg, unit) {
        if (kg === null || kg === undefined) return '';
        return String(round(fromKg(kg, unit), 1));
    }

    /* ------------------------------------------------------------------ *
     * Session model
     * ------------------------------------------------------------------ */

    let idCounter = 0;
    function createId(now) {
        idCounter = (idCounter + 1) % 1679616;
        return 's_' + (now || Date.now()).toString(36) + '_' +
            Math.random().toString(36).slice(2, 7) + idCounter.toString(36);
    }

    function normalizeSet(raw, index) {
        raw = raw || {};
        return {
            set: Number.isInteger(raw.set) ? raw.set : index + 1,
            weight: parseNumber(raw.weight),   // kg
            reps: parseNumber(raw.reps),
            done: !!raw.done
        };
    }

    function normalizeExercise(raw) {
        raw = raw || {};
        const ex = {
            name: String(raw.name || '').trim(),
            target: raw.target === undefined || raw.target === null ? '' : String(raw.target),
            sets: Array.isArray(raw.sets)
                ? raw.sets.map(normalizeSet).filter(function (s) { return s.weight !== null || s.reps !== null || s.done; })
                : []
        };
        if (raw.completed !== undefined) ex.completed = !!raw.completed;
        if (raw.note) ex.note = String(raw.note);
        return ex;
    }

    /**
     * Normalise a session from either schema:
     *  v1: { timestamp, workoutDate (ISO instant), day (name), phase, exercises, notes, ... }
     *  v2: { id, date (YYYY-MM-DD), createdAt, phase, dayId, dayName, exercises, notes }
     * Returns null for entries that cannot be salvaged.
     */
    function normalizeSession(raw, program) {
        if (!raw || typeof raw !== 'object' || typeof raw.phase !== 'string') return null;

        const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt
            : Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now();

        let date = isISODate(raw.date) ? raw.date : null;
        if (!date && raw.workoutDate) date = legacyInstantToISODate(raw.workoutDate);
        if (!date) date = toISODate(new Date(createdAt));

        const dayName = String(raw.dayName || raw.day || '');
        let dayId = typeof raw.dayId === 'string' ? raw.dayId : null;
        if (!dayId && program && program.findDayIdByName) dayId = program.findDayIdByName(raw.phase, dayName);

        return {
            id: typeof raw.id === 'string' && raw.id ? raw.id : createId(createdAt),
            date: date,
            createdAt: createdAt,
            phase: raw.phase,
            dayId: dayId,
            dayName: dayName,
            exercises: Array.isArray(raw.exercises)
                ? raw.exercises.map(normalizeExercise).filter(function (e) { return e.name; })
                : [],
            notes: raw.notes ? String(raw.notes) : ''
        };
    }

    /** Newest workout first; same-day ties broken by save time. */
    function compareSessionsDesc(a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.createdAt - a.createdAt;
    }

    function sortSessions(sessions) { return sessions.slice().sort(compareSessionsDesc); }

    function normalizeSchedule(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') return out;
        Object.keys(raw).forEach(function (k) {
            if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(k) && isISODate(raw[k])) out[k] = raw[k];
        });
        return out;
    }

    function normalizeSettings(raw) {
        const s = Object.assign({}, DEFAULT_SETTINGS, { restOverrides: {} });
        if (!raw || typeof raw !== 'object') return s;
        if (['system', 'light', 'dark'].indexOf(raw.theme) !== -1) s.theme = raw.theme;
        if (raw.unit === 'kg' || raw.unit === 'lb') s.unit = raw.unit;
        ['autoRest', 'sound', 'vibrate'].forEach(function (k) {
            if (typeof raw[k] === 'boolean') s[k] = raw[k];
        });
        const goal = parseNumber(raw.weeklyGoal);
        if (goal !== null && goal >= 1 && goal <= 14) s.weeklyGoal = Math.round(goal);
        if (raw.restOverrides && typeof raw.restOverrides === 'object') {
            Object.keys(raw.restOverrides).forEach(function (k) {
                const v = parseNumber(raw.restOverrides[k]);
                if (v !== null && v <= 3600) s.restOverrides[k] = Math.round(v);
            });
        }
        return s;
    }

    function emptyState() {
        return { version: SCHEMA_VERSION, sessions: [], schedule: {}, settings: normalizeSettings(null) };
    }

    /* ------------------------------------------------------------------ *
     * Storage — `storage` is any Web Storage–like object (localStorage).
     * ------------------------------------------------------------------ */

    function readJSON(storage, key) {
        const raw = storage.getItem(key);
        if (raw === null) return { ok: true, value: null };
        try { return { ok: true, value: JSON.parse(raw) }; }
        catch (e) { return { ok: false, raw: raw }; }
    }

    function hydrate(data, program) {
        const state = emptyState();
        if (!data || typeof data !== 'object') return state;
        state.sessions = sortSessions((Array.isArray(data.sessions) ? data.sessions : [])
            .map(function (s) { return normalizeSession(s, program); })
            .filter(Boolean));
        state.schedule = normalizeSchedule(data.schedule);
        state.settings = normalizeSettings(data.settings);
        return state;
    }

    /**
     * Load app state, migrating v1 keys on first run. v1 keys are left in place
     * as an untouched backup. Returns { state, migrated, recovered }.
     */
    function loadState(storage, program) {
        const current = readJSON(storage, KEYS.data);
        if (current.ok && current.value) {
            return { state: hydrate(current.value, program), migrated: false, recovered: false };
        }
        const recovered = !current.ok;
        let parked = true;
        if (recovered) {
            // Never silently drop unreadable data: park it for manual recovery.
            try { parked = storage.setItem(KEYS.backup, current.raw) !== false; } catch (e) { parked = false; }
        }

        const state = emptyState();
        let migrated = false;

        const logs = readJSON(storage, KEYS.legacyLogs);
        if (logs.ok && Array.isArray(logs.value)) {
            state.sessions = sortSessions(logs.value
                .map(function (s) { return normalizeSession(s, program); })
                .filter(Boolean));
            migrated = migrated || state.sessions.length > 0;
        }
        const schedule = readJSON(storage, KEYS.legacySchedule);
        if (schedule.ok && schedule.value) {
            state.schedule = normalizeSchedule(schedule.value);
            migrated = migrated || Object.keys(state.schedule).length > 0;
        }
        const theme = storage.getItem(KEYS.legacyTheme);
        if (theme === 'light' || theme === 'dark') state.settings.theme = theme;

        // If the unreadable data couldn't be copied aside, leave it untouched.
        if (parked) saveState(storage, state);
        return { state: state, migrated: migrated, recovered: recovered };
    }

    /** Returns whatever storage.setItem returns (false = refused by the app's safe wrapper). */
    function saveState(storage, state) {
        return storage.setItem(KEYS.data, JSON.stringify({
            version: SCHEMA_VERSION,
            sessions: state.sessions,
            schedule: state.schedule,
            settings: state.settings
        }));
    }

    /* ------------------------------------------------------------------ *
     * Metrics
     * ------------------------------------------------------------------ */

    /** Epley estimated one-rep max. */
    function estimate1RM(weight, reps) {
        if (!(weight > 0) || !(reps > 0)) return 0;
        if (reps === 1) return weight;
        return weight * (30 + reps) / 30;
    }

    function setVolume(set) {
        return set.weight > 0 && set.reps > 0 ? set.weight * set.reps : 0;
    }

    function exerciseHasData(ex) {
        return ex.sets.length > 0 || ex.completed === true || !!ex.note;
    }

    function summarizeSession(session) {
        let sets = 0, done = 0, volume = 0, maxWeight = 0, exercises = 0;
        session.exercises.forEach(function (ex) {
            if (exerciseHasData(ex)) exercises++;
            ex.sets.forEach(function (s) {
                sets++;
                if (s.done) done++;
                volume += setVolume(s);
                if (s.weight > maxWeight) maxWeight = s.weight;
            });
        });
        return { exercises: exercises, sets: sets, doneSets: done, volume: volume, maxWeight: maxWeight };
    }

    function bestOf(ex, metric) {
        let best = 0;
        ex.sets.forEach(function (s) {
            let v = 0;
            if (metric === 'max') v = s.weight || 0;
            else if (metric === 'e1rm') v = estimate1RM(s.weight, s.reps);
            else if (metric === 'volume') { best += setVolume(s); return; }
            if (v > best) best = v;
        });
        return best;
    }

    /**
     * Chronological series for one exercise.
     * metric: 'max' (heaviest set), 'e1rm' (best estimated 1RM), 'volume' (Σ weight×reps).
     * Several sessions on the same date collapse into one point (max, or summed volume).
     */
    function exerciseSeries(sessions, name, metric) {
        const byDate = {};
        sessions.forEach(function (session) {
            session.exercises.forEach(function (ex) {
                if (ex.name !== name) return;
                const v = bestOf(ex, metric);
                if (!(v > 0)) return;
                if (byDate[session.date] === undefined) byDate[session.date] = v;
                else byDate[session.date] = metric === 'volume' ? byDate[session.date] + v : Math.max(byDate[session.date], v);
            });
        });
        return Object.keys(byDate).sort().map(function (date) { return { date: date, value: byDate[date] }; });
    }

    /** Exercise names that have at least one weighted set, most-logged first. */
    function weightedExercises(sessions) {
        const count = {};
        sessions.forEach(function (session) {
            session.exercises.forEach(function (ex) {
                if (ex.sets.some(function (s) { return s.weight > 0; })) count[ex.name] = (count[ex.name] || 0) + 1;
            });
        });
        return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); });
    }

    /** Best weight and best e1RM per exercise. */
    function personalRecords(sessions) {
        const prs = {};
        sortSessions(sessions).reverse().forEach(function (session) {
            session.exercises.forEach(function (ex) {
                ex.sets.forEach(function (s) {
                    if (!(s.weight > 0)) return;
                    const pr = prs[ex.name] || (prs[ex.name] = { name: ex.name, weight: 0, reps: null, date: null, e1rm: 0, e1rmDate: null });
                    if (s.weight > pr.weight || (s.weight === pr.weight && (s.reps || 0) > (pr.reps || 0))) {
                        pr.weight = s.weight; pr.reps = s.reps; pr.date = session.date;
                    }
                    const e = estimate1RM(s.weight, s.reps);
                    if (e > pr.e1rm) { pr.e1rm = e; pr.e1rmDate = session.date; }
                });
            });
        });
        return Object.keys(prs).map(function (k) { return prs[k]; })
            .sort(function (a, b) { return b.e1rm - a.e1rm || a.name.localeCompare(b.name); });
    }

    // Weights entered in lb are stored as kg; ignore sub-50 g differences from unit round-trips.
    const PR_EPSILON_KG = 0.05;

    /** PRs that `session` sets relative to `previous` (all other sessions). */
    function detectNewRecords(previous, session) {
        const before = {};
        personalRecords(previous).forEach(function (pr) { before[pr.name] = pr; });
        const out = [];
        session.exercises.forEach(function (ex) {
            const best = { weight: 0, e1rm: 0 };
            ex.sets.forEach(function (s) {
                if (s.weight > best.weight) best.weight = s.weight;
                const e = estimate1RM(s.weight, s.reps);
                if (e > best.e1rm) best.e1rm = e;
            });
            const prev = before[ex.name];
            if (!prev || !(best.weight > 0)) return; // first time logging isn't a "record"
            if (best.weight > prev.weight + PR_EPSILON_KG) out.push({ name: ex.name, type: 'weight', value: best.weight, previous: prev.weight });
            else if (best.e1rm > prev.e1rm + PR_EPSILON_KG) out.push({ name: ex.name, type: 'e1rm', value: best.e1rm, previous: prev.e1rm });
        });
        return out;
    }

    /** Last N ISO weeks (oldest first) with total volume and session count. */
    function weeklyVolume(sessions, weeks, today) {
        const current = startOfWeek(today);
        const buckets = [];
        const index = {};
        for (let i = weeks - 1; i >= 0; i--) {
            const start = addDays(current, -7 * i);
            index[start] = buckets.length;
            buckets.push({ weekStart: start, volume: 0, sessions: 0 });
        }
        sessions.forEach(function (s) {
            const i = index[startOfWeek(s.date)];
            if (i === undefined) return;
            buckets[i].sessions++;
            buckets[i].volume += summarizeSession(s).volume;
        });
        return buckets;
    }

    /** Headline numbers for the dashboard. `sessions` must be sorted (newest first). */
    function computeStats(sessions, today, weeklyGoal) {
        const goal = weeklyGoal || DEFAULT_SETTINGS.weeklyGoal;
        const thisWeekStart = startOfWeek(today);
        const training = sessions.filter(function (s) { return s.phase !== 'MOB'; });

        const weeks = {};
        sessions.forEach(function (s) { weeks[startOfWeek(s.date)] = (weeks[startOfWeek(s.date)] || 0) + 1; });

        // A streak counts consecutive weeks with ≥1 session; an empty current
        // week doesn't break it until the week is over.
        let streak = 0;
        let cursor = weeks[thisWeekStart] ? thisWeekStart : addDays(thisWeekStart, -7);
        while (weeks[cursor]) { streak++; cursor = addDays(cursor, -7); }

        const last = sessions[0] || null;
        const first = sessions.length ? sessions[sessions.length - 1] : null;
        const since30 = addDays(today, -29);
        let volume30 = 0;
        sessions.forEach(function (s) {
            if (s.date >= since30 && s.date <= today) volume30 += summarizeSession(s).volume;
        });

        return {
            total: sessions.length,
            trainingTotal: training.length,
            thisWeek: weeks[thisWeekStart] || 0,
            weeklyGoal: goal,
            weekStreak: streak,
            last: last,
            daysSinceLast: last ? daysBetween(last.date, today) : null,
            programWeek: first ? Math.max(1, Math.floor(daysBetween(startOfWeek(first.date), today) / 7) + 1) : null,
            currentPhase: training.length ? training[0].phase : (last ? last.phase : null),
            volume30: volume30
        };
    }

    /** Most recent session for the same phase/day. */
    function previousSessionFor(sessions, phase, dayId) {
        for (let i = 0; i < sessions.length; i++) {
            if (sessions[i].phase === phase && sessions[i].dayId === dayId) return sessions[i];
        }
        return null;
    }

    /** Most recent logged sets for an exercise, keyed by set number. */
    function lastPerformance(sessions, name) {
        for (let i = 0; i < sessions.length; i++) {
            const ex = sessions[i].exercises.find(function (e) { return e.name === name && e.sets.length; });
            if (ex) {
                const bySet = {};
                ex.sets.forEach(function (s) { bySet[s.set] = s; });
                return { date: sessions[i].date, sets: bySet };
            }
        }
        return null;
    }

    /** Suggest the next day in rotation after the most recent one done in a phase. */
    function nextDayInRotation(sessions, phase) {
        const last = sessions.find(function (s) { return s.phase === phase.id && s.dayId; });
        if (!last) return phase.days[0].id;
        const idx = phase.days.findIndex(function (d) { return d.id === last.dayId; });
        return phase.days[(idx + 1) % phase.days.length].id;
    }

    /* ------------------------------------------------------------------ *
     * Charts helpers
     * ------------------------------------------------------------------ */

    /** "Nice" axis ticks covering [min, max] with ~count steps. */
    function niceTicks(min, max, count) {
        count = count || 4;
        if (!isFinite(min) || !isFinite(max)) return [0, 1];
        if (min === max) {
            const pad = Math.abs(min) * 0.1 || 1;
            min -= pad; max += pad;
        }
        const span = max - min;
        const rawStep = span / count;
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const norm = rawStep / mag;
        const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
        const start = Math.floor(min / step) * step;
        const end = Math.ceil(max / step) * step;
        const ticks = [];
        for (let v = start; v <= end + step / 2; v += step) ticks.push(round(v, 10));
        return ticks;
    }

    /* ------------------------------------------------------------------ *
     * Import / export
     * ------------------------------------------------------------------ */

    const APP_ID = 'maps-performance-tracker';

    function exportBackup(state, now) {
        return {
            app: APP_ID,
            version: SCHEMA_VERSION,
            exportedAt: new Date(now || Date.now()).toISOString(),
            sessions: state.sessions,
            schedule: state.schedule,
            settings: state.settings
        };
    }

    /**
     * Parse a backup: a v2 export, or a raw v1 `maps_logs` array.
     * Throws Error with a user-facing (Spanish) message on invalid input.
     */
    function parseBackup(text, program) {
        let data;
        try { data = JSON.parse(text); }
        catch (e) { throw new Error('El archivo no es un JSON válido.'); }

        let rawSessions, schedule = {}, settings = null;
        if (Array.isArray(data)) {
            rawSessions = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.sessions)) {
            rawSessions = data.sessions;
            schedule = normalizeSchedule(data.schedule);
            settings = data.settings ? normalizeSettings(data.settings) : null;
        } else {
            throw new Error('No se reconoce el formato del respaldo.');
        }
        const sessions = rawSessions.map(function (s) { return normalizeSession(s, program); }).filter(Boolean);
        if (rawSessions.length && !sessions.length) throw new Error('El respaldo no contiene sesiones válidas.');
        return { sessions: sessions, schedule: schedule, settings: settings };
    }

    function sessionFingerprint(s) {
        return s.date + '|' + s.phase + '|' + (s.dayId || s.dayName) + '|' + s.createdAt;
    }

    /** Merge imported sessions, skipping duplicates by id or fingerprint. */
    function mergeSessions(existing, incoming) {
        const ids = {}, prints = {};
        existing.forEach(function (s) { ids[s.id] = true; prints[sessionFingerprint(s)] = true; });
        let added = 0;
        const merged = existing.slice();
        incoming.forEach(function (s) {
            if (ids[s.id] || prints[sessionFingerprint(s)]) return;
            ids[s.id] = true; prints[sessionFingerprint(s)] = true;
            merged.push(s); added++;
        });
        return { sessions: sortSessions(merged), added: added, skipped: incoming.length - added };
    }

    function csvCell(value) {
        let s = value === null || value === undefined ? '' : String(value);
        // Neutralise spreadsheet formula injection.
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    /** One row per logged set (or per mobility exercise). Weights in `unit`. */
    function toCSV(sessions, unit, program) {
        const rows = [['fecha', 'fase', 'dia', 'ejercicio', 'set', 'peso', 'unidad', 'reps', 'completado', 'nota']];
        sortSessions(sessions).reverse().forEach(function (s) {
            const phase = program && program.getPhase ? program.getPhase(s.phase) : null;
            const phaseLabel = phase ? phase.label : s.phase;
            s.exercises.forEach(function (ex) {
                if (ex.sets.length) {
                    ex.sets.forEach(function (set) {
                        rows.push([s.date, phaseLabel, s.dayName, ex.name, set.set,
                            set.weight === null ? '' : round(fromKg(set.weight, unit), 2), unit,
                            set.reps === null ? '' : set.reps, set.done ? 'si' : 'no', '']);
                    });
                } else if (exerciseHasData(ex)) {
                    rows.push([s.date, phaseLabel, s.dayName, ex.name, '', '', '', '', ex.completed ? 'si' : 'no', ex.note || '']);
                }
            });
            if (s.notes) rows.push([s.date, phaseLabel, s.dayName, '(notas de la sesión)', '', '', '', '', '', s.notes]);
        });
        return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    }

    /* ------------------------------------------------------------------ *
     * Misc
     * ------------------------------------------------------------------ */

    const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function escapeHTML(value) {
        return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
    }

    /** Only allow http(s) links into href attributes. */
    function safeUrl(url) {
        return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
    }

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        KEYS: KEYS,
        KG_PER_LB: KG_PER_LB,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        // dates
        toISODate: toISODate,
        isISODate: isISODate,
        parseISODate: parseISODate,
        todayISO: todayISO,
        addDays: addDays,
        daysBetween: daysBetween,
        startOfWeek: startOfWeek,
        legacyInstantToISODate: legacyInstantToISODate,
        // numbers
        parseNumber: parseNumber,
        toKg: toKg,
        fromKg: fromKg,
        round: round,
        displayWeight: displayWeight,
        // model
        createId: createId,
        normalizeSession: normalizeSession,
        normalizeSettings: normalizeSettings,
        normalizeSchedule: normalizeSchedule,
        sortSessions: sortSessions,
        emptyState: emptyState,
        loadState: loadState,
        saveState: saveState,
        // metrics
        estimate1RM: estimate1RM,
        summarizeSession: summarizeSession,
        exerciseHasData: exerciseHasData,
        exerciseSeries: exerciseSeries,
        weightedExercises: weightedExercises,
        personalRecords: personalRecords,
        detectNewRecords: detectNewRecords,
        weeklyVolume: weeklyVolume,
        computeStats: computeStats,
        previousSessionFor: previousSessionFor,
        lastPerformance: lastPerformance,
        nextDayInRotation: nextDayInRotation,
        niceTicks: niceTicks,
        // io
        exportBackup: exportBackup,
        parseBackup: parseBackup,
        mergeSessions: mergeSessions,
        toCSV: toCSV,
        // misc
        escapeHTML: escapeHTML,
        safeUrl: safeUrl
    };
});
