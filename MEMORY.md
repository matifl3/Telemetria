# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- v2 Tauri + Rust completa (fases 0–13): `core` parsea replay v16/`fast_lane.ai` y
  calcula el análisis; 133 tests (`cargo test --workspace`). `visualizador/` es legado.
- Datos solo en memoria por sesión; cero escrituras en runtime (T126).
- Curvas calibradas en Monza, Imola, Spa y Mugello.
## Decisiones (y por qué)
- La constitución rige sobre `AGENTS.md`; `doc/FormatoTelemetria.md` manda sobre el parser.
- Plan v2: alineación por arco `s`, parser multi-auto, carga atómica; "Conjunto" solo REF.
- Eje X: "Distancia de pista (m)". `dto` por pestaña; no finitos viajan como `null`.
- Pista inválida: cortado → `ArchivoTruncado`; `n`/coordenadas malas → `PistaInvalida`.
- Jugador = auto 0 (`INDICE_JUGADOR`): `current_recording_index` es un frame
  (≈`num_frames`), no un auto (verificado en 8 replays; `meta.indice_grabacion`).
- Tiempos: jugador por `last_lap_time` oficial de la vuelta siguiente; otros autos
  (sin `current_lap`/`last_lap_time`) se cortan por reinicio de `current_lap_time`
  y su tiempo es el reloj antes del reinicio.
- Inválidas: auto con un solo tramo, o vuelta < 90 % del largo del `fast_lane.ai`.
- Selección al cargar (RF-013): 2 válidas más rápidas; REF = 1.ª, B = 2.ª.
- Proyección deficiente: un único aviso total por replay. Avisos sin duplicados.
- Vueltas: jugador primero, otros por tiempo; el botón global deja siempre la REF.
- Pestaña "Vuelta" se muestra "Telemetría" (ids internos `vuelta` sin cambiar).
- Telemetría: sin marcas C1..Cn en los uPlot; las curvas se ven en una "regla de
  curvas" fija arriba (`dibujarReglaCurvas`, alineada a `u.over`) + lectura `ro-curva`.
- Mapa de Curvas: la etiqueta la pone solo `dibujarArcosCurvas` (como v1).
- Pestaña Mapa: posición en vivo (perdida en la migración; v1 `dibujarPosicion`) en
  una capa `capa-vivo` sobre cada mapa; al reproducir/scrub solo se repinta esa capa
  (`dibujarVivoMapa`). Solo en Mapa (decisión del usuario), no en Conjunto/Curvas.
- "Carga por rueda en vivo" = auto desde arriba + punto de balance con estela
  (`dibujarAutoCarga`; escala por vuelta REF en `escalaCarga`).
- Comparación "Delta por sector": barras como v1 (paridad) + delta final. Canvas 240 px.
## Aprendizajes y errores a evitar
- Tras editar `front/`, `cargo build -p ac-telemetry-lab`: el front va embebido.
- Verificación visual por CDP: lanzar con
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, cargar con
  `cargaArchivos.cargarDesdeRutas([replay, fast_lane])` y `Page.captureScreenshot`.
- uPlot: el 1.er gráfico nace más ancho (antes de la barra de scroll); igualar
  anchos tras crearlos. Canvas en panel oculto mide 0: redibujar con `ResizeObserver`.
- Si se renombra un id en `index.html`, revisar `estilos.css` (pasó con
  `#ch-minidelta`; canvas sin altura toma proporción 2:1 y queda gigante).
- Círculos de tracción: filtrar con la grilla de `datosVuelta`, no con `mapa.trazas`.
- Tauri convierte args snake_case a camelCase (`numero_local` → `numeroLocal`).
- `core/tests/` comparten `soporte/` (`#![allow(dead_code)]`).
- No crear `docs/` (las docs viven en `doc/`); `doc/PLAN_CURVAS.md` cita smoke
  scripts inexistentes.
- `kernel32.dll`, `node_modules/` y `.idea/` ya están ignorados en git.
## Próximos pasos
- Verificar a ojo "Delta por sector" y la pestaña Vueltas con un replay real.
- Replays de prueba (locales, no commitear): `Downloads/temp (1)-20261107T021753Z-1-001/temp (1)`
  (Misano) y `Downloads/temp-20261108T163338Z-1-001/temp` (7 de Monza).
- Pendientes manuales: TV06, T123 (paridad de 32 paneles), DIST02/DIST03.
- `spec/modificacion de pista/`: 14 tareas sin empezar.
