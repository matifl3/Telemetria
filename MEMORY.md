# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- Datos solo por sesión (en memoria): al refrescar se pierde todo.
- Constitución en `doc/constitucion.md` (6 principios) para la v2 Rust + Tauri.
- v2 completa (fases 0–13): `core` parsea replay v16/`fast_lane.ai` y calcula
  el análisis; 133 tests (`cargo test --workspace`) y fase 12 verificada por CDP.
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
- Fase 13: umbrales de curvas sin cambios, coherentes en 4 pistas.
- La carga ofrece botones separados para replay y pista en cualquier orden; drag-and-drop acepta lotes, y el análisis exige ambos.
- Pestaña Vueltas (TV01–TV08): jugador = auto 0 (`INDICE_JUGADOR`); otros autos por
  `tiempo_s` ascendente. Solo válidas; REF/B y visibilidad por fila.
- Jugador = auto 0: `current_recording_index` es un frame (≈`num_frames`), no un auto
  (verificado en 8 replays reales; ahora `meta.indice_grabacion`).
- Tiempos: jugador por `last_lap_time` oficial de la vuelta siguiente; otros autos
  (sin `current_lap`/`last_lap_time`, valen 0) se cortan por reinicio de
  `current_lap_time` y su tiempo es el reloj antes del reinicio.
- Inválidas: auto con un solo tramo, o vuelta < 90 % del largo del `fast_lane.ai`.
- Selección al cargar (RF-013): 2 válidas más rápidas; REF = 1.ª, B = 2.ª.
- Proyección deficiente: un único aviso total por replay (no uno por vuelta).
- Gráficos uPlot sin marcas de curva C1..Cn (pedido del usuario); los numerales
  siguen solo en los mapas (`dibujarNumeralesCurvas`).
- Avisos de sesión se acumulan sin duplicados en el menú del encabezado; se limpian al resetear sesión o desde el panel.
## Aprendizajes y errores a evitar
- `kernel32.dll`, `node_modules/` y `.idea/` se colaron en git (revisión 2026-11-20); ya ignorados.
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
- README y `AGENTS.md` describen la v2 Tauri + Rust; `visualizador/` es legado. Bundle NSIS activado, instalación manual vía GitHub Releases.
- Vueltas: el botón global deja siempre la REF visible (si no, se pierde el análisis).
- El CSS de `front/` heredó selectores de v1: si se renombra un id en `index.html`,
  revisar `estilos.css` (pasó con `#ch-minidelta` → `#ch-mini-delta`; canvas sin
  altura toma proporción 2:1 y queda gigante).
- Comparación "Delta por sector": vuelve a barras como v1 (la spec exige paridad
  total); se conserva el delta final de v2 arriba a la derecha. Canvas 240 px.
## Próximos pasos
- Verificar a ojo "Delta por sector" y la pestaña Vueltas con un replay real (pendiente).
- Replays de prueba (locales, no commitear): `Downloads	emp (1)-...	emp (1)` (Misano)
  y `Downloads	emp-20261108...	emp` (7 de Monza).
- Tareas manuales pendientes: TV06 (flujo Vueltas multi-auto), T123 (paridad de
  los 32 paneles), DIST02/DIST03 (build reproducible e instalación).
- `spec/modificacion de pista/`: 14 tareas sin empezar.
