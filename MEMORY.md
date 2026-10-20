# MEMORY.md — AC Telemetry Lab
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no
aporte.
## Estado actual
- v1 funcionando: toma replays, toma la pista.ai y muestra los gráficos.
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
## Decisiones (y por qué)
- Sin persistencia (localStorage/IndexedDB): los datos viven solo en memoria
  por sesión; hay que recargar los archivos cada vez. Regla dura en `AGENTS.md`.
## Aprendizajes y errores a evitar
- (vacío por ahora)
## Próximos pasos
- Idea (no implementada): migrar front a Tauri y parseo/backend a Rust.

