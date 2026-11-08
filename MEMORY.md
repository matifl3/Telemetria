# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 completa (fases 0–13): `core` parsea replay v16/`fast_lane.ai` y calcula
  el análisis; 123 tests verdes y fase 12 verificada por CDP.
- Curvas calibradas en Monza, Imola, Spa y Mugello; cero escrituras en runtime.
## Decisiones (y por qué)
- Sin persistencia: datos en memoria; Tauri no escribe datos ni ajustes.
- La constitución rige sobre `AGENTS.md`; `doc/FormatoTelemetria.md` manda sobre el parser.
- Plan v2: alineación por arco `s`, curvas cacheadas, parser multi-auto y carga
  atómica; análisis con replay/pista válidos y "Conjunto" solo para REF.
- Eje X v2: "Distancia de pista (m)" (cambio visible vs v1, aprobado).
- Pista inválida: cortado → `ArchivoTruncado`; `n`/coordenadas malas → `PistaInvalida`.
- Fase 9: sesión atómica; REF = jugador válido o primer fallback; REF/B válidas y distintas.
- Fase 10: `dto` arma por pestaña; números no finitos viajan como `None`/`null`.
- Fase 12: el front dibuja DTOs y cachea por `state.version`; Tauri embebe `front/`.
- Fase 13: umbrales sin cambios; conteos coherentes en 4 pistas (chicanes partidas,
  dobles ápices ≤10 m unidos).
- La carga ofrece botones separados para replay y pista en cualquier orden; drag-and-drop acepta lotes, y el análisis exige ambos.
- Pestaña Vueltas (TV01–TV08): jugador por `indice_jugador`; otros autos por
  `tiempo_s` ascendente. Solo válidas; REF/B y visibilidad por fila.
- Tiempos en `m:ss.mmm`; lista Vueltas muestra tiempo junto al nombre.
- Avisos de sesión se acumulan sin duplicados en el menú del encabezado; se limpian al resetear sesión o desde el panel.
## Aprendizajes y errores a evitar
- No crear `docs/`: las docs viven en `doc/`.
- `doc/PLAN_CURVAS.md` menciona scripts smoke inexistentes — no buscarlos.
- `detectarCurvas` se duplicó en v1 y `claseDelta` en v2; eliminar duplicados.
- Tras editar `front/`, correr `cargo build -p ac-telemetry-lab`; recargar WebView no alcanza.
- Verificación del front por CDP:
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
- Cero escrituras (T126): snapshot antes/después y cerrar con `CloseMainWindow()`.
- Los tests de `core/tests/` comparten `soporte/`; por eso lleva `#![allow(dead_code)]`.
- Tauri convierte args snake_case a camelCase (`numero_local` → `numeroLocal`).
- Círculos de tracción: filtrar canales alineados usando la grilla de
  `datosVuelta`; no reutilizar índices de muestras crudas de `mapa.trazas`.
- Mapa de mejores sectores: usar centro y banda de `fast_lane.ai` de base;
  las mejores trazadas del replay van superpuestas por sector.
- README actualizado para v2 Tauri + Rust; `visualizador/` es legado y el empaquetado sigue desactivado.
- Tarea `spec/distribucion/tareas.md`: primer release Windows en NSIS/GitHub Releases; updater queda para después.
- El aviso `referencia_fallback` se oculta en UI; la selección de REF de respaldo sigue igual.
- En Vueltas, el control global muestra todas las válidas o deja solo REF visible;
  mantener REF evita perder el acceso al análisis.
## Próximos pasos
- TV06: checklist manual de la pestaña Vueltas con un replay multi-auto
  (`spec/pestana-vueltas/tareas.md`); TV01–TV05, TV07 y TV08 ya están hechas.
