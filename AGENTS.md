# AGENTS.md

## Qué es esto

AC Telemetry Lab: app de escritorio (Tauri 2 + Rust) para analizar replays de
Assetto Corsa. Sin lint, sin tests de interfaz y sin CI; las pruebas son de
Rust (`core/tests/`, `src-tauri/tests/`).

## Stack y estructura
- `core/` — parser, modelo y cálculos en Rust. No depende de Tauri.
- `src-tauri/` — ventana, comandos (`comandos.rs`) y estado en memoria.
- `front/` — HTML/CSS/JS plano, sin build ni framework; uPlot vendorizado en
  `front/vendor/`. Tauri lo embebe tal cual.
- `visualizador/` — versión web anterior (v1). Solo referencia histórica: no
  se modifica ni forma parte de la app.

## Convenciones
- Todo en español: textos de UI, código, comentarios, docs y nombres de archivo.
- Código simple, nombres descriptivos y comentarios solo donde aporten.
- Diseño limpio y responsive; cualquier pantalla nueva debe verse bien en el móvil
  (ventana mínima 360 px).
- Los gráficos son canvas 2D + uPlot (`front/app/graficos/`); seguir los patrones
  existentes y registrarlo en `doc/Catalogo_Graficos.md`.

## Forma de trabajar
- Haz solo lo que se pide: no añadas funcionalidades por tu cuenta.
- Cambios pequeños y enfocados; no reescribas lo que ya funciona.
- Al terminar, resume qué has cambiado y cualquier decisión que deba revisar.

## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones
tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su
porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Ejecutar / verificar

- `cargo test --workspace` — debe quedar en verde antes de cerrar un cambio de lógica.
- `cargo run -p ac-telemetry-lab` — abre la app.
- Tras editar `front/`, recompilar (`cargo build -p ac-telemetry-lab`):
  recargar el WebView no alcanza.
- Chequeo rápido de sintaxis JS: `node --check front/app/<archivo>.js`.
- Requiere toolchain MSVC: si `link.exe` de Git aparece antes en el `PATH`,
  la compilación falla con `link: extra operand`.
- Test manual: cargar un replay + `fast_lane.ai` desde `Paquetes de telemetria/`
  (solo local, gitignored).

## Mapa del código

- Parseo: `parsear_replay` (`core/src/acreplay.rs`, v16) y `parsear_pista`
  (`core/src/pista.rs`, `fast_lane.ai`).
- Sesión y selección REF/B: `core/src/sesion.rs`; DTO por pestaña: `core/src/dto.rs`.
- Curvas: `detectar_curvas` / `metricas_curva` / `delta_curvas` (`core/src/curvas.rs`).
- Comandos Tauri: `src-tauri/src/comandos.rs`, registrados en `src-tauri/src/lib.rs`;
  el front los llama solo desde `front/app/puente.js` (args en camelCase).
- Front: `state` en `front/app/estado.js`; `renderPestanaActiva` e `init` en
  `front/app/main.js`; una pestaña por archivo en `front/app/pestanas/`.
- Constantes de calibración: `R_CURVA`, `R_RECTA`, … en `core/src/curvas.rs`;
  `GRID_*` en `core/src/grilla.rs`; `SLIP_*` en `front/app/estado.js`. Ajustar
  umbrales ahí; no tocar la lógica.

## Reglas duras

- Solo se parsea `.acreplay` **versión 16** (`VERSION_SOPORTADA`); cualquier otra
  versión da error por diseño.
- El archivo de pista (`fast_lane.ai`) es **obligatorio** para entrar al análisis:
  sin pista no hay detección de curvas ni mapas.
- Sin persistencia: los datos viven **solo en memoria, por sesión**. Nada se
  escribe en disco (ni `localStorage`).
- Al publicar una versión, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y
  `Cargo.lock` deben tener la misma versión (ver README).
- Nunca commitear: `*.acreplay`, `Paquetes de telemetria/`, `datos/`, `salida/`,
  `target/`, `node_modules/`, `.idea/` (ver `.gitignore`).
- Estilo de commits (de la historia): prefijo de tipo + resumen en español,
  p. ej. `visualizador: delta A/B por curva`, `fix: ...`, `chore: ...`.

## Límites
- ✅ Siempre: mantener los textos en español.
- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ✅ Siempre: todo fix de lógica llega con su test de regresión.
- ⚠️ Pregunta antes: crear archivos nuevos, cambiar el formato de los DTO.
- 🚫 Nunca: añadir frameworks de UI, un paso de build para el front o crates sin
  propósito claro.

## Docs como fuente de verdad

- `doc/constitucion.md` — los 6 principios innegociables (stack mínimo, spec
  manda, lógica aparte de la UI, tests, sin persistencia, idioma). Rige por
  encima del resto de este archivo: si una regla de acá contradice un
  principio, se cambia la regla.
- `doc/FormatoTelemetria.md` — offsets/layout de bytes del `.acreplay` v16.
  Confiar en él sobre los comentarios del código al cambiar el parser.
- `doc/PLAN_CURVAS.md` — algoritmo de detección de curvas y calibración de
  constantes. Las partes marcadas como v1 son históricas; sus scripts smoke
  ya no existen — no buscarlos.
- `spec/` — planes y tareas por funcionalidad (migración, Vueltas, distribución).
