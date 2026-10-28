# TG-02: Kud Dice — Minijuego de Evaluación Cognitiva

[![Proyecto UPTC](https://img.shields.io/badge/UPTC-Facultad%20de%20Ingenier%C3%ADa-gold)](#)
[![Población](https://img.shields.io/badge/Poblaci%C3%B3n-Grado%20Tercero-blue)](#)
[![Motor](https://img.shields.io/badge/Kaboom.js-v3000.1.17-brightgreen)](#)
[![Integración](https://img.shields.io/badge/Contrato%20MVP-v1-orange)](#)

Minijuego interactivo desarrollado con **Kaboom.js** y **Node.js** para la evaluación de la **memoria de trabajo visoespacial** en estudiantes de grado tercero del Colegio "San Diego" de Duitama, Boyacá (Proyecto UPTC). La tarea está basada en una adaptación del clásico **Corsi Block-tapping test** y "Simón Dice".

---

## 📋 Descripción y Fundamento Metodológico

La actividad digital **TG-02: Kud Dice** evalúa la capacidad del estudiante para retener y manipular información visoespacial a corto plazo. 

* **Mecánica Principal:** El personaje guía ("Kud") presenta una secuencia luminosa y sonora sobre un arreglo de 4 tambores. El estudiante debe observar atentamente y repetir la secuencia en el orden exacto.
* **Progresión (Span):** La secuencia inicia con 1 elemento. Por cada acierto, la longitud de la secuencia aumenta en 1 paso, incrementando la carga cognitiva.
* **Condición de Término:** El juego finaliza cuando el estudiante acumula 3 errores (strikes) o alcanza un límite máximo predefinido.
* **Uso Pedagógico:** Carácter puramente **complementario y no diagnóstico**. Sus resultados no establecen etiquetas clínicas, sino que aportan información descriptiva del desarrollo de las funciones ejecutivas para el seguimiento docente.

---

## 📁 Estructura del Repositorio

```text
tg-02-kud-dice/
├── backend/
│   ├── package.json
│   └── server.js               # Servidor Express de prueba local para ingesta de datos
└── frontend/
    ├── index.html              # Contenedor HTML del lienzo Canvas y scripts
    ├── game.js                 # Lógica principal del juego (Kaboom.js, interfaz en arco)
    ├── test_host.html          # Entorno de prueba de integración vía Iframe y postMessage
    ├── assets/                 # Recursos multimedia locales
    │   ├── background.png      # Fondo de bosque/nocturno con profundidad
    │   ├── kud.png             # Personaje guía Kud sin fondo
    │   ├── do.mp3              # Tono musical (Tambor 1)
    │   ├── re.mp3              # Tono musical (Tambor 2)
    │   ├── mi.mp3              # Tono musical (Tambor 3)
    │   ├── fa.mp3              # Tono musical (Tambor 4)
    │   └── error.mp3           # Efecto de sonido (Fallo/Strike)
    └── libs/
        └── kaboom.js           # Bundle local de Kaboom.js v3000.1.17
```

---

## 🛠️ Especificación Técnica y Mecánica del Juego

### 1. Interfaz Ergonómica (Disposición en Arco)
Para evitar la oclusión visual por parte del personaje central, los botones de interacción se organizan en forma de arco (semicírculo inferior), facilitando el escaneo visual de izquierda a derecha.

### 2. Feedback Multisensorial (Micro-interacciones)
* **Iluminación Visual:** El tambor activo aumenta su opacidad, brillo y escala (`zoom out`).
* **Respuesta Háptica Visual:** Al hacer clic, el botón reduce temporalmente su escala simulando el hundimiento de un tambor real.
* **Feedback Auditivo:** Asignación de tonos musicales distintos para cada botón, reforzando la memoria auditiva en conjunto con la visual.

### 3. Registro de Tiempos (Performance API)
* **`presentedAtMs`:** Marca temporal exacta en milisegundos donde termina de presentarse la secuencia generada por el motor.
* **`respondedAtMs`:** Marca temporal del instante en que el usuario completa su intento de secuencia haciendo su último clic.

### 4. Clasificación de Ensayos
* **`hit`:** El usuario replicó la secuencia de forma exacta y en el orden correcto.
* **`error`:** El usuario falló en al menos uno de los elementos o alteró el orden de la secuencia (Strike).

---

## 🔗 Contrato de Integración MVP (v1)

### Parámetros de Invocación por URL
Al igual que en el módulo TG-01, el juego se lanza dentro de un `<iframe>` y consume los siguientes Query Params:

```text
http://<host-juego>/index.html?sessionId=<ID>&token=<LAUNCH_TOKEN>&apiBase=<API_URL>&targetOrigin=<ORIGIN_PADRE>
```

### Estructura del Paquete JSON Enviado (`POST /api/v1/task-sessions/{sessionId}/results`)
El juego envía los resultados a través de la API y también emite un evento `postMessage` a la ventana padre.

```json
{
  "contractVersion": "1",
  "taskId": "TG-02",
  "configVersion": 1,
  "state": "completed",
  "device": {
    "viewport": "1280x800",
    "touch": true
  },
  "events": [
    {
      "trial": 1,
      "span": 1,
      "presentedAtMs": 4421.5,
      "respondedAtMs": 7751.4,
      "result": "hit",
      "sequence_target": [2]
    },
    {
      "trial": 2,
      "span": 2,
      "presentedAtMs": 9500.2,
      "respondedAtMs": 13200.1,
      "result": "error",
      "sequence_target": [2, 0]
    }
  ],
  "incidents": []
}
```

* **`span`**: Es el indicador neuropsicológico más valioso de este JSON; representa la capacidad máxima (o actual) de elementos retenidos por el estudiante en ese ensayo.

### Redundancia
Si falla el envío HTTP hacia `apiBase` debido a interrupciones en la conexión, se captura el evento como un incidente `network_submit_error` y el payload se resguarda en `localStorage` bajo la clave `pending_session_<sessionId>`.

---

## 🚀 Instalación y Despliegue Local

1. Asegúrate de tener **Node.js** (v18+) instalado.
2. Clona el repositorio y navega a la carpeta del juego.
3. Inicia un servidor web local estático en la carpeta `frontend`:

```bash
cd tg-02-kud-dice/frontend
npx http-server -c-1
```

### Simulación Rápida de Prueba

Para probar el flujo completo con datos simulados y evitar errores de CORS, visita la siguiente URL en tu servidor local (asegúrate de que el puerto sea `8080`):

```text
http://127.0.0.1:8080/index.html?sessionId=SESION-MEMORIA-TEST&token=DEMO&apiBase=http://localhost:3000/api/v1&targetOrigin=*
```

1. Juega hasta fallar 3 veces intencionalmente.
2. Presiona `F12`, ve a la pestaña **Application/Aplicación** -> **Local Storage**.
3. Verifica que la llave `pending_session_SESION-MEMORIA-TEST` contenga el JSON de resultados completo.