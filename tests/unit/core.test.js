'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../assets/js/core.js');
const program = require('../../assets/js/program.js');

function memoryStorage(initial) {
    const map = new Map(Object.entries(initial || {}));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        dump: () => Object.fromEntries(map)
    };
}

function session(date, phase, dayId, exercises, extra) {
    return core.normalizeSession(Object.assign({
        date, phase, dayId, dayName: dayId, createdAt: Date.parse(date + 'T12:00:00Z'), exercises
    }, extra), program);
}

test('dates: ISO helpers are local-calendar based and DST-proof', () => {
    assert.equal(core.toISODate(new Date(2026, 0, 5)), '2026-01-05');
    assert.ok(core.isISODate('2024-02-29'));
    assert.ok(!core.isISODate('2026-02-29'));
    assert.ok(!core.isISODate('6/10/2026'));
    assert.equal(core.addDays('2026-03-07', 2), '2026-03-09');
    assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(core.daysBetween('2026-10-01', '2026-10-06'), 5);
    assert.equal(core.startOfWeek('2026-10-06'), '2026-10-05'); // Tue → Mon
    assert.equal(core.startOfWeek('2026-10-11'), '2026-10-05'); // Sun → Mon
    assert.equal(core.startOfWeek('2026-10-05'), '2026-10-05');
});

test('dates: legacy instants recover the local day (v1 timezone bug)', () => {
    // An evening workout in Mexico (UTC−6): 19:30 local = 01:30Z next day.
    // v1 used split("T")[0] → wrong day. Local getters recover the right one.
    const local = new Date(2026, 9, 6, 19, 30);
    assert.equal(core.legacyInstantToISODate(local.toISOString()), '2026-10-06');
    const midnight = new Date(2026, 9, 6);
    assert.equal(core.legacyInstantToISODate(midnight.toISOString()), '2026-10-06');
    assert.equal(core.legacyInstantToISODate('2026-10-06'), '2026-10-06');
    assert.equal(core.legacyInstantToISODate('garbage'), null);
});

test('numbers: parse user input incl. decimal comma, reject junk', () => {
    assert.equal(core.parseNumber('82,5'), 82.5);
    assert.equal(core.parseNumber(' 100 '), 100);
    assert.equal(core.parseNumber(''), null);
    assert.equal(core.parseNumber('-5'), null);
    assert.equal(core.parseNumber('1e3'), null);
    assert.equal(core.parseNumber('abc'), null);
    assert.equal(core.parseNumber(42), 42);
});

test('units: kg ↔ lb round-trips', () => {
    const kg = core.toKg(225, 'lb');
    assert.equal(core.displayWeight(kg, 'lb'), '225');
    assert.equal(core.displayWeight(100, 'kg'), '100');
    assert.equal(core.displayWeight(100, 'lb'), '220.5');
    assert.equal(core.displayWeight(null, 'kg'), '');
});

test('migration: v1 logs, schedule and theme are migrated; legacy keys kept', () => {
    const evening = new Date(2026, 9, 6, 19, 30);
    const legacy = [{
        timestamp: evening.getTime(),
        workoutDate: evening.toISOString(),
        date: '6/10/2026',
        phase: 'P1',
        phaseName: 'Phase I',
        day: 'Día 2',
        exercises: [
            { name: 'Phase 1 Deadlift', target: '6', sets: [{ set: 1, weight: '140', reps: '6', done: true }, { set: 2, weight: '', reps: '', done: false }] },
            { name: 'Walking Lunges', target: '20', sets: [] }
        ],
        notes: 'Buena sesión'
    }];
    const storage = memoryStorage({
        maps_logs: JSON.stringify(legacy),
        workout_schedule: JSON.stringify({ 'P1-D1': '2026-10-08', bogus: 'x' }),
        theme: 'light'
    });
    const { state, migrated } = core.loadState(storage, program);
    assert.ok(migrated);
    assert.equal(state.sessions.length, 1);
    const s = state.sessions[0];
    assert.equal(s.date, '2026-10-06');
    assert.equal(s.dayId, 'D2');
    assert.equal(s.dayName, 'Día 2');
    assert.deepEqual(s.exercises[0].sets, [{ set: 1, weight: 140, reps: 6, done: true }]);
    assert.deepEqual(state.schedule, { 'P1-D1': '2026-10-08' });
    assert.equal(state.settings.theme, 'light');
    assert.ok(storage.getItem('maps_logs'), 'legacy key must be preserved as backup');
    // Second load reads v2 and does not re-migrate.
    const again = core.loadState(storage, program);
    assert.equal(again.migrated, false);
    assert.equal(again.state.sessions[0].id, s.id);
});

test('migration: corrupt v2 data is parked, not destroyed', () => {
    const storage = memoryStorage({ 'maps.v2': '{not json' });
    const { state, recovered } = core.loadState(storage, program);
    assert.ok(recovered);
    assert.equal(state.sessions.length, 0);
    assert.equal(storage.getItem(core.KEYS.backup), '{not json');
});

test('metrics: e1RM, summaries and series', () => {
    assert.equal(core.estimate1RM(100, 1), 100);
    assert.equal(core.estimate1RM(100, 3), 110);
    assert.equal(core.estimate1RM(0, 5), 0);

    const a = session('2026-09-01', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 100, reps: 3, done: true }, { weight: 105, reps: 3 }] }]);
    const b = session('2026-09-08', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 110, reps: 2 }] }]);
    const c = session('2026-09-08', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 90, reps: 5 }] }]);
    const sum = core.summarizeSession(a);
    assert.deepEqual(sum, { exercises: 1, sets: 2, doneSets: 1, volume: 615, maxWeight: 105 });

    const all = core.sortSessions([a, b, c]);
    assert.deepEqual(core.exerciseSeries(all, 'Phase 1 Squat', 'max'), [
        { date: '2026-09-01', value: 105 }, { date: '2026-09-08', value: 110 }
    ]);
    assert.deepEqual(core.exerciseSeries(all, 'Phase 1 Squat', 'volume').map(p => p.value), [615, 670]);
    assert.deepEqual(core.weightedExercises(all), ['Phase 1 Squat']);
});

test('records: personal records and new-PR detection', () => {
    const a = session('2026-09-01', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 100, reps: 3 }] }]);
    const b = session('2026-09-08', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 100, reps: 5 }] }]);
    const c = session('2026-09-15', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 120, reps: 1 }] }, { name: 'High Pull', sets: [{ weight: 60, reps: 3 }] }]);
    const prs = core.personalRecords([a, b]);
    assert.equal(prs[0].weight, 100);
    assert.equal(prs[0].reps, 5);
    assert.equal(prs[0].date, '2026-09-08');

    assert.deepEqual(core.detectNewRecords([a], b).map(r => r.type), ['e1rm']);
    const fresh = core.detectNewRecords([a, b], c);
    assert.equal(fresh.length, 1, 'first-ever exercise is not a record');
    assert.equal(fresh[0].type, 'weight');
    assert.equal(fresh[0].value, 120);
});

test('stats: weekly count, streak, program week, last session', () => {
    const today = '2026-10-07'; // Wednesday
    const sessions = core.sortSessions([
        session('2026-10-06', 'P1', 'D2', []),
        session('2026-10-05', 'P1', 'D1', []),
        session('2026-09-30', 'P1', 'D3', []),
        session('2026-09-23', 'MOB', 'S1', []),
        session('2026-09-08', 'P1', 'D1', [])
    ]);
    const st = core.computeStats(sessions, today, 3);
    assert.equal(st.total, 5);
    assert.equal(st.thisWeek, 2);
    assert.equal(st.weekStreak, 3); // weeks of 10-05, 09-28, 09-21 (09-14 empty)
    assert.equal(st.daysSinceLast, 1);
    assert.equal(st.programWeek, 5);
    assert.equal(st.currentPhase, 'P1');

    // Empty current week does not break the streak yet.
    const st2 = core.computeStats(sessions, '2026-10-12', 3);
    assert.equal(st2.thisWeek, 0);
    assert.equal(st2.weekStreak, 3);
});

test('weekly volume buckets', () => {
    const sessions = [
        session('2026-10-06', 'P1', 'D1', [{ name: 'X', sets: [{ weight: 10, reps: 10 }] }]),
        session('2026-09-29', 'P1', 'D1', [{ name: 'X', sets: [{ weight: 20, reps: 10 }] }]),
        session('2025-01-01', 'P1', 'D1', [{ name: 'X', sets: [{ weight: 20, reps: 10 }] }])
    ];
    const weeks = core.weeklyVolume(sessions, 3, '2026-10-07');
    assert.deepEqual(weeks.map(w => w.weekStart), ['2026-09-21', '2026-09-28', '2026-10-05']);
    assert.deepEqual(weeks.map(w => w.volume), [0, 200, 100]);
});

test('rotation and last performance helpers', () => {
    const p1 = program.getPhase('P1');
    assert.equal(core.nextDayInRotation([], p1), 'D1');
    const sessions = core.sortSessions([
        session('2026-10-01', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ set: 1, weight: 100, reps: 3 }] }]),
        session('2026-10-03', 'P1', 'D3', [])
    ]);
    assert.equal(core.nextDayInRotation(sessions, p1), 'D1');
    const last = core.lastPerformance(sessions, 'Phase 1 Squat');
    assert.equal(last.date, '2026-10-01');
    assert.equal(last.sets[1].weight, 100);
    assert.equal(core.previousSessionFor(sessions, 'P1', 'D3').date, '2026-10-03');
});

test('backup: export → parse → merge is lossless and de-duplicates', () => {
    const state = core.emptyState();
    state.sessions = [session('2026-10-01', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 100, reps: 3 }] }])];
    const text = JSON.stringify(core.exportBackup(state));
    const parsed = core.parseBackup(text, program);
    assert.equal(parsed.sessions.length, 1);
    const merged = core.mergeSessions(state.sessions, parsed.sessions);
    assert.equal(merged.added, 0);
    assert.equal(merged.skipped, 1);

    // Legacy raw array is accepted too.
    const legacy = core.parseBackup(JSON.stringify([{ timestamp: 1, workoutDate: '2026-10-01T06:00:00.000Z', phase: 'P1', day: 'Día 1', exercises: [] }]), program);
    assert.equal(legacy.sessions[0].dayId, 'D1');

    assert.throws(() => core.parseBackup('nope', program), /JSON válido/);
    assert.throws(() => core.parseBackup('{"foo":1}', program), /formato/);
});

test('csv: escapes, neutralises formulas, converts units', () => {
    const s = session('2026-10-01', 'P1', 'D1', [{ name: 'Phase 1 Squat', sets: [{ weight: 100, reps: 3, done: true }] }], { notes: '=HYPERLINK("x"), "hola"' });
    const csv = core.toCSV([s], 'lb', program);
    const lines = csv.trim().split('\r\n');
    assert.equal(lines[0], 'fecha,fase,dia,ejercicio,set,peso,unidad,reps,completado,nota');
    assert.equal(lines[1], '2026-10-01,Fase I,D1,Phase 1 Squat,1,220.46,lb,3,si,');
    assert.ok(lines[2].endsWith('"\'=HYPERLINK(""x""), ""hola"""'));
});

test('niceTicks and escaping', () => {
    assert.deepEqual(core.niceTicks(0, 100, 4), [0, 50, 100]);
    const t = core.niceTicks(87, 143, 4);
    assert.ok(t[0] <= 87 && t[t.length - 1] >= 143);
    assert.ok(t.length >= 3 && t.length <= 8);
    assert.deepEqual(core.niceTicks(50, 50, 4).length > 1, true);
    assert.equal(core.escapeHTML('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
    assert.equal(core.safeUrl('javascript:alert(1)'), null);
    assert.equal(core.safeUrl('https://x.com'), 'https://x.com');
});
