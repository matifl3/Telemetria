# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 en desarrollo: `core` parsea `.acreplay` v16 multi-auto y `fast_lane.ai`,
  segmenta/clasifica vueltas, proyecta a `s`, arma la grilla y calcula curvas,
  sectores, agregados, comparación A/B, mapa y DTOs por pestaña. Fases 0–10
  cerradas; `cargo test` verde (116 tests); clippy solo conserva warnings preexistentes.
  Monza real: 11 arcos, igual que `doc/PLAN_CURVAS.md`.
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): datos solo en memoria por sesión.
  En Tauri nada en disco (ni ajustes); la constitución debe ser verificable.
- La constitución rige por encima de `AGENTS.md`; los offsets del `.acreplay`
  v16 son spec (`doc/FormatoTelemetria.md` manda sobre el código).
- Plan v2 (`spec/migracion-tauri-rust/plan.md`): alineación por arco `s` (no
  distancia recorrida), curvas una vez sobre el `.ai`, parser multi-auto, carga
  atómica replay+pista, "Conjunto" solo con el auto de la REF, uPlot vendorizado.
- Eje X v2: "Distancia de pista (m)" (cambio visible vs v1, aprobado).
- Pista: ancho constante (mediana de `(izq+der)/2` con ambos lados válidos),
  `longitud_m` en `f64`; semianchos por punto quedan para post-migración.
- Pista inválida: cortado → `ArchivoTruncado`; `n` malo o coordenadas no
  finitas → `PistaInvalida`; sobrantes <72 B se ignoran.
- Fases 3–5: clasificación por auto (mediana superior); proyección con ventana
  de 64 y respaldo global (>20 m ⇒ hueco, >10 % ⇒ `ProyeccionDeficiente`);
  `ajustar_meta` deja `s` no decreciente; grilla solo por `longitud_m`.
- Fase 6: detección única sobre el `.ai`; curvatura O(n) ±6 cíclica si cierra;
  histéresis 300/1200 m, unión ≤10 m, filtros largo ≥20 m y giro ≥0,1 rad.
- Fase 7: alineado a la grilla; sectores en `L/3`; teórica = mejor sector;
  `conjunto` filtra válidas del auto REF; deltas A−B por `s` (positivo = A más
  lento o valor mayor).
- Fase 8: mapa mundo→2D (rotación x/z; elevación); bounds con banda+trazas;
  cache de una vista por visibles+proyección.
- Fase 9: sesión atómica; REF = jugador con vueltas o primer válido + aviso;
  visibles = válidas REF; REF/B visibles, válidas y distintas; `Auto::vueltas`
  lo llena la sesión (el parser lo deja vacío).
- Fase 10: `dto` arma por pestaña; `VueltaAlineada` amplió canales (y, volante,
  marcha, acc_long/acc_total, yaw, carga, slip, gasolina); JSON en snake_case y
  todo número no finito viaja como `None`/`null`. `serde_json` solo para tests.
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces; gana la segunda y la
  pestaña queda vacía. No portar ese bug.
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- En esta máquina el linker MSVC no está disponible y el `link.exe` de Git rompe
  el toolchain por defecto: usar `cargo +stable-x86_64-pc-windows-gnu`.
## Próximos pasos
- Fase 11 (T96–T103): capa Tauri (scaffold, comandos, capabilities, errores).
- Migración Tauri (front) + Rust: **no implementada** aún.
- Post-migración: semianchos por punto y revisión del `fast_lane.ai` real del
  servidor (`spec/migracion-tauri-rust/tareas-post-migracion.md`).
