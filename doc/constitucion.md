# Constitución — AC Telemetry Lab
App de escritorio Tauri + Rust. Principios innegociables: si una decisión los contradice, se cambia la decisión, no el principio.

1. **Stack mínimo** — sin framework de UI, sin paso de build propio, sin crates sin justificar.
   *Verificable*: el front es HTML/JS plano y `Cargo.toml` solo lista crates con propósito claro.
2. **El spec manda** — los offsets del `.acreplay` viven en `doc/FormatoTelemetria.md`.
   *Verificable*: todo campo leído está documentado; si el código y el spec divergen, se corrige el spec en el mismo cambio.
3. **Lógica aparte de la interfaz** — parseo y cálculos en un crate `core` que no depende de Tauri.
   *Verificable*: `core` compila y se testea sin Tauri; la UI solo recibe datos ya calculados.
4. **Cada bug, su test** — todo fix de lógica llega con test de regresión.
   *Verificable*: `cargo test` en verde antes de dar por cerrado el cambio.
5. **Sin persistencia de datos** — los datos de telemetría y del análisis viven solo en memoria durante la sesión. Única excepción: el **diseño del tablero** (qué gráficos hay, su posición, tamaño y ajustes) se guarda en el `localStorage` del WebView.
   *Verificable*: el binario no escribe archivos; `localStorage` solo contiene la clave del diseño, sin rutas, nombres de pilotos, tiempos ni datos del replay.
6. **Todo en español** — código, comentarios, mensajes de UI y nombres de archivo.
   *Verificable*: el inglés solo aparece cuando viene del formato original (`.acreplay`, CSP).
