# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2: `core` parsea `.acreplay` v16 multi-auto y `fast_lane.ai`, segmenta/clasifica
  vueltas, proyecta a `s`, arma la grilla y calcula curvas, sectores, agregados,
  comparación A/B, mapa y DTOs por pestaña. Fases 0–12 cerradas; `cargo test`
  verde (122 tests, 6 de integración Tauri). La fase 12 (frontend, T104–T122) se
  verificó con un driver CDP (18/18) sobre un replay real de Monza.
- Pendiente T123: checklist visual manual de los 32 paneles comparando v1 vs v2.
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
- Fase 10: `dto` arma por pestaña; `VueltaAlineada` amplió canales; JSON en
  snake_case y todo número no finito viaja como `None`/`null`.
- Fase 11: lib de `src-tauri` como `rlib` (sin `cdylib`); tests en `tests/`.
- Fase 12: el front solo dibuja DTOs; `renderPestanaActiva` pide la pestaña
  activa con caché por `state.version`. Tauri embebe `front/` al compilar.
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- v1 declaraba `detectarCurvas` dos veces y ganaba la segunda (pestaña vacía).
  En v2 se detectó el mismo patrón con `claseDelta` (`utils.js` y `curvas.js`)
  y se eliminó el duplicado de `curvas.js`.
- Tras editar `front/`, recompilar con `cargo build -p ac-telemetry-lab`: Tauri
  embebe los assets y recargar la WebView no alcanza.
- Verificación del front por CDP:
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- El toolchain MSVC ya funciona en esta máquina (Build Tools 2022 en
  `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`); no hace
  falta MinGW. `cargo +stable-x86_64-pc-windows-gnu test` también pasa.
- Tauri convierte los args snake_case a camelCase del lado JS
  (`numero_local` -> `numeroLocal`): mal nombrados dan "invalid args".
## Próximos pasos
- T123: checklist visual manual de los 32 paneles con un replay real.
- Fase 13: calibrar curvas (T124), `cargo test` + guardas (T125), verificar
  cero escrituras en runtime (T126), actualizar memoria/plan (T127).
