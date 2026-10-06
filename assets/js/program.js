/*
 * MAPS Performance Blueprint — program definition.
 *
 * Edit this file to customise exercises or demo-video links.
 * `exerciseLinks` maps an exercise name to the URL opened by its "Demo" button;
 * an exercise without an entry simply has no demo button.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MapsProgram = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_LINK = 'https://www.mindpumpmedia.com/maps-performance';

    const exerciseLinks = {
        // Phase I
        'Phase 1 Squat': DEFAULT_LINK,
        'Phase 1 Bench Press': DEFAULT_LINK,
        'High Pull': DEFAULT_LINK,
        'Weighted/BW Pull-ups': DEFAULT_LINK,
        'Overhead Press (Push Press)': DEFAULT_LINK,
        'MAPS Side Chop': DEFAULT_LINK,
        'Phase 1 Deadlift': DEFAULT_LINK,
        'Walking Lunges': DEFAULT_LINK,
        'Weighted Dips': DEFAULT_LINK,
        'MAPS Strength Row': DEFAULT_LINK,
        '1-Arm KB Shoulder Press': DEFAULT_LINK,
        'Downward Chop': DEFAULT_LINK,
        'Front Squat': DEFAULT_LINK,
        'Incline Press': DEFAULT_LINK,
        '1-Arm Cable Row Split Stance': DEFAULT_LINK,
        'Rubber Band Pull-A-Parts': DEFAULT_LINK,
        'MAPS External Rotation': DEFAULT_LINK,
        'MAPS Suitcase Carry': DEFAULT_LINK,

        // Phase II
        'MAPS Matrix Lunges': DEFAULT_LINK,
        'Renegade Row to Push Up': DEFAULT_LINK,
        '1-Arm KB Squat Press': DEFAULT_LINK,
        'MAPS Rotational Lunge': DEFAULT_LINK,
        'Landmine Rotations': DEFAULT_LINK,
        'Phase 2 Squat': DEFAULT_LINK,
        'KB Single Leg Deadlift': DEFAULT_LINK,
        'MAPS High/Low Press': DEFAULT_LINK,
        'Bench Press': DEFAULT_LINK,
        'Push Up With Rotation': DEFAULT_LINK,
        'Zercher Squat': DEFAULT_LINK,
        'Dunphy Squat': DEFAULT_LINK,
        'Stick ISO Drivers': DEFAULT_LINK,
        'Stick 1-Arm ISO Chest': DEFAULT_LINK,
        'Stick Lateral Drivers': DEFAULT_LINK,
        'Supinated Pull-Ups': DEFAULT_LINK,

        // Phase III
        'Box Jump': DEFAULT_LINK,
        'KB Swings': DEFAULT_LINK,
        'Ice Skaters': DEFAULT_LINK,
        'Plyo Push-Ups': DEFAULT_LINK,
        'Phase III Barbell Squat': DEFAULT_LINK,
        '1-Arm DB Snatch': DEFAULT_LINK,
        'Alternating Lunge Jumps': DEFAULT_LINK,
        'Band Speed Row': DEFAULT_LINK,
        'MAPS Power Punch': DEFAULT_LINK,
        'Deadlift Speed Pulls': DEFAULT_LINK,

        // Phase IV
        'Phase IV Barbell Squat': DEFAULT_LINK,
        'Assisted/BW Pull-Ups': DEFAULT_LINK,
        'Push-Ups': DEFAULT_LINK,
        'MAPS Instinctive Intervals (Treadmill)': DEFAULT_LINK,
        'Double KB Swings': DEFAULT_LINK,
        'Front Loaded Squats': DEFAULT_LINK,
        'Rotating Shoulder Press': DEFAULT_LINK,
        'Push Ups with Depth': DEFAULT_LINK
    };

    /*
     * Phases in program order. `kind` drives the logger:
     *   "strength" → weight / reps / done per set
     *   "mobility" → done + note per exercise
     * `restTime` (seconds) is the default rest-timer duration; 0 = circuit/no auto rest.
     */
    const phases = [
        {
            id: 'P1',
            label: 'Fase I',
            numeral: 'I',
            title: 'Raw Strength',
            name: 'Phase I: Raw Strength Adaptation',
            kind: 'strength',
            objective: 'Construir fuerza máxima',
            expect: 'Ganancias rápidas de fuerza. Esta fase te hará sentir fuerte.',
            length: '3 semanas',
            freq: '3 veces/semana (mínimo 1 día de descanso entre sesiones)',
            rest: '3–5 minutos entre sets',
            tempo: '5:1:1 (5 s excéntrica, 1 s pausa, 1 s concéntrica)',
            intensity: '85–90 %',
            restTime: 180,
            days: [
                { id: 'D1', name: 'Día 1', exercises: [
                    { name: 'Phase 1 Squat', sets: 5, reps: '3', note: 'Concéntrica explosiva, excéntrica lenta' },
                    { name: 'Phase 1 Bench Press', sets: 3, reps: '3' },
                    { name: 'High Pull', sets: 3, reps: '3' },
                    { name: 'Weighted/BW Pull-ups', sets: 2, reps: '5', note: 'Full lockout, neutral grip' },
                    { name: 'Overhead Press (Push Press)', sets: 3, reps: '3-6' },
                    { name: 'MAPS Side Chop', sets: 1, reps: '15-20/lado' }
                ] },
                { id: 'D2', name: 'Día 2', exercises: [
                    { name: 'Phase 1 Deadlift', sets: 5, reps: '6', note: 'Idealmente con bandas' },
                    { name: 'Walking Lunges', sets: 3, reps: '20', note: 'Con KB, barra o mancuernas' },
                    { name: 'Weighted Dips', sets: 3, reps: '3-6' },
                    { name: 'MAPS Strength Row', sets: 3, reps: '3-6' },
                    { name: '1-Arm KB Shoulder Press', sets: 3, reps: '3-6/brazo' },
                    { name: 'Downward Chop', sets: 3, reps: '15-20/lado', note: 'Medicine ball o cable' }
                ] },
                { id: 'D3', name: 'Día 3', exercises: [
                    { name: 'Front Squat', sets: 3, reps: '3-6' },
                    { name: 'Incline Press', sets: 3, reps: '3-6' },
                    { name: '1-Arm Cable Row Split Stance', sets: 3, reps: '10-12' },
                    { name: 'Rubber Band Pull-A-Parts', sets: 1, reps: '10-12', note: 'Heavy band' },
                    { name: 'MAPS External Rotation', sets: 1, reps: '15-20', note: 'Light band — superset con el anterior' },
                    { name: 'MAPS Suitcase Carry', sets: 1, reps: '30 s/dirección', note: 'Peso pesado que puedas estabilizar' }
                ] }
            ]
        },
        {
            id: 'P2',
            label: 'Fase II',
            numeral: 'II',
            title: 'Reactive Strength',
            name: 'Phase II: Reactive Strength Adaptation',
            kind: 'strength',
            objective: 'Construir fuerza multiplanar',
            expect: 'Incremento en propiocepción. Capacidad de ejecutar fuerza en cualquier dirección.',
            length: '3 semanas',
            freq: '3 veces/semana',
            rest: '30–90 segundos entre sets',
            tempo: '2:0:2',
            intensity: '75–85 %',
            restTime: 60,
            days: [
                { id: 'D1', name: 'Día 1', exercises: [
                    { name: 'MAPS Matrix Lunges', sets: 4, reps: '18', note: 'Cada lunge cuenta como 1 rep' },
                    { name: 'Renegade Row to Push Up', sets: 4, reps: '10-15' },
                    { name: '1-Arm KB Squat Press', sets: 4, reps: '15-20' },
                    { name: 'MAPS Rotational Lunge', sets: 4, reps: '10-15/lado' },
                    { name: 'Landmine Rotations', sets: 4, reps: '15-20' }
                ] },
                { id: 'D2', name: 'Día 2', exercises: [
                    { name: 'Phase 2 Squat', sets: 4, reps: '15-20' },
                    { name: 'KB Single Leg Deadlift', sets: 4, reps: '15-20' },
                    { name: 'MAPS High/Low Press', sets: 4, reps: '15-20' },
                    { name: 'Bench Press', sets: 4, reps: '4-6' },
                    { name: 'Push Up With Rotation', sets: 4, reps: '15-20', note: 'Superset con el anterior' }
                ] },
                { id: 'D3', name: 'Día 3', exercises: [
                    { name: 'Zercher Squat', sets: 4, reps: '15-20' },
                    { name: 'Dunphy Squat', sets: 4, reps: '15-20' },
                    { name: 'Stick ISO Drivers', sets: 4, reps: '15-20' },
                    { name: 'Stick 1-Arm ISO Chest', sets: 4, reps: '15-20/lado' },
                    { name: 'Stick Lateral Drivers', sets: 4, reps: '15-20' },
                    { name: 'Supinated Pull-Ups', sets: 3, reps: 'fallo −2', note: 'Asistidas si es necesario' }
                ] }
            ]
        },
        {
            id: 'P3',
            label: 'Fase III',
            numeral: 'III',
            title: 'Explosive Strength',
            name: 'Phase III: Explosive Strength Adaptation',
            kind: 'strength',
            objective: 'Construir fuerza rápida y explosiva',
            expect: 'Incremento rápido en aceleración. Te sentirás rápido y poderoso.',
            length: '3 semanas',
            freq: '3 veces/semana (alterna Workout 1 y 2)',
            rest: '3–5 minutos',
            tempo: '5:1:1',
            intensity: '60–65 %',
            restTime: 180,
            alternate: true,
            days: [
                { id: 'W1', name: 'Workout 1', exercises: [
                    { name: 'Box Jump', sets: 4, reps: '10-15', note: 'Recupera la compostura entre reps' },
                    { name: 'KB Swings', sets: 4, reps: '15-20' },
                    { name: 'Ice Skaters', sets: 4, reps: '15-20' },
                    { name: 'Plyo Push-Ups', sets: 4, reps: '15-20' },
                    { name: 'Phase III Barbell Squat', sets: 4, reps: '15-20' }
                ] },
                { id: 'W2', name: 'Workout 2', exercises: [
                    { name: '1-Arm DB Snatch', sets: 4, reps: '15-20/brazo' },
                    { name: 'Alternating Lunge Jumps', sets: 4, reps: '15-20/pierna' },
                    { name: 'Band Speed Row', sets: 4, reps: '15-20' },
                    { name: 'MAPS Power Punch', sets: 4, reps: '15-20' },
                    { name: 'Deadlift Speed Pulls', sets: 4, reps: '5', note: 'Preferiblemente con bandas' }
                ] }
            ]
        },
        {
            id: 'P4',
            label: 'Fase IV',
            numeral: 'IV',
            title: 'Strength Durability',
            name: 'Phase IV: Strength Durability Adaptation',
            kind: 'strength',
            objective: 'Darle mayor resistencia a tu fuerza',
            expect: 'Incremento dramático en resistencia de fuerza y acondicionamiento.',
            length: '2–3 semanas',
            freq: '3 veces/semana (alterna Workout 1 y 2)',
            rest: 'Mínimo (circuito)',
            tempo: 'Continuo',
            intensity: '80–90 %',
            restTime: 0,
            alternate: true,
            days: [
                { id: 'W1', name: 'Workout 1 (Circuit)', exercises: [
                    { name: 'Phase IV Barbell Squat', sets: 4, reps: '45 s', note: 'Máx. reps con buena forma, 4 ciclos completos' },
                    { name: 'Assisted/BW Pull-Ups', sets: 4, reps: '30 s' },
                    { name: 'Push-Ups', sets: 4, reps: '45 s' },
                    { name: 'MAPS Instinctive Intervals (Treadmill)', sets: 1, reps: '15 min total', note: '30 s sprint, recupera hasta estar listo' }
                ] },
                { id: 'W2', name: 'Workout 2 (KB Complex)', exercises: [
                    { name: 'Double KB Swings', sets: 4, reps: '20', note: '4 ciclos del complejo completo' },
                    { name: 'Front Loaded Squats', sets: 4, reps: '15' },
                    { name: 'Rotating Shoulder Press', sets: 4, reps: '10' },
                    { name: 'Push Ups with Depth', sets: 4, reps: '10' }
                ] }
            ]
        },
        {
            id: 'MOB',
            label: 'Movilidad',
            numeral: 'M',
            title: 'Mobility',
            name: 'Mobility Sessions',
            kind: 'mobility',
            objective: 'Recuperación activa y salud articular',
            expect: 'Mejor calidad de movimiento en los días sin entrenamiento fundacional.',
            length: 'Semanas 1–12',
            freq: 'Diario en días sin entrenamiento fundacional (20–45 min)',
            rest: 'Mínimo / continuo',
            tempo: 'Controlado',
            intensity: 'Baja',
            restTime: 0,
            days: [
                { id: 'S1', name: 'Session 1', exercises: [
                    { name: 'Walking Inchworm to Upward Dog', reps: '20 yardas' },
                    { name: '90/90 Stretch', reps: '10/10' },
                    { name: 'Walking In-Step Lunge with Shoulder Rotations', reps: '20 yardas' },
                    { name: 'Rubber Band Knee Abduction', reps: '30/30' },
                    { name: 'Rubber Band Knee Adduction', reps: '30/30' },
                    { name: 'Front Loaded KB Walk', reps: '40 yardas ida/vuelta' },
                    { name: 'Suitcase Carry', reps: '40 yardas' },
                    { name: 'Foam Roll: Piriformis/IT Band/Erectors', reps: '20 s c/u' }
                ] },
                { id: 'S2', name: 'Session 2', exercises: [
                    { name: 'Stick Mobility: X Swing', reps: '10/10' },
                    { name: 'Stick Mobility: Retractor', reps: '6/6' },
                    { name: 'Stick Mobility: The Twister', reps: '10' },
                    { name: 'Stick Mobility: Stick Pigeon', reps: '4/4' },
                    { name: 'Stick Mobility: Monkey Hang', reps: '4/4' },
                    { name: 'Push-Up to Shoulder Rotation', reps: '10' },
                    { name: 'Pull-Ups (assisted)', reps: '10' },
                    { name: 'Bear Crawl', reps: '40 yardas ida/vuelta' },
                    { name: 'Foam Roll: Quads/Hamstrings/Piriformis', reps: '20 s c/u' }
                ] },
                { id: 'S3', name: 'Session 3', exercises: [
                    { name: 'Stick Mobility: Slap Shot', reps: '10/10' },
                    { name: 'Stick Mobility: Hammer Twist', reps: '10/10' },
                    { name: 'Stick Mobility: Hippy Dip', reps: '10/10' },
                    { name: 'Walking Heel Squat', reps: '40/40 yardas' },
                    { name: 'Inchworms', reps: '20 yardas' },
                    { name: 'Good Morning Knees Bent', reps: '10' },
                    { name: 'Dunphy Squat', reps: '6-8' },
                    { name: 'MAPS Rotational Lunge', reps: '10/10' },
                    { name: 'Landmine Cossack Squat', reps: '10/10' }
                ] },
                { id: 'S4', name: 'Session 4', exercises: [
                    { name: '90/90 Stretch', reps: '6/6' },
                    { name: 'Supine Scorpions', reps: '10' },
                    { name: 'Downward Dog 1 Foot Isolating', reps: '6' },
                    { name: 'In Step Lunge With Rotation', reps: '10' },
                    { name: 'Rubber Band External Rotation', reps: '20' },
                    { name: 'Hands Free Push-Ups', reps: '10-15' },
                    { name: 'MAPS Side Chop', reps: '15/15' },
                    { name: 'Walking Lunges', reps: '40/40 yardas' },
                    { name: 'Renegade Rows', reps: '10-15' },
                    { name: 'Farmer Carry', reps: '40 yardas' }
                ] }
            ]
        }
    ];

    const byId = {};
    phases.forEach(function (p) { byId[p.id] = p; });

    function getPhase(id) { return byId[id] || null; }

    function getDay(phaseId, dayId) {
        const phase = byId[phaseId];
        if (!phase) return null;
        return phase.days.find(function (d) { return d.id === dayId; }) || null;
    }

    /** Resolve a legacy day *name* (old logs stored only the display name) to its id. */
    function findDayIdByName(phaseId, dayName) {
        const phase = byId[phaseId];
        if (!phase) return null;
        const day = phase.days.find(function (d) { return d.name === dayName; });
        return day ? day.id : null;
    }

    return {
        phases: phases,
        exerciseLinks: exerciseLinks,
        getPhase: getPhase,
        getDay: getDay,
        findDayIdByName: findDayIdByName
    };
});
