# MEMORY.md — AC Telemetry Lab
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya
aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 en desarrollo: `core` ya parsea `.acreplay` v16 (multi-auto) y
  `fast_lane.ai`, segmenta/clasifica vueltas y proyecta cada muestra a `s`.
  Fases 0–4 de `spec/migracion-tauri-rust/tareas.md` cerradas, `cargo test`
  verde (62 tests) y sin warnings.
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): los datos viven solo en memoria
  por sesión; hay que recargar los archivos cada vez. Regla dura en `AGENTS.md`.
- En la versión Tauri la prohibición se endurece: **nada** se escribe en disco
  (ni ajustes ni archivos recientes); todo en memoria durante la sesión. Motivo:
  la constitución debe ser cumplible y verificable, sin módulos "opt-in" que
  siempre se terminan usando.
- La constitución (`doc/constitucion.md`) rige por encima de `AGENTS.md`.
- Los offsets del `.acreplay` v16 son spec: `doc/FormatoTelemetria.md` manda
  sobre los comentarios del código.
- Plan de la v2 en `spec/migracion-tauri-rust/plan.md`. Decisiones cerradas:
  alineación por arco de pista (`s` sobre `fast_lane.ai`, no distancia
  recorrida), curvas detectadas una sola vez sobre el `.ai`, parser multi-auto,
  carga atómica replay+pista, "Conjunto" solo con el auto de la REF y uPlot
  vendorizado (sin CDN).
- El eje X de la v2 se rotula "Distancia de pista (m)": es un cambio visible
  respecto de v1, aprobado.
- Pista: ancho **constante** con mediana **verdadera** de `(izq+der)/2` (solo
  puntos con ambos lados válidos); el `id` se descarta; `longitud_m` en `f64`.
  Provisional: semianchos por punto quedaron para post-migración.
- Errores de pista: archivo cortado → `ArchivoTruncado`; `n` fuera de rango o
  coordenadas no finitas → `PistaInvalida`. Sobrantes que no llenan el bloque de
  72 B se ignoran (no invalidan).
- Fase 3: `clasificar_vueltas` agrupa por `VueltaId.auto` (mediana superior de
  v1); `cobertura_s_m` es el máximo `s`. Fase 4: `proyeccion` con ventana local
  de 64 puntos y respaldo global; error >20 m ⇒ hueco, >10 % ⇒
  `ProyeccionDeficiente`. `ajustar_meta` desenrolla, re-basa a 0 y deja `s` no
  decreciente; la clasificación no revive vueltas descartadas.
## Aprendizajes y errores a evitar
- No crear carpeta `docs/` paralela: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke que ya no existen — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces (1947 y 2171); por
  hoisting gana la segunda y la pestaña Curvas queda vacía. No portar ese bug.
- Los tests de `core/tests/` comparten `soporte/`; cada binario usa solo una
  parte, por eso el módulo lleva `#![allow(dead_code)]`.
## Próximos pasos
- Fase 5 (T49–T53): grilla común sobre `s` (`grilla`); desglose en
  `spec/migracion-tauri-rust/tareas.md`.
- Migración a Tauri (front) + Rust (parseo y backend): **no implementada** aún.
- Post-migración: plan B (semianchos por punto) y revisión del `fast_lane.ai`
  real del servidor en `spec/migracion-tauri-rust/tareas-post-migracion.md`.
