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
  siempre se terminacen usando.
- La constitución (`doc/constitucion.md`) rige por encima de `AGENTS.md`.
- Los offsets del `.acreplay` v16 son spec: `doc/FormatoTelemetria.md` manda
  sobre los comentarios del código.
## Aprendizajes y errores a evitar
- No crear carpeta `docs/` paralela: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke que ya no existen — no buscarlos.
## Próximos pasos
- Migración a Tauri (front) + Rust (parseo y backend) planeada, **no
  implementada**: la constitución define las reglas de ese trabajo.
