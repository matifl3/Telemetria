# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 completa (fases 0–13): `core` parsea replay v16 y `fast_lane.ai`, segmenta
  vueltas y calcula curvas, sectores, agregados, A/B, mapa y DTOs; 123 tests
  verdes y fase 12 verificada por CDP (18/18).
- Fase 13: curvas calibradas en Monza, Imola, Spa y Mugello sin cambiar
  umbrales; cero escrituras en runtime (90 archivos y 24 directorios).
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): datos solo en memoria por sesión.
  En Tauri nada en disco (ni ajustes); la constitución debe ser verificable.
- La constitución rige por encima de `AGENTS.md`; los offsets del `.acreplay`
  v16 son spec (`doc/FormatoTelemetria.md` manda sobre el código).
- Plan v2 (`spec/migracion-tauri-rust/plan.md`): alineación por arco `s` (no
  distancia recorrida), curvas una vez sobre el `.ai`, parser multi-auto, carga
  individual o lote atómico, análisis solo con replay y pista válidos,
  "Conjunto" solo con el auto de la REF, uPlot vendorizado.
- Eje X v2: "Distancia de pista (m)" (cambio visible vs v1, aprobado).
- Pista inválida: cortado → `ArchivoTruncado`; `n`/coordenadas malas → `PistaInvalida`.
- Fase 9: sesión atómica; REF = jugador con vueltas o primer válido + aviso;
  visibles = válidas REF; REF/B visibles, válidas y distintas.
- Fase 10: `dto` arma por pestaña; JSON en snake_case y todo número no finito
  viaja como `None`/`null`.
- Fase 12: el front solo dibuja DTOs; `renderPestanaActiva` cachea por
  `state.version`. Tauri embebe `front/` al compilar.
- Fase 13: no se tocan umbrales de curvas; los conteos de las 4 pistas son
  coherentes con la convención (chicanes partidas, dobles ápices ≤10 m unidos).
- La carga ofrece botones separados para replay y pista en cualquier orden; drag-and-drop acepta lotes, y el análisis exige ambos.
- Pestaña Vueltas (TV01–TV08): dos secciones fijas; «Tus vueltas» usa
  `indice_jugador` (nunca el primer auto) en su orden, «Otros autos» va por
  `tiempo_s` ascendente. Solo vueltas válidas; REF/B por fila y ojo conservados.
- Tiempos de vuelta en formato `m:ss.mmm` en toda la app; la lista Vueltas
  muestra el tiempo a la derecha del nombre, en la misma línea.
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- v1 declaraba `detectarCurvas` dos veces y ganaba la segunda (pestaña vacía).
  En v2 se repitió con `claseDelta` y se eliminó el duplicado de `curvas.js`.
- Tras editar `front/`, recompilar con `cargo build -p ac-telemetry-lab`: Tauri
  embebe los assets y recargar la WebView no alcanza.
- Verificación del front por CDP:
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
- Cero escrituras (T126): snapshot antes/después de repo e inputs y cerrar con
  `CloseMainWindow()` (no kill).
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- Tauri convierte args snake_case a camelCase del lado JS (`numero_local` ->
  `numeroLocal`): mal nombrados dan "invalid args".
- El README documenta la v2 (Tauri + Rust); `visualizador/` es la v1 legada.
## Próximos pasos
- TV06: checklist manual de la pestaña Vueltas con un replay multi-auto
  (`spec/pestana-vueltas/tareas.md`); TV01–TV05, TV07 y TV08 ya están hechas.
