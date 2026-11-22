# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 completa (fases 0–13): `core` parsea replay v16/`fast_lane.ai` y calcula
  el análisis; ~130 tests (`cargo test --workspace`) y fase 12 verificada por CDP.
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
- CSS (2026-11-21): colores/fuentes en variables de `:root`, `@media` juntos al final;
  canvas propios necesitan alto por CSS o su alto depende del ancho.
- Pestañas: flechas/Inicio/Fin (`iniciarTabs`); zona de carga resaltada al arrastrar (`.encima`).
- `PRODUCT.md` (2026-11-22, Impeccable init): usuarios piloto + coach/ingeniero,
  escritorio en sesiones largas; base para futuras tareas de diseño.
- `DESIGN.md` + `.impeccable/design.json` (2026-11-22): sistema "El muro de boxes";
  cian = único acento, resplandores del fondo son identidad (no extender), capas tonales
  + sombra suave. Pendiente: textos de ayuda a 11 px violan su propio mínimo de 12 px.
- Auditoría front (2026-11-22, 14/20) y arreglos aplicados el mismo día: overlay de zoom
  con foco/trampa Tab/Escape (`mostrarOverlayZoom`), tarjetas de tracción `role=button`,
  lectura ≥12 px, targets ≥24 px (32 con `pointer: coarse`), `touch-action: none` en mapas,
  títulos de tarjeta `<h2>`, colores de canvas vía `COLOR.*` (utils.js, lee `:root`).
- Ruedas FL/FR/RL/RR mantienen hex propios (categóricos, no semánticos): no pasarlos a `COLOR`.
- Overlay de zoom compartido (teórica/tracción): cada apertura fija su título, y `activo`
  solo lo pone `mostrarOverlayZoom` (si no, no guarda el foco previo).
- Esta PC ya no tiene MSVC (sin Visual Studio/Build Tools): `cargo build` no linkea.
## Aprendizajes y errores a evitar
- En esta PC, `link.exe` de Git tapa al de MSVC: `cargo test` falla con `extra operand`.
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
- El aviso `referencia_fallback` se guarda en el historial del encabezado, no se descarta.
- README y `AGENTS.md` describen la v2 Tauri + Rust; `visualizador/` es legado. Bundle NSIS activado, instalación manual vía GitHub Releases.
- Tarea `spec/distribucion/tareas.md`: primer release Windows en NSIS/GitHub Releases; updater queda para después.
- En Vueltas, el control global muestra todas las válidas o deja solo REF visible;
  mantener REF evita perder el acceso al análisis.
## Próximos pasos
- Tareas manuales pendientes: TV06 (flujo Vueltas multi-auto), T123 (paridad de
  los 32 paneles), DIST02/DIST03 (build reproducible e instalación).
- `spec/modificacion de pista/`: 14 tareas sin empezar.
