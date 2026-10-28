// 1. PARÁMETROS DE INTEGRACIÓN (Contrato MVP)
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("sessionId");
const launchToken = urlParams.get("token");
const apiBase = urlParams.get("apiBase") || "http://localhost:3000/api/v1";
const targetOrigin = urlParams.get("targetOrigin") || window.location.origin;

// 2. INCIDENCIAS Y DATOS DE SESIÓN
const incidents = [];
window.addEventListener("blur", () => incidents.push({ type: "loss_of_focus", timestampMs: performance.now() }));
window.addEventListener("error", (e) => incidents.push({ type: "script_error", message: e.message, timestampMs: performance.now() }));

kaboom({ width: window.innerWidth, height: window.innerHeight });

// 3. CARGA DE ASSETS (Usa colores estáticos para los botones por simplicidad)
loadSprite("background", "assets/background.jpeg");
loadSprite("kud", "assets/kud.png");
loadSound("do", "assets/do.mp3");
loadSound("re", "assets/re.mp3");
loadSound("mi", "assets/mi.mp3");
loadSound("fa", "assets/fa.mp3");
loadSound("error", "assets/error.mp3");

const sessionData = {
    contractVersion: "1",
    taskId: "TG-02",
    configVersion: 1,
    state: "interrupted",
    device: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    },
    events: [], // Aquí guardaremos cada ronda completada
    incidents: incidents
};

// 4. ESCENA DE INTRODUCCIÓN MEJORADA
scene("intro", () => {
    add([ sprite("background", { width: width(), height: height() }), anchor("center"), pos(width()/2, height()/2) ]);
    
    // Oscurecer un poco el fondo para que resalte el personaje
    add([ rect(width(), height()), color(0, 0, 0), opacity(0.3), pos(0, 0) ]);
    
    add([ sprite("kud"), pos(width()/2, height()/2 + 30), anchor("center") ]);
    
    // Panel semi-transparente detrás del texto
    add([
        rect(500, 100, { radius: 20 }),
        color(0, 0, 0),
        opacity(0.6),
        pos(width()/2, height()/4),
        anchor("center")
    ]);

    // Texto con fuente mejorada y contorno
    add([ 
        text("¡Observa a Kud y\nrepite la secuencia!", { 
            size: 32, 
            align: "center",
            font: "sans-serif"
        }), 
        color(255, 255, 255),
        pos(width()/2, height()/4), 
        anchor("center") 
    ]);
    
    // Botón de inicio
    const btnStart = add([
        rect(200, 60, { radius: 30 }),
        color(255, 180, 50),
        outline(4, rgb(255, 255, 255)),
        pos(width()/2, height() - 100),
        anchor("center"),
        area(),
        "btn_start"
    ]);

    add([ text("JUGAR", { size: 24, font: "sans-serif" }), color(0, 0, 0), pos(width()/2, height() - 100), anchor("center") ]);
    
    onClick("btn_start", () => go("game"));
});

// 5. ESCENA PRINCIPAL (UI EN ARCO / PERSPECTIVA)
scene("game", () => {
    // 1. Fondo general
    add([ sprite("background", { width: width(), height: height() }), anchor("center"), pos(width()/2, height()/2) ]);
    add([ rect(width(), height()), color(0, 0, 0), opacity(0.3), pos(0, 0) ]); 

    // 2. Efecto de "Reflector" o Burbuja detrás del personaje
    add([
        circle(220), // Tamaño del haz de luz
        color(255, 255, 200), // Tono amarillento/verdoso claro
        opacity(0.15),
        pos(width()/2, height()/2 - 80),
        anchor("center")
    ]);

    // 3. Personaje (Kud) elevado un poco para dar espacio a los tambores
    add([ sprite("kud"), pos(width()/2, height()/2 - 80), anchor("center"), scale(0.6) ]);

    // Panel de estado (UI superior)
    add([ rect(300, 60, { radius: 15 }), color(0, 0, 0), opacity(0.7), pos(width()/2, 50), anchor("center") ]);
    const txtEstado = add([ text("Prepárate...", { size: 28, font: "sans-serif" }), color(255, 255, 255), pos(width()/2, 50), anchor("center") ]);

    // 4. NUEVA CONFIGURACIÓN: Disposición en Arco (Perspectiva) y colores de referencia
    const btnConfigs = [
        // Tambor Izquierdo (Amarillo) - Más alto y a los lados
        { btnId: 0, color: rgb(255, 200, 50), sound: "do", x: width()/2 - 300, y: height()/2 + 30 },
        // Tambor Centro-Izquierdo (Morado) - Más bajo y al centro
        { btnId: 1, color: rgb(130, 80, 200), sound: "re", x: width()/2 - 120, y: height()/2 + 180 },
        // Tambor Centro-Derecho (Rosa) - Más bajo y al centro
        { btnId: 2, color: rgb(255, 80, 150), sound: "mi", x: width()/2 + 120, y: height()/2 + 180 },
        // Tambor Derecho (Azul) - Más alto y a los lados
        { btnId: 3, color: rgb(50, 150, 255), sound: "fa", x: width()/2 + 300, y: height()/2 + 30 }
    ];

    const buttons = [];
    
    btnConfigs.forEach(conf => {
        const btn = add([
            // NOTA PARA EL FUTURO: Cuando tengas las imágenes de los tambores, 
            // cambia "circle(70)" por: sprite("nombre_de_tu_imagen_tambor")
            circle(80), 
            color(conf.color),
            outline(8, rgb(255, 255, 255)), // Contorno grueso para estilo cartoon
            pos(conf.x, conf.y),
            anchor("center"),
            area(),
            opacity(0.4), // Más apagados por defecto
            "simon_button",
            { btnId: conf.btnId, sound: conf.sound }
        ]);
        buttons.push(btn);
    });

    let sequence = [];
    let playerStep = 0;
    let isPlayerTurn = false;
    let strikes = 0;
    const MAX_STRIKES = 3;
    
    let currentTrialStartMs = 0;
    let currentTrialClicks = [];

    // Función de iluminación adaptada para el nuevo diseño
    const flashButton = async (targetId, delayMs = 500) => {
        const btn = buttons.find(b => b.btnId === targetId);
        btn.opacity = 1; // Brillo máximo
        btn.scale = vec2(1.15); // "Salta" un poco al sonar
        try { play(btn.sound); } catch(e) {}
        
        await wait(delayMs / 1000);
        
        btn.opacity = 0.4; // Vuelve a apagarse
        btn.scale = vec2(1);
        await wait(0.2);
    };

    const playSequence = async () => {
        isPlayerTurn = false;
        playerStep = 0;
        txtEstado.text = "¡Observa!";
        txtEstado.color = rgb(255, 200, 50);
        
        sequence.push(choose([0, 1, 2, 3]));
        
        await wait(1);
        
        for (let i = 0; i < sequence.length; i++) {
            await flashButton(sequence[i], 500);
        }
        
        txtEstado.text = "¡Tu turno!";
        txtEstado.color = rgb(50, 255, 50);
        currentTrialStartMs = performance.now();
        currentTrialClicks = [];
        isPlayerTurn = true;
    };

    onClick("simon_button", (btn) => {
        if (!isPlayerTurn) return;

        // Efecto visual inmediato al hacer clic
        btn.opacity = 1;
        btn.scale = vec2(0.9); // Se hunde ligeramente al presionarlo
        try { play(btn.sound); } catch(e) {}
        
        wait(0.15, () => {
            btn.opacity = 0.4;
            btn.scale = vec2(1);
        });

        const clickTimeMs = performance.now();
        currentTrialClicks.push(clickTimeMs);

        if (btn.btnId === sequence[playerStep]) {
            playerStep++;
            
            if (playerStep === sequence.length) {
                isPlayerTurn = false;
                
                sessionData.events.push({
                    trial: sequence.length,
                    span: sequence.length,
                    presentedAtMs: currentTrialStartMs,
                    respondedAtMs: clickTimeMs,
                    result: "hit",
                    sequence_target: [...sequence]
                });

                txtEstado.text = "¡Excelente!";
                txtEstado.color = rgb(255, 255, 255);
                wait(1.5, playSequence);
            }
        } else {
            isPlayerTurn = false;
            strikes++;
            try { play("error"); } catch(e) {}
            
            sessionData.events.push({
                trial: sequence.length,
                span: sequence.length,
                presentedAtMs: currentTrialStartMs,
                respondedAtMs: clickTimeMs,
                result: "error",
                sequence_target: [...sequence]
            });

            if (strikes >= MAX_STRIKES) {
                txtEstado.text = "¡Juego Terminado!";
                txtEstado.color = rgb(255, 50, 50);
                wait(2, endGame);
            } else {
                txtEstado.text = `Error. Vidas: ${MAX_STRIKES - strikes}`;
                txtEstado.color = rgb(255, 100, 100);
                sequence = []; 
                wait(2, playSequence);
            }
        }
    });

    const endGame = () => {
        sessionData.state = "completed";
        go("gameOver");
    };

    wait(1, playSequence);
});

// 6. ESCENA FINAL Y ENVÍO DE DATOS
scene("gameOver", () => {
    add([ sprite("background", { width: width(), height: height() }), anchor("center"), pos(width()/2, height()/2) ]);
    add([ text("¡Memoria Evaluada!", { size: 40 }), pos(width()/2, height()/2), anchor("center") ]);

    // Enviar resultados al Backend
    if (sessionId && launchToken) {
        fetch(`${apiBase}/task-sessions/${sessionId}/results`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${launchToken}` },
            body: JSON.stringify(sessionData)
        }).catch((err) => {
            incidents.push({ type: "network_submit_error", message: err.message, timestampMs: performance.now() });
            localStorage.setItem(`pending_session_${sessionId}`, JSON.stringify(sessionData));
        });
    }

    // Notificar al iframe padre
    window.parent.postMessage({ type: "GAME_OVER", payload: sessionData }, targetOrigin);
});

// Iniciar
go("intro");