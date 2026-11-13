/* =====================================================================
   TG-03 · Kud dice — reproducción de secuencias audiovisuales (4 tambores)
   Flujo: laboratorio (consigna) → transición → demostración de Kud →
          práctica guiada → ensayos (longitud creciente) → cierre → envío
   Procedimiento tipo Corsi: 2 ensayos por longitud, reproducción completa,
   se termina cuando los 2 ensayos válidos de una longitud son incorrectos.
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
   1. PARÁMETROS DE INTEGRACIÓN (URL)
   ------------------------------------------------------------------- */
const urlParams    = new URLSearchParams(window.location.search);
const sessionId    = urlParams.get("sessionId");
const launchToken  = urlParams.get("token");
const apiBase      = urlParams.get("apiBase") || "http://localhost:3000/api/v1";
const targetOrigin = urlParams.get("targetOrigin") || window.location.origin;
const attempt      = parseInt(urlParams.get("attempt") || "1", 10);
const AUTOTEST     = urlParams.get("autotest") === "1";
const SKIP_VIDEO   = urlParams.get("sinTransicion") === "1";
const DEBUG        = urlParams.get("debug") === "1" || AUTOTEST;

/* ---------------------------------------------------------------------
   2. CONFIGURACIÓN (cambiar aquí = subir configVersion)
   ------------------------------------------------------------------- */
const CONFIG = {
    taskId: "TG-03",
    contractVersion: "1",
    configVersion: 2,
    drums: [   // de izquierda a derecha, tono ascendente
        { id: 0, name: "rojo",     note: "do", file: "do.mp3", freq: 261.63 },
        { id: 1, name: "azul",     note: "re", file: "re.mp3", freq: 293.66 },
        { id: 2, name: "amarillo", note: "mi", file: "mi.mp3", freq: 329.63 },
        { id: 3, name: "verde",    note: "fa", file: "fa.mp3", freq: 349.23 }
    ],
    startLength: 2,             // la longitud 1 no aporta información de secuencia
    maxLength: 7,
    trialsPerLength: 2,         // 2 ensayos válidos por longitud
    reservePerLength: 1,        // ensayo de reemplazo si uno queda inválido por incidencia
    stimOnMs: 600,              // tiempo encendido de cada tambor
    stimOffMs: 300,             // pausa entre tambores
    preSequenceMs: 900,
    responseTimeoutMs: 8000,    // sin tocar durante este tiempo → posiciones restantes = omisión
    seed: 20263,                // mismas secuencias para todos los estudiantes
    minRtForStats: 3,
    practice: { length: 2, maxRounds: 2 },
    testOverrides: {}
};
if (urlParams.get("seed")) { CONFIG.seed = +urlParams.get("seed"); CONFIG.testOverrides.seed = CONFIG.seed; }
if (urlParams.get("maxLongitud")) { CONFIG.maxLength = +urlParams.get("maxLongitud"); CONFIG.testOverrides.maxLength = CONFIG.maxLength; }
if (AUTOTEST) CONFIG.testOverrides.autotest = true;

/* ---------------------------------------------------------------------
   3. ESTRUCTURA DE LA SESIÓN
   ------------------------------------------------------------------- */
const now = () => performance.now();
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const incidents = [];
const sessionData = {
    contractVersion: CONFIG.contractVersion,
    taskId: CONFIG.taskId,
    configVersion: CONFIG.configVersion,
    state: "interrupted",
    phaseReached: "loading",     // loading | intro | transition | practice | test | done
    sessionId, attempt,
    timing: { pageLoadedAt: new Date().toISOString(), testStartedAt: null, testEndedAt: null, testStartMs: null, testEndMs: null, testDurationMs: null },
    device: {
        viewport: `${window.innerWidth}x${window.innerHeight}`, stagePx: null,
        devicePixelRatio: window.devicePixelRatio || 1,
        touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        userAgent: navigator.userAgent, pointerTypes: []
    },
    audio: { source: null, missingFiles: [] },   // "files" (mp3 del proyecto) | "synth" (tonos generados) | "mixed" | "none"
    config: null,
    instruction: { shownAtMs: null, acceptedAtMs: null, repeats: 0 },
    practice: { demoShown: false, rounds: [], completed: false, roundsNeeded: 0, durationMs: null },
    events: [],                  // un registro por ensayo de la medición
    discontinueReason: null,
    incidents,
    summary: null
};
function addIncident(type, extra) { incidents.push(Object.assign({ type, timestampMs: r1(now()), phase: sessionData.phaseReached }, extra || {})); }
window.addEventListener("error", (e) => addIncident("script_error", { message: String(e.message || e) }));

/* ---------------------------------------------------------------------
   4. SECUENCIAS (deterministas): sin el mismo tambor dos veces seguidas
   ------------------------------------------------------------------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeSeq(rnd, len, n) {
    const s = []; let prev = -1;
    for (let i = 0; i < len; i++) { let d; do { d = Math.floor(rnd() * n); } while (d === prev); s.push(d); prev = d; }
    return s;
}
function buildSequences(cfg) {
    const rnd = mulberry32(cfg.seed);
    const byLength = {};
    const perLen = cfg.trialsPerLength + cfg.reservePerLength;
    for (let L = cfg.startLength; L <= cfg.maxLength; L++) {
        const list = [];
        while (list.length < perLen) {
            const s = makeSeq(rnd, L, cfg.drums.length);
            if (!list.some((x) => x.join() === s.join())) list.push(s);   // las secuencias de una misma longitud son distintas
        }
        byLength[L] = list;
    }
    const practice = [makeSeq(rnd, cfg.practice.length, cfg.drums.length), makeSeq(rnd, cfg.practice.length, cfg.drums.length), makeSeq(rnd, cfg.practice.length, cfg.drums.length)];
    return { byLength, practice };
}
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

/* ---------------------------------------------------------------------
   5. CALIFICACIÓN DE UN ENSAYO (Fundamento 5.8)
   correcto | orden (tambor de la secuencia en otra posición) | intrusión
   (tambor que no está en la secuencia) | repetición (mismo tambor seguido) | omisión
   ------------------------------------------------------------------- */
function scoreTrial(sequence, responses) {
    const positions = sequence.map((target, i) => {
        const r = responses[i] ? responses[i].drum : null;
        if (r === null) return "omission";
        if (r === target) return "correct";
        if (i > 0 && responses[i - 1] && r === responses[i - 1].drum) return "repetition";
        if (!sequence.includes(r)) return "intrusion";
        return "order";
    });
    const count = (k) => positions.filter((p) => p === k).length;
    const firstError = positions.findIndex((p) => p !== "correct");
    return {
        positions,
        positionsCorrect: count("correct"),
        orderErrors: count("order"), intrusions: count("intrusion"), repetitions: count("repetition"), omissions: count("omission"),
        firstErrorPosition: firstError === -1 ? null : firstError + 1,
        correctPrefix: firstError === -1 ? sequence.length : firstError,   // posiciones correctas antes del primer error
        outcome: firstError === -1 ? "correct" : (count("omission") > 0 ? "incomplete" : "incorrect")
    };
}

/* ---------------------------------------------------------------------
   6. INDICADORES (Fundamento 5.7 y 5.8) — función pura
   ------------------------------------------------------------------- */
function computeIndicators(events, cfg) {
    const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sdPop = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
    const pct = (n, d) => (d > 0 ? r1(n / d * 100) : null);
    const valid = events.filter((e) => e.valid);
    const correct = valid.filter((e) => e.outcome === "correct");
    const lengths = [...new Set(valid.map((e) => e.length))].sort((a, b) => a - b);
    const sum = (k) => valid.reduce((s, e) => s + e[k], 0);
    const totalPositions = valid.reduce((s, e) => s + e.length, 0);

    const rtBlock = (evts) => {
        const first = evts.map((e) => e.firstTapLatencyMs).filter((x) => x != null);
        const total = evts.filter((e) => e.outcome !== "incomplete").map((e) => e.totalResponseMs).filter((x) => x != null);
        const ok = first.length >= cfg.minRtForStats;
        const m = ok ? mean(first) : null, sd = ok ? sdPop(first) : null;
        return {
            rtValidN: first.length,
            firstTapLatencyMedianMs: ok ? r1(median(first)) : null,
            firstTapLatencyMeanMs: ok ? r1(m) : null,
            firstTapLatencySdMs: ok ? r1(sd) : null,
            firstTapLatencyCvPct: ok && m > 0 ? r1(sd / m * 100) : null,
            totalResponseMedianMs: total.length >= cfg.minRtForStats ? r1(median(total)) : null
        };
    };
    const byLength = lengths.map((L) => {
        const ev = valid.filter((e) => e.length === L);
        const c = ev.filter((e) => e.outcome === "correct").length;
        const lat = ev.map((e) => e.firstTapLatencyMs).filter((x) => x != null);
        return { length: L, validTrials: ev.length, correctTrials: c, precisionPct: pct(c, ev.length),
                 positionAccuracyPct: pct(ev.reduce((s, e) => s + e.positionsCorrect, 0), ev.length * L),
                 firstTapLatencyMedianMs: lat.length ? r1(median(lat)) : null };
    });

    const longest = correct.length ? Math.max(...correct.map((e) => e.length)) : null;
    const lo = byLength[0], hi = byLength[byLength.length - 1];
    return Object.assign({
        formulasRef: "Fundamento teórico 5.7 (precisión por carga) y 5.8 (recuerdo serial)",
        validTrials: valid.length,
        invalidTrials: events.length - valid.length,
        correctTrials: correct.length,
        precisionPct: pct(correct.length, valid.length),                       // ensayos correctos / ensayos válidos × 100
        longestCorrectLength: longest,                                         // longitud máxima correctamente reproducida (no es un "span" estandarizado)
        lengthsAdministered: lengths,
        precisionChangePct: lo && hi && lo !== hi ? r1(hi.precisionPct - lo.precisionPct) : null, // ΔPrecisión = mayor carga − menor carga
        totalPositions,
        positionAccuracyPct: pct(sum("positionsCorrect"), totalPositions),
        orderErrors: sum("orderErrors"), intrusions: sum("intrusions"), repetitions: sum("repetitions"), omissions: sum("omissions"),
        orderErrorRatePct: pct(sum("orderErrors"), totalPositions),
        trialsWithOrderErrors: valid.filter((e) => e.orderErrors > 0).length,
        incompleteTrials: valid.filter((e) => e.outcome === "incomplete").length,
        earlyTaps: valid.reduce((s, e) => s + e.earlyTaps.length, 0),
        byLength,
        status: valid.length === 0 ? "insufficient_data" : (correct.length === 0 ? "no_correct_trials" : "ok")
    }, rtBlock(valid));
}

/* ---------------------------------------------------------------------
   7. PÁGINA, KUD Y AUDIO
   ------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const stage = $("stage");
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
const kudIdle = $("kudIdle"), kudTalk = $("kudTalk"), kudTalkImg = $("kudTalkImg");
if (isSafari) kudTalkImg.src = "assets/kud-hablando.webp";
function kudTalking(on) {
    if (isSafari) { kudTalkImg.classList.toggle("hidden", !on); kudIdle.classList.toggle("hidden", on); return; }
    if (on) { kudTalk.classList.remove("hidden"); kudIdle.classList.add("hidden"); kudTalk.play().catch(() => {}); }
    else { kudTalk.pause(); kudTalk.classList.add("hidden"); kudIdle.classList.remove("hidden"); }
}
let where = "lab", talkTimer = null;
function say(html, ms) {
    const el = where === "lab" ? $("labText") : $("musicText");
    el.innerHTML = `<span>${html}</span>`; el.classList.remove("off");
    kudTalking(true); clearTimeout(talkTimer); talkTimer = setTimeout(() => kudTalking(false), ms || 1600);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, AUTOTEST ? Math.min(ms, 150) : ms));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));    // tiempos de estímulo: nunca se acortan
function buttons(defs) {
    const box = $("buttons"); box.innerHTML = "";
    return new Promise((resolve) => {
        defs.forEach((d, i) => {
            const b = document.createElement("button"); b.className = "btn" + (d.alt ? " alt" : ""); b.textContent = d.label;
            b.addEventListener("click", (ev) => { ev.stopPropagation(); box.innerHTML = ""; resolve(i); });
            box.appendChild(b);
        });
        if (AUTOTEST) setTimeout(() => { const b = box.querySelector(".btn"); if (b) b.click(); }, 150);
    });
}

// Audio: tonos de los tambores. Se usan los mp3 del proyecto si existen; si no, tonos generados (se registra).
let audioCtx = null; const toneBuf = {};
function initAudio() {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { addIncident("audio_play_failed", { message: e.message }); sessionData.audio.source = "none"; return Promise.resolve(); }
    return Promise.all(CONFIG.drums.map((d) => fetch("assets/" + d.file)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then((b) => audioCtx.decodeAudioData(b)).then((buf) => { toneBuf[d.id] = buf; })
        .catch(() => { sessionData.audio.missingFiles.push(d.file); })))
        .then(() => {
            const n = Object.keys(toneBuf).length;
            sessionData.audio.source = n === 4 ? "files" : (n === 0 ? "synth" : "mixed");
            if (n < 4) addIncident("resource_load_error", { resource: sessionData.audio.missingFiles.join(","), fallback: "synth" });
        });
}
function playTone(id, durMs) {
    if (!audioCtx) return;
    try {
        if (audioCtx.state === "suspended") audioCtx.resume();
        const t = audioCtx.currentTime, g = audioCtx.createGain(); g.connect(audioCtx.destination);
        if (toneBuf[id]) { const s = audioCtx.createBufferSource(); s.buffer = toneBuf[id]; g.gain.value = 0.8; s.connect(g); s.start(t); return; }
        const o = audioCtx.createOscillator(); o.type = "triangle"; o.frequency.value = CONFIG.drums[id].freq;
        const d = Math.max(0.2, (durMs || 500) / 1000);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); o.start(t); o.stop(t + d + 0.05);
    } catch (e) { /* sin sonido */ }
}

/* ---------------------------------------------------------------------
   8. KABOOM: notas de celebración (capa sin interacción)
   ------------------------------------------------------------------- */
kaboom({ canvas: $("fx"), width: 1920, height: 1080, stretch: true, letterbox: false, background: [0, 0, 0, 0],
         pixelDensity: Math.min(2, window.devicePixelRatio || 1), global: true, debug: false, backgroundAudio: true });
for (let i = 1; i <= 4; i++) loadSprite("nota" + i, `assets/nota-${i}.png`);
function celebrate() {
    for (let i = 0; i < 9; i++) {
        const n = add([sprite("nota" + (1 + (i % 4)), { width: 70, height: 70 }), pos(960 + rand(-180, 180), 640 + rand(-30, 30)), anchor("center"), opacity(0),
                       rotate(rand(-20, 20)), { vy: rand(-260, -180), vx: rand(-90, 90), life: 0 }]);
        n.onUpdate(() => { n.life += dt(); n.pos.x += n.vx * dt(); n.pos.y += n.vy * dt();
            n.opacity = n.life < 0.15 ? n.life / 0.15 : Math.max(0, 1 - (n.life - 0.6) / 0.5); if (n.life > 1.1) destroy(n); });
    }
}

/* ---------------------------------------------------------------------
   9. TAMBORES: encendido y toques (solo sobre la parte dibujada)
   ------------------------------------------------------------------- */
const drumEls = [0, 1, 2, 3].map((i) => $("drum" + i));
const hitMasks = drumEls.map((img) => { const c = document.createElement("canvas");
    const fill = () => { c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0); };
    if (img.complete) fill(); else img.addEventListener("load", fill); return c; });
function onDrum(i, e) {
    const r = drumEls[i].getBoundingClientRect(), c = hitMasks[i];
    if (!c.width) return true;
    try { return c.getContext("2d").getImageData((e.clientX - r.left) / r.width * c.width | 0, (e.clientY - r.top) / r.height * c.height | 0, 1, 1).data[3] > 40; } catch (err) { return true; }
}
function lightDrum(i, ms) { drumEls[i].classList.add("on"); setTimeout(() => drumEls[i].classList.remove("on"), ms); }
function setDrumsEnabled(on) { drumEls.forEach((d) => d.classList.toggle("disabled", !on)); }

let phase = "loading";
let tapHandler = null;          // función activa que recibe los toques durante la respuesta
let earlyTapSink = null;        // registro de toques durante la presentación
drumEls.forEach((el, i) => el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    if (!onDrum(i, ev)) return;
    if (ev.pointerType && !sessionData.device.pointerTypes.includes(ev.pointerType)) sessionData.device.pointerTypes.push(ev.pointerType);
    const t = ev.timeStamp || now();
    if (tapHandler) { lightDrum(i, 220); playTone(i, 300); tapHandler(i, t, ev.pointerType || null); }
    else if (earlyTapSink) earlyTapSink.push({ drum: i, atMs: r1(t) });
}));
function renderTaps(total, done) {
    const box = $("taps"); box.innerHTML = "";
    for (let k = 0; k < total; k++) { const d = document.createElement("i"); if (done[k] != null) d.className = "c" + done[k]; box.appendChild(d); }
}

/* ---------------------------------------------------------------------
   10. INCIDENCIAS DE FOCO: el ensayo en curso queda inválido
   ------------------------------------------------------------------- */
let currentRec = null, blurSince = null, hiddenSince = null;
function invalidateCurrent(reason) { if (currentRec && currentRec.valid) { currentRec.valid = false; currentRec.invalidReason = reason; } }
document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenSince = now(); invalidateCurrent("tab_hidden"); addIncident("tab_hidden"); }
    else if (hiddenSince != null) { addIncident("tab_visible", { hiddenDurationMs: r1(now() - hiddenSince) }); hiddenSince = null; }
});
window.addEventListener("blur", () => { blurSince = now(); invalidateCurrent("focus_lost"); addIncident("loss_of_focus"); });
window.addEventListener("focus", () => { if (blurSince != null) { addIncident("focus_regained", { blurDurationMs: r1(now() - blurSince) }); blurSince = null; } });

/* ---------------------------------------------------------------------
   11. UN ENSAYO: presentación → respuesta → calificación
   ------------------------------------------------------------------- */
async function presentSequence(seq, rec) {
    setDrumsEnabled(false);
    const early = []; earlyTapSink = early;
    await wait(CONFIG.preSequenceMs);
    if (rec) rec.presentationStartMs = r1(now());
    for (const d of seq) {
        lightDrum(d, CONFIG.stimOnMs); playTone(d, CONFIG.stimOnMs);
        await wait(CONFIG.stimOnMs + CONFIG.stimOffMs);
    }
    earlyTapSink = null;
    return early;
}
function collectResponse(len, rec, botSeq) {
    return new Promise((resolve) => {
        const responses = [];
        const openAt = now();
        renderTaps(len, []);
        setDrumsEnabled(true);
        let timer = null;
        const finish = (timedOut) => {
            clearTimeout(timer); tapHandler = null; setDrumsEnabled(false);
            resolve({ responses, openAt, timedOut });
        };
        const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(true), CONFIG.responseTimeoutMs); };
        tapHandler = (drum, t, pointerType) => {
            const prev = responses.length ? responses[responses.length - 1].atMs : openAt;
            responses.push({ position: responses.length + 1, drum, atMs: r1(t), sinceOpenMs: r1(t - openAt), sincePrevMs: r1(t - prev), pointerType });
            renderTaps(len, responses.map((r) => r.drum));
            if (responses.length >= len) setTimeout(() => finish(false), 250); else arm();
        };
        arm();
        if (AUTOTEST && botSeq) bot(botSeq, len);
    });
}
async function runTrial(seq, meta) {
    const rec = Object.assign({
        trial: null, length: seq.length, span: seq.length, attemptAtLength: meta.attemptAtLength, isReplacement: meta.isReplacement,
        sequence_target: [...seq], sequenceColors: seq.map((d) => CONFIG.drums[d].name),
        presentationStartMs: null, presentedAtMs: null, respondedAtMs: null,
        responses: [], firstTapLatencyMs: null, totalResponseMs: null, meanInterTapMs: null,
        earlyTaps: [], timedOut: false,
        result: null, outcome: null, positions: null, positionsCorrect: 0, correctPrefix: 0, firstErrorPosition: null,
        orderErrors: 0, intrusions: 0, repetitions: 0, omissions: 0,
        valid: true, invalidReason: null
    }, meta.extra || {});
    currentRec = rec;
    if (hiddenSince != null) { rec.valid = false; rec.invalidReason = "tab_hidden"; }
    if (blurSince != null)   { rec.valid = false; rec.invalidReason = "focus_lost"; }
    say("¡Mira y escucha!", 900);
    rec.earlyTaps = await presentSequence(seq, rec);
    rec.presentedAtMs = r1(now());                 // fin de la presentación = apertura de la respuesta
    say("¡Tu turno!", 700);
    const { responses, openAt, timedOut } = await collectResponse(seq.length, rec, seq);
    rec.responses = responses; rec.timedOut = timedOut;
    if (responses.length) {
        rec.respondedAtMs = responses[responses.length - 1].atMs;
        rec.firstTapLatencyMs = r1(responses[0].atMs - openAt);
        rec.totalResponseMs = r1(responses[responses.length - 1].atMs - openAt);
        if (responses.length > 1) rec.meanInterTapMs = r1(responses.slice(1).reduce((s, r) => s + r.sincePrevMs, 0) / (responses.length - 1));
    }
    Object.assign(rec, scoreTrial(seq, responses));
    rec.result = rec.outcome === "correct" ? "hit" : "error";     // compatibilidad con el contrato v1
    currentRec = null;
    $("taps").innerHTML = "";
    return rec;
}

/* ---------------------------------------------------------------------
   12. DEMOSTRACIÓN Y PRÁCTICA (no cuentan para los indicadores)
   ------------------------------------------------------------------- */
async function runPractice(seqs) {
    phase = "practice"; sessionData.phaseReached = "practice";
    const t0 = now();
    // Kud modela: toca una secuencia y la "repite" él mismo
    say("Mira, primero lo hago yo.", 1600); await sleep(1800);
    await presentSequence(seqs[0]);
    say("Ahora la repito igualita…", 1500); await sleep(1300);
    for (const d of seqs[0]) { lightDrum(d, 450); playTone(d, 450); await wait(700); }
    sessionData.practice.demoShown = true;
    say("¡Así! Ahora tú.", 1400); await sleep(1600);
    for (let round = 1; round <= CONFIG.practice.maxRounds; round++) {
        const rec = await runTrial(seqs[round], { attemptAtLength: round, isReplacement: false, extra: { practiceRound: round } });
        sessionData.practice.rounds.push({ round, sequence: rec.sequence_target, responses: rec.responses.map((r) => r.drum), outcome: rec.outcome, valid: rec.valid,
                                           firstTapLatencyMs: rec.firstTapLatencyMs, totalResponseMs: rec.totalResponseMs });
        sessionData.practice.roundsNeeded = round;
        if (rec.outcome === "correct") { celebrate(); say("¡Muy bien! Lo entendiste.", 1500); await sleep(1800); sessionData.practice.completed = true; break; }
        say(round < CONFIG.practice.maxRounds ? "¡Casi! Escucha otra vez y repite en el mismo orden." : "¡Buen intento! Vamos a empezar.", 2200);
        await sleep(2400);
    }
    sessionData.practice.durationMs = r1(now() - t0);
}

/* ---------------------------------------------------------------------
   13. MEDICIÓN: 2 ensayos por longitud; se detiene si ambos fallan
   ------------------------------------------------------------------- */
async function runTest(byLength) {
    phase = "test"; sessionData.phaseReached = "test";
    sessionData.timing.testStartMs = r1(now()); sessionData.timing.testStartedAt = new Date().toISOString();
    let trialNo = 0;
    for (let L = CONFIG.startLength; L <= CONFIG.maxLength; L++) {
        const queue = byLength[L].slice();
        let validDone = 0, correctAtL = 0, used = 0;
        while (validDone < CONFIG.trialsPerLength && queue.length) {
            const seq = queue.shift(); used++;
            const rec = await runTrial(seq, { attemptAtLength: validDone + 1, isReplacement: used > CONFIG.trialsPerLength });
            rec.trial = ++trialNo;
            sessionData.events.push(rec);
            if (rec.valid) { validDone++; if (rec.outcome === "correct") correctAtL++; }
            if (rec.outcome === "correct") { celebrate(); say("¡Muy bien!", 1100); } else { say("¡Buen intento!", 1100); }
            await sleep(1500);
        }
        if (validDone === 0) { sessionData.discontinueReason = "invalid_trials"; return; }
        if (correctAtL === 0) { sessionData.discontinueReason = "all_trials_incorrect_at_length"; return; }
        if (L < CONFIG.maxLength) { say("¡Ahora la canción es más larga!", 1500); await sleep(1700); }
    }
    sessionData.discontinueReason = "max_length_reached";
}

/* ---------------------------------------------------------------------
   14. FLUJO COMPLETO
   ------------------------------------------------------------------- */
function showMusic() {
    $("bgLab").classList.add("hidden"); $("labText").classList.add("hidden");
    $("bgMusic").classList.remove("hidden"); $("shipFront").classList.remove("hidden"); $("drums").classList.remove("hidden");
    $("musicText").classList.remove("hidden"); $("kud").className = "layer music"; where = "music";
}
function playTransition() {
    return new Promise((resolve) => {
        if (SKIP_VIDEO) { addIncident("transition_skipped", { reason: "url_param" }); resolve(); return; }
        const v = $("transition"); let done = false;
        const finish = (why) => { if (done) return; done = true; if (why) addIncident("transition_skipped", { reason: why });
            v.classList.add("fade"); v.style.opacity = "0"; setTimeout(() => { v.classList.add("hidden"); v.style.opacity = ""; }, 400); resolve(); };
        v.classList.remove("hidden");
        v.addEventListener("ended", () => finish(null), { once: true });
        v.addEventListener("error", () => finish("video_error"), { once: true });
        setTimeout(() => finish("timeout"), 15000);
        v.currentTime = 0; v.play().catch(() => finish("autoplay_blocked"));
        setTimeout(showMusic, 300);
    });
}
async function intro() {
    phase = "intro"; sessionData.phaseReached = "intro";
    say("¡Hola! Soy Kud.", 1400);
    await buttons([{ label: "¡Hola, Kud!" }]);
    await initAudio();
    sessionData.instruction.shownAtMs = r1(now());
    let again = 0;
    while (true) {
        say("Vamos a mi laboratorio musical.", 2200); await sleep(2600);
        say("Mis tambores van a tocar una canción.", 2400); await sleep(2800);
        say("Escucha bien y tócalos en el mismo orden.", 2600); await sleep(2800);
        const c = await buttons([{ label: "¡Vamos!" }, { label: "Escuchar otra vez", alt: true }]);
        if (c === 0) break; again++;
    }
    sessionData.instruction.repeats = again; sessionData.instruction.acceptedAtMs = r1(now());
}
async function main() {
    await Promise.all([$("bgLab"), $("kudIdle")].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = () => { addIncident("resource_load_error", { resource: img.src }); r(); }; })));
    $("loading").classList.add("hidden");
    const rect = stage.getBoundingClientRect();
    sessionData.device.stagePx = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (rect.width < 700) addIncident("small_stage", { stagePx: sessionData.device.stagePx });

    const seqs = buildSequences(CONFIG);
    sessionData.config = Object.assign({}, CONFIG, { sequences: seqs.byLength, practiceSequences: seqs.practice,
        sequenceHash: hashString(JSON.stringify(seqs)) });

    await intro();
    phase = "transition"; sessionData.phaseReached = "transition";
    $("labText").classList.add("off"); kudTalking(false);
    await playTransition();
    showMusic();
    await sleep(300);
    await runPractice(seqs.practice);
    say("¡Ahora empieza el concierto!", 1600);
    await buttons([{ label: "¡Empezar!" }]);
    await runTest(seqs.byLength);

    phase = "done"; sessionData.phaseReached = "done"; sessionData.state = "completed";
    sessionData.timing.testEndMs = r1(now()); sessionData.timing.testEndedAt = new Date().toISOString();
    sessionData.timing.testDurationMs = r1(sessionData.timing.testEndMs - sessionData.timing.testStartMs);
    sessionData.summary = computeIndicators(sessionData.events, CONFIG);
    celebrate();
    say("¡Concierto terminado! Gracias por tocar conmigo.", 2600);
    submit(false);
}

/* ---------------------------------------------------------------------
   15. ENVÍO DE DATOS (y sesión interrumpida)
   ------------------------------------------------------------------- */
let submitted = false;
function submit(interrupted) {
    if (submitted) return; submitted = true;
    if (interrupted) {
        sessionData.state = "interrupted";
        if (currentRec) {
            currentRec.valid = false; currentRec.invalidReason = "interrupted";
            if (!currentRec.practiceRound && !sessionData.events.includes(currentRec)) { currentRec.trial = sessionData.events.length + 1; sessionData.events.push(currentRec); }
        }
        sessionData.summary = computeIndicators(sessionData.events, CONFIG);
    }
    const body = JSON.stringify(sessionData);
    if (sessionId && launchToken) {
        fetch(`${apiBase}/task-sessions/${sessionId}/results`, { method: "POST", keepalive: true,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${launchToken}` }, body })
            .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); })
            .catch((err) => { addIncident("network_submit_error", { message: err.message });
                try { localStorage.setItem(`pending_session_${sessionId}`, JSON.stringify(sessionData)); } catch (e) {} });
    }
    try { window.parent.postMessage({ type: interrupted ? "GAME_INTERRUPTED" : "GAME_OVER", payload: sessionData }, targetOrigin); } catch (e) {}
    if (DEBUG) { let pre = $("debug"); if (!pre) { pre = document.createElement("pre"); pre.id = "debug"; stage.appendChild(pre); } pre.textContent = JSON.stringify(sessionData, null, 1); }
}
window.addEventListener("pagehide", () => { if (sessionData.state !== "completed" && sessionData.phaseReached !== "loading") submit(true); });

/* ---------------------------------------------------------------------
   16. JUGADOR SIMULADO (solo con ?autotest=1)
   ------------------------------------------------------------------- */
let botRnd = mulberry32(7);
function bot(seq, len) {
    const pOk = len <= 3 ? 0.96 : len === 4 ? 0.85 : len === 5 ? 0.7 : 0.45;
    let k = 0;
    const tapOne = () => {
        if (!tapHandler || k >= len) return;
        let d = seq[k];
        if (botRnd() > pOk) d = (d + 1 + Math.floor(botRnd() * 3)) % 4;
        const r = drumEls[d].getBoundingClientRect();
        drumEls[d].dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.3, pointerType: "mouse", bubbles: true }));
        k++; setTimeout(tapOne, 380 + botRnd() * 320);
    };
    setTimeout(tapOne, 500 + botRnd() * 600);
}

if (typeof module !== "undefined") module.exports = { buildSequences, scoreTrial, computeIndicators, CONFIG };
main();
