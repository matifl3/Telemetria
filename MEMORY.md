# MEMORY.md — AC Telemetry Lab
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya
aporte.
## Estado actual
- v1 funcionando: toma replays, toma la pista.ai y muestra los gráficos.
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución creada en `doc/constitucion.md` (6 principios) para la próxima
  versión en Rust + Tauri.
- v2 en desarrollo: `core` ya parsea `.acreplay` v16 (multi-auto) y
  `fast_lane.ai`. Fases 0–2 de `spec/migracion-tauri-rust/tareas.md` cerradas,
  `cargo test` verde (42 tests) y sin warnings.
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
- Pista: ancho **constante** (decisión de v1) con mediana **verdadera** de
  `(izq+der)/2`; solo cuentan los puntos con ambos lados válidos. El `id` de
  punto se lee y se descarta. `longitud_m` en `f64`.
- Errores de pista: archivo cortado → `ArchivoTruncado`; `n` fuera de rango o
  coordenadas no finitas → `PistaInvalida`. Sobrantes que no llenan el bloque de
  72 B se ignoran (no invalidan).
## Aprendizajes y errores a evitar
- No crear carpeta `docs/` paralela: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke que ya no existen — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces (1947 y 2171); por
  hoisting gana la segunda y la pestaña Curvas queda vacía. No portar ese bug.
- Los tests de `core/tests/` comparten `soporte/`; cada binario usa solo una
  parte, por eso el módulo lleva `#![allow(dead_code)]`.
## Próximos pasos
- Fase 3 (T31–T40): vueltas y clasificación (`vuelta`, `clasificacion`).
- Desglose ejecutable en `spec/migracion-tauri-rust/tareas.md`.
- Migración a Tauri (front) + Rust (parseo y backend): **no implementada** aún.
- Al implementar, corregir RF-014/RF-015 del spec y documentar `fast_lane.ai`
  (principio 2: spec y código cambian juntos).
