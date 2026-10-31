# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 en desarrollo: `core` parsea `.acreplay` v16 multi-auto y `fast_lane.ai`,
  segmenta/clasifica vueltas, proyecta a `s`, arma la grilla y calcula curvas,
  sectores, agregados y comparación A/B. Fases 0–7 cerradas; `cargo test` verde
  (96 tests); clippy solo conserva warnings preexistentes.
  Monza real: 11 arcos, igual que `doc/PLAN_CURVAS.md`.
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): datos solo en memoria por sesión.
  En Tauri se endurece: nada en disco (ni ajustes ni recientes); motivo: la
  constitución debe ser cumplible y verificable, sin módulos "opt-in".
- La constitución rige por encima de `AGENTS.md`; los offsets del `.acreplay`
  v16 son spec (`doc/FormatoTelemetria.md` manda sobre el código).
- Plan v2 (`spec/migracion-tauri-rust/plan.md`): alineación por arco `s` (no
  distancia recorrida), curvas una vez sobre el `.ai`, parser multi-auto, carga
  atómica replay+pista, "Conjunto" solo con el auto de la REF, uPlot vendorizado.
- Eje X v2: "Distancia de pista (m)" (cambio visible vs v1, aprobado).
- Pista: ancho constante con mediana verdadera de `(izq+der)/2` (solo puntos con
  ambos lados válidos); `id` descartado; `longitud_m` en `f64`. Semianchos por
  punto quedan para post-migración.
- Errores de pista: cortado → `ArchivoTruncado`; `n` fuera de rango o
  coordenadas no finitas → `PistaInvalida`; sobrantes <72 B se ignoran.
- Fases 3–5: clasificación por auto (mediana superior de v1); proyección con
  ventana de 64 y respaldo global (>20 m ⇒ hueco, >10 % ⇒
  `ProyeccionDeficiente`); `ajustar_meta` desenrolla/re-basa y deja `s` no
  decreciente; grilla depende solo de `longitud_m` y no extrapola.
- Fase 6: detección única sobre el `.ai`, curvatura O(n) ±6 cíclica si cierra;
  histéresis 300/1200 m, unión ≤10 m, filtros largo ≥20 m y giro ≥0,1 rad;
  métricas y delta por arco sobre `s` (huecos = `NaN`).
- Fase 7: `alineado` remuestrea canales a la grilla; sectores fijos en `L/3` con
  último corte exacto en `L`; teórica = mejor sector de cada auto; `conjunto`
  filtra válidas del auto de la REF; deltas A−B por `s` (positivo = A más lento
  o valor mayor).
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces (1947 y 2171); gana la
  segunda y la pestaña queda vacía. No portar ese bug.
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
## Próximos pasos
- Fase 8 (T77–T80): bounds, transform 2D/3D, normal/banda y cache de mapa.
- Migración Tauri (front) + Rust: **no implementada** aún.
- Post-migración: semianchos por punto y revisión del `fast_lane.ai` real del
  servidor (`spec/migracion-tauri-rust/tareas-post-migracion.md`).
