# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 en desarrollo: `core` parsea `.acreplay` v16 multi-auto y `fast_lane.ai`,
  segmenta/clasifica vueltas, proyecta a `s`, arma la grilla y calcula curvas,
  sectores, agregados, comparación A/B, mapa y DTOs por pestaña. Fases 0–11
  cerradas; `cargo test` verde (122 tests, 6 de integración Tauri). La fase 11
  se verificó manualmente con un driver CDP (WebView2 con
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<puerto>`)
  contra los replays reales de `Paquetes de telemetria/temp`: 29/29 chequeos +
  diálogo nativo y drag&drop confirmados con interacción del usuario.
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): datos solo en memoria por sesión.
  En Tauri nada en disco (ni ajustes); la constitución debe ser verificable.
- La constitución rige por encima de `AGENTS.md`; los offsets del `.acreplay`
  v16 son spec (`doc/FormatoTelemetria.md` manda sobre el código).
- Plan v2 (`spec/migracion-tauri-rust/plan.md`): alineación por arco `s` (no
  distancia recorrida), curvas una vez sobre el `.ai`, parser multi-auto, carga
  atómica replay+pista, "Conjunto" solo con el auto de la REF, uPlot vendorizado.
- Eje X v2: "Distancia de pista (m)" (cambio visible vs v1, aprobado).
- Pista inválida: cortado → `ArchivoTruncado`; `n` malo o coordenadas no
  finitas → `PistaInvalida`; sobrantes <72 B se ignoran.
- Fase 9: sesión atómica; REF = jugador con vueltas o primer válido + aviso;
  visibles = válidas REF; REF/B visibles, válidas y distintas; `Auto::vueltas`
  lo llena la sesión (el parser lo deja vacío).
- Fase 10: `dto` arma por pestaña; `VueltaAlineada` amplió canales (y, volante,
  marcha, acc_long/acc_total, yaw, carga, slip, gasolina); JSON en snake_case y
  todo número no finito viaja como `None`/`null`. `serde_json` solo para tests.
- Fase 11: lib de `src-tauri` como `rlib` (sin `cdylib`): el `ld` de MinGW falla
  con "export ordinal too large" al exportar todo. Tests en `tests/` (integración)
  porque `tauri-build` solo embebe el manifest en bins; el manifest se enlaza a
  los tests con `cargo:rustc-link-arg-tests`. `[lib] test=false` evita el harness
  de la lib sin manifest.
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces; gana la segunda y la
  pestaña queda vacía. No portar ese bug.
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- En esta máquina el linker MSVC no está disponible y el `link.exe` de Git rompe
  el toolchain por defecto: usar `cargo +stable-x86_64-pc-windows-gnu`.
- Para compilar Tauri usar el MinGW de CodeBlocks (ahora en
  `D:\Program Files\CodeBlocks\MinGW\bin` en `PATH`; el de `C:\` ya no existe y
  la WinLibs de `D:\herramientas` sigue incompleta: falla el dlltool de
  parking_lot). `CARGO_TARGET_DIR=C:\Users\matif\AppData\Local\Temp\opencode\telemetria-target`.
- Tauri convierte los arg de comandos snake_case a camelCase del lado JS
  (`numero_local` -> `numeroLocal`): pasar args mal nombrados da
  "invalid args", no un error del comando.
## Próximos pasos
- Fase 12: frontend (layout, uPlot vendorizado, avisos, selector de vueltas).
