// backend/server.js — servidor local de prueba para la ingesta de TG-01, TG-02, TG-03 y TG-04
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
// TG-01 Lluvia de estrellas · TG-02 Palabra intrusa · TG-03 Mentalista · TG-04 Kud dice
const TASKS = ['TG-01', 'TG-02', 'TG-03', 'TG-04'];

// Misma ruta que usan los juegos: POST {apiBase}/task-sessions/{sessionId}/results
app.post('/api/v1/task-sessions/:sessionId/results', (req, res) => {
    const { sessionId } = req.params;
    const auth = req.headers.authorization || '';
    const data = req.body || {};

    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Falta el launchToken (Authorization: Bearer ...)' });
    if (!TASKS.includes(data.taskId)) return res.status(400).json({ error: `taskId no admitido: ${data.taskId} (se espera ${TASKS.join(', ')})` });
    if (!Array.isArray(data.events)) return res.status(400).json({ error: 'Paquete inválido: falta events[]' });
    if (data.taskId === 'TG-03') {   // validación de los eventos de Mentalista
        const need = ['trial', 'itemId', 'load', 'block', 'optionValues', 'correctIdx', 'correctAnswer', 'result', 'valid'];
        const bad = data.events.findIndex((e) => need.some((k) => !(k in e)) || (e.result != null && !['correct', 'incorrect', 'omission'].includes(e.result)));
        if (bad >= 0) return res.status(400).json({ error: `events[${bad}] incompleto o con result no válido` });
    }

    const invalid = data.events.filter((e) => e.valid === false).length;
    const o = (data.summary && data.summary.overall) || {};
    const v = (x, u = '') => (x == null ? '—' : `${x}${u}`);
    let metrics;
    if (data.taskId === 'TG-04') {   // Kud dice: el resumen es plano (sin overall)
        const s = data.summary || {};
        metrics = `precisión=${v(s.precisionPct, '%')} long.máx=${v(s.longestCorrectLength)} posiciones=${v(s.positionAccuracyPct, '%')} lat1.ª=${v(s.firstTapLatencyMedianMs, 'ms')} fin=${v(data.discontinueReason)}`;
    } else if (data.taskId === 'TG-03') {
        const bl = ((data.summary && data.summary.byLoad) || []).map((b) => `c${b.load}=${v(b.precisionPct, '%')}(n=${b.nValid})`).join(' ');
        metrics = `precisión por carga: ${bl} · TRmed=${v(o.rtMedianMs, 'ms')} (n=${v(o.nRt)}) · Δprecisión=${v(o.deltaPrecisionPts, ' pts')}`;
    } else if (data.taskId === 'TG-02') {
        metrics = `precisión=${v(o.precisionPct, '%')} error=${v(o.errorRatePct, '%')} omisión=${v(o.omissionRatePct, '%')} TRmed=${v(o.rtMedianMs, 'ms')} (n válidos=${v(o.nValid)})`;
    } else {
        metrics = `precisión=${v(o.precisionPct, '%')} omisión=${v(o.omissionRatePct, '%')} comisión=${v(o.commissionRatePct, '%')} TRmed=${v(o.rtMedianMs, 'ms')}`;
    }
    console.log(`[${data.taskId}][${sessionId}] estado=${data.state} fase=${data.phaseReached} intento=${data.attempt} ` +
        `ensayos=${data.events.length} inválidos=${invalid} ${metrics}`);

    // Guardado de prueba: un JSON por sesión (en producción: base de datos de la plataforma)
    const file = path.join(DATA_DIR, `${data.taskId}_${sessionId}_${data.state}_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    res.status(200).json({ message: 'Datos guardados exitosamente', file: path.basename(file) });
});

app.listen(3000, () => console.log('Servidor Node.js en http://localhost:3000 (POST /api/v1/task-sessions/:sessionId/results · TG-01, TG-02, TG-03, TG-04)'));