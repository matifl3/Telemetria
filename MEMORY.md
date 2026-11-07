# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 completa (fases 0–13): `core` parsea `.acreplay` v16 multi-auto y
  `fast_lane.ai`, segmenta/clasifica vueltas, proyecta a `s`, arma la grilla y
  calcula curvas, sectores, agregados, comparación A/B, mapa y DTOs por pestaña.
  `cargo test --workspace` verde (122 tests). Fase 12 verificada por CDP (18/18).
- Fase 13: curvas calibradas en Monza (11), Imola (12), Spa (16) y Mugello (14)
  sin cambiar umbrales; guarda `t88` ampliada a `src-tauri/src` y `front/`;
  cero escrituras en runtime verificado (90 archivos y 24 directorios sin cambios).
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
  visibles = válidas REF; REF/B visibles, válidas y distintas.
- Fase 10: `dto` arma por pestaña; JSON en snake_case y todo número no finito
  viaja como `None`/`null`.
- Fase 12: el front solo dibuja DTOs; `renderPestanaActiva` cachea por
  `state.version`. Tauri embebe `front/` al compilar.
- Fase 13: no se tocan umbrales de curvas; los conteos de las 4 pistas son
  coherentes con la convención (chicanes partidas, dobles ápices ≤10 m unidos).
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- v1 declaraba `detectarCurvas` dos veces y ganaba la segunda (pestaña vacía).
  En v2 se repitió con `claseDelta` y se eliminó el duplicado de `curvas.js`.
- Tras editar `front/`, recompilar con `cargo build -p ac-telemetry-lab`: Tauri
  embebe los assets y recargar la WebView no alcanza.
- Verificación del front por CDP:
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
- Cero escrituras (T126): snapshot SHA256+tamaño+mtime de repo e inputs antes y
  después, cerrar con `CloseMainWindow()` (no kill) y comparar. Helper temporal
  en `%TEMP%\opencode\zero_write_check.ps1` (no versionado).
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- El toolchain MSVC ya funciona; no hace falta MinGW.
- Tauri convierte args snake_case a camelCase del lado JS (`numero_local` ->
  `numeroLocal`): mal nombrados dan "invalid args".
## Próximos pasos
- T123: checklist visual manual de los 32 paneles con un replay real.
