# MEMORY.md — AC Telemetry Lab
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya
aporte.
## Estado actual
- v1 funcionando: toma replays, toma la pista.ai y muestra los gráficos.
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución creada en `doc/constitucion.md` (6 principios) para la próxima
  versión en Rust + Tauri.
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
## Aprendizajes y errores a evitar
- No crear carpeta `docs/` paralela: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke que ya no existen — no buscarlos.
- `visualizador/app.js` declara `detectarCurvas` dos veces (1947 y 2171); por
  hoisting gana la segunda y la pestaña Curvas queda vacía. No portar ese bug.
## Próximos pasos
- Implementar la v2 según `spec/migracion-tauri-rust/plan.md`, en 6 fases
  (fundaciones → vueltas/proyección → análisis → Tauri → frontend → cierre).
- Desglose ejecutable en `spec/migracion-tauri-rust/tareas.md`: 127 tareas de
  <30 min con RF y condición de cierre.
- Migración a Tauri (front) + Rust (parseo y backend): **no implementada** aún.
- Al implementar, corregir RF-014/RF-015 del spec y documentar `fast_lane.ai`
  (principio 2: spec y código cambian juntos).
