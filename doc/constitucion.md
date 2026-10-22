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
5. **Sin persistencia** — nada se escribe en disco: los datos viven solo en memoria durante la sesión.
   *Verificable*: el binario no guarda archivos ni estado entre ejecuciones.
6. **Todo en español** — código, comentarios, mensajes de UI y nombres de archivo.
   *Verificable*: el inglés solo aparece cuando viene del formato original (`.acreplay`, CSP).
