# TG-03: Kud Dice — Minijuego de Evaluación Cognitiva

[![Proyecto UPTC](https://img.shields.io/badge/UPTC-Facultad%20de%20Ingenier%C3%ADa-gold)](#)
[![Población](https://img.shields.io/badge/Poblaci%C3%B3n-Grado%20Tercero-blue)](#)
[![Motor](https://img.shields.io/badge/Kaboom.js-v3000.1.17-brightgreen)](#)
[![Integración](https://img.shields.io/badge/Contrato%20MVP-v1-orange)](#)
[![Configuración](https://img.shields.io/badge/configVersion-2-purple)](#)

Minijuego para observar la **reproducción inmediata de secuencias audiovisuales** con 4 tambores (adaptación de *Simón dice* y del *Corsi block-tapping*). Está dirigido a estudiantes de grado tercero del Colegio "San Diego" de Duitama, Boyacá (Proyecto UPTC). Su uso es **complementario y no diagnóstico**.

> ⚠️ **Coherencia con el Fundamento teórico.** En el documento, *Kud dice* (TG-03) aparece como una tarea de **instrucciones matemáticas sucesivas** ("Empieza con 5 → súmale 3 → réstale 2 → ¿resultado?"). Este juego mantiene la mecánica de tambores, por decisión del equipo, y usa el código **TG-03**. Sus variables siguen las de **recuerdo serial** (Fundamento 5.8) y la **precisión por carga** (5.7), donde la carga es la longitud de la secuencia. Hay que **actualizar la ficha de TG-03 del Fundamento** (descripción, paradigma, variables) para que el documento y el juego coincidan.

---

## 📋 Flujo de la experiencia

```text
Laboratorio de Kud ──► consigna (con "Escuchar otra vez")
        ▼
Transición animada laboratorio → laboratorio musical (8,2 s)
        ▼
Demostración: Kud toca una secuencia y la repite él mismo
        ▼
Práctica guiada (longitud 2; si falla, una ronda más) — no cuenta para los indicadores
        ▼
CONCIERTO (medición): longitud 2, 3, 4… hasta 7, con 2 ensayos por longitud
        ▼
Kud cierra ("¡Concierto terminado!") ──► envío de datos
```

* **Tambores** de izquierda a derecha: rojo (do), azul (re), amarillo (mi), verde (fa).
* Durante la presentación los tambores no responden y Kud queda quieto. Los toques que el niño hace en ese momento se registran como `earlyTaps`.
* En el turno del niño, unos puntos en la franja inferior muestran cuántos toques lleva y cuántos faltan.
* La retroalimentación es neutra: "¡Muy bien!" con notas musicales, o "¡Buen intento!". Ya **no hay vidas ni mensajes de error**, siguiendo el Fundamento 6.19.

---

## 🛠️ Procedimiento

| Parámetro | Valor | Nota |
| :--- | :--- | :--- |
| Longitud inicial / máxima | 2 / 7 | La longitud 1 no aporta información de orden |
| Ensayos por longitud | 2 válidos (+1 de reserva) | La reserva reemplaza un ensayo invalidado por una incidencia |
| Avance | Con ≥ 1 ensayo correcto en la longitud | |
| Fin | Los 2 ensayos válidos de una longitud son incorrectos, o se llega a 7 | Queda en `discontinueReason` |
| Presentación | 600 ms encendido + 300 ms de pausa por tambor | Con tono propio de cada tambor |
| Respuesta | El niño toca **tantos tambores como tenga la secuencia** | Antes se cortaba en el primer error |
| Límite de inactividad | 8 s sin tocar | Las posiciones restantes quedan como **omisión** |
| Secuencias | Fijas (semilla 20263), iguales para todos; nunca el mismo tambor dos veces seguidas | `config.sequences` y `sequenceHash` |

**Calificación de cada posición** (Fundamento 5.8.5):

| Tipo | Significado |
| :--- | :--- |
| `correct` | Tambor correcto en su posición |
| `order` | Tambor que sí está en la secuencia, pero en otra posición (**error de orden**) |
| `intrusion` | Tambor que no está en la secuencia |
| `repetition` | Mismo tambor tocado dos veces seguidas (la secuencia nunca lo tiene) |
| `omission` | Posición sin respuesta (límite de inactividad) |

Cada ensayo queda como `correct`, `incorrect` o `incomplete` (`result` se mantiene en `hit` o `error` por compatibilidad con v1).

> Con solo 4 tambores, las secuencias de 4 o más posiciones casi siempre contienen todos los tambores. Por eso las **intrusiones** solo pueden ocurrir en secuencias cortas; los errores aparecen sobre todo como **errores de orden**.

---

## 📊 Indicadores (`summary`)

Se calculan solo con ensayos válidos.

| Indicador | Cálculo | Referencia |
| :--- | :--- | :--- |
| `precisionPct` | ensayos correctos / ensayos válidos × 100 | 5.7.1, 5.8.1 |
| `byLength[].precisionPct` | precisión según longitud (carga) | 5.7.2, 5.8.2 |
| `precisionChangePct` | precisión en la mayor longitud − precisión en la menor | 5.7.3 |
| `longestCorrectLength` | mayor longitud reproducida correctamente al menos una vez. **No es un "span" estandarizado** | 5.8.3 |
| `positionAccuracyPct` | posiciones correctas / posiciones presentadas × 100 | — |
| `orderErrors`, `orderErrorRatePct`, `trialsWithOrderErrors` | errores de orden: total, por posición y ensayos con al menos uno | 5.8.4 |
| `intrusions`, `repetitions`, `omissions` | recuentos | 5.8.5 |
| `firstTapLatency*` | desde el fin de la presentación hasta el primer toque: mediana, media, DE poblacional, CV | 5.8.6 |
| `totalResponseMedianMs` | desde el fin de la presentación hasta el último toque | 5.8.6 |

* Las medidas de tiempo necesitan al menos 3 ensayos con respuesta; si no, quedan en `null`.
* `status` es `insufficient_data` si no hay ensayos válidos y `no_correct_trials` si no hubo ninguno correcto. En ese caso `longestCorrectLength` es `null` y no 0 (Fundamento 5.12).

---

## 🔗 Contrato de integración MVP (v1)

```text
index.html?sessionId=<ID>&token=<LAUNCH_TOKEN>&apiBase=<API_URL>&targetOrigin=<ORIGEN_PADRE>&attempt=<N>
```
**Solo para pruebas** (quedan en `config.testOverrides`): `seed`, `maxLongitud`, `sinTransicion=1`, `autotest=1` y `debug=1`.

Se envía con `POST {apiBase}/task-sessions/{sessionId}/results` y `Authorization: Bearer <token>`, y además con `postMessage` (`GAME_OVER` o `GAME_INTERRUPTED`).

```json
{
  "contractVersion": "1", "taskId": "TG-03", "configVersion": 2,
  "state": "completed", "phaseReached": "done", "sessionId": "…", "attempt": 1,
  "timing": { "pageLoadedAt": "ISO", "testStartedAt": "ISO", "testEndedAt": "ISO", "testDurationMs": 0 },
  "device": { "viewport": "…", "stagePx": "…", "devicePixelRatio": 1, "touch": true, "userAgent": "…", "pointerTypes": ["touch"] },
  "audio": { "source": "files", "missingFiles": [] },
  "config": { "startLength": 2, "maxLength": 7, "stimOnMs": 600, "stimOffMs": 300, "responseTimeoutMs": 8000,
              "seed": 20263, "sequences": { "2": [[1,2],[3,2],[3,1]], "…": [] }, "sequenceHash": "…" },
  "instruction": { "shownAtMs": 0, "acceptedAtMs": 0, "repeats": 0 },
  "practice": { "demoShown": true, "rounds": [ … ], "completed": true, "roundsNeeded": 1, "durationMs": 0 },
  "events": [ {
      "trial": 1, "length": 2, "span": 2, "attemptAtLength": 1, "isReplacement": false,
      "sequence_target": [1, 2], "sequenceColors": ["azul", "amarillo"],
      "presentationStartMs": 0, "presentedAtMs": 0, "respondedAtMs": 0,
      "responses": [ { "position": 1, "drum": 1, "atMs": 0, "sinceOpenMs": 764.6, "sincePrevMs": 764.6, "pointerType": "mouse" } ],
      "firstTapLatencyMs": 764.6, "totalResponseMs": 1224, "meanInterTapMs": 459.4, "earlyTaps": [], "timedOut": false,
      "outcome": "correct", "result": "hit", "positions": ["correct", "correct"], "positionsCorrect": 2, "correctPrefix": 2,
      "firstErrorPosition": null, "orderErrors": 0, "intrusions": 0, "repetitions": 0, "omissions": 0,
      "valid": true, "invalidReason": null } ],
  "discontinueReason": "all_trials_incorrect_at_length",
  "incidents": [ { "type": "tab_hidden", "timestampMs": 0, "phase": "test" } ],
  "summary": { "precisionPct": 75, "longestCorrectLength": 4, "byLength": [ … ], "…": "…" }
}
```

* **`presentedAtMs`** marca el fin de la presentación, es decir, la apertura del turno, igual que antes. **`respondedAtMs`** es el último toque.
* **Validez:** si la pestaña se oculta o la ventana pierde el foco durante un ensayo, ese ensayo queda inválido y se aplica el de reserva de la misma longitud.
* **Interrupción:** si se cierra la página antes de terminar, se envía igual con `state: "interrupted"`. El ensayo en curso queda con `invalidReason: "interrupted"`.
* **Fallo de red:** el paquete se guarda en `localStorage` con la clave `pending_session_<sessionId>`.

---

## 📁 Estructura

```text
tg-03-kud-dice/
├── backend/   package.json · server.js        (POST /api/v1/task-sessions/:sessionId/results, guarda en backend/data/)
└── frontend/
    ├── index.html · game.js · test_host.html
    ├── libs/kaboom.js                          (copia local; se usa para las notas de celebración)
    └── assets/
        ├── escenario-laboratorio.webp · escenario-musical.webp · nave-frente-musical.png
        ├── tambor-rojo/azul/amarillo/verde.png · nota-1..4.png
        ├── kud-quieto.png · kud-hablando.webm/.webp
        ├── transicion-lab-a-musica.webm/.mp4
        └── do.mp3 · re.mp3 · mi.mp3 · fa.mp3   ⚠ copiar los del proyecto (no incluidos aquí)
```

Si faltan los mp3, el juego genera los mismos cuatro tonos (do, re, mi, fa) y lo registra en `audio.source: "synth"` y en una incidencia. `error.mp3`, `background.jpeg`, `kud.png` y `1.gif` ya no se usan.

## 🚀 Ejecución y pruebas

```bash
cd backend && npm install && npm start          # API de prueba en :3000
cd ../frontend && npx http-server -c-1          # juego en :8080
```
* **Prueba completa:** `http://127.0.0.1:8080/test_host.html?token=DEMO&apiBase=http://localhost:3000/api/v1`. Muestra los indicadores, la tabla por longitud y el JSON.
* **Prueba automática:** `index.html?autotest=1&sinTransicion=1`.

---

## 📝 Cambios respecto a la versión 1

| # | Antes | Ahora |
| :-- | :--- | :--- |
| 1 | `taskId: "TG-02"`, que en la plataforma es *Palabra intrusa*: los datos se mezclarían. | `TG-03` (*Kud dice*). |
| 2 | Tras cada error la secuencia **volvía a longitud 1**. | 2 ensayos por longitud y criterio de fin estándar. |
| 3 | Fin a los 3 errores **en total**, sin importar la longitud. | Fin cuando fallan los 2 ensayos de una longitud, o al llegar a 7. |
| 4 | Secuencias aleatorias distintas para cada niño, con posibles repeticiones seguidas. | Secuencias fijas e iguales para todos, sin repeticiones seguidas. |
| 5 | `trial` = longitud: el número de ensayo se repetía. | Número de ensayo único, más `length` y `attemptAtLength`. |
| 6 | Se cortaba en el primer toque equivocado y solo se guardaba `hit` o `error`. | Reproducción completa con calificación por posición: orden, intrusión, repetición y omisión. |
| 7 | Sin límite de tiempo: el juego podía esperar indefinidamente. | 8 s de inactividad → omisiones registradas. |
| 8 | Solo se guardaba el último toque. | Cada toque con su tiempo, más latencia del primer toque, tiempo total e intervalo entre toques. |
| 9 | Los toques durante la presentación se ignoraban sin registrarse. | `earlyTaps`. |
| 10 | Mensajes de "Error. Vidas: N" y sonido de error. | Retroalimentación neutra. |
| 11 | Sin práctica, demostración, repetición de la consigna, validez por incidencias ni envío al interrumpir. | Incluidos. |
| 12 | Tamaño del lienzo según la ventana. | Escenario 16:9 fijo, con el laboratorio y el laboratorio musical. |

## 📄 Créditos e instituciones

* **Institución:** Universidad Pedagógica y Tecnológica de Colombia (UPTC) — Facultad de Ingeniería.
* **Proyecto:** Plataforma web para el seguimiento de indicadores de memoria y atención en primaria.
* **Colegio objetivo:** Colegio de Preescolar y Básica Primaria "San Diego" (Duitama, Boyacá).
