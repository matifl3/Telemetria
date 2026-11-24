# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- v2 Tauri + Rust: `core` parsea replay v16/`fast_lane.ai` y calcula el análisis
  (`cargo test --workspace` en verde). `visualizador/` es legado.
- Front = **tablero** (en `main` desde v0.4.0; `spec/tablero/`, TB01–TB18 hechas):
  pestañas Tablero y Vueltas; 37 gráficos en un catálogo; Gridstack 14.1.1 vendorizado.
- Sin columna lateral (2026-11-24): el reproductor va en una línea junto a las pestañas
  (`.barra-vista`); «Lectura actual» y «Sesión» en la franja `#detalle-repro` que abre
  `⌄` (`state.reproductorExpandido`, arranca comprimido, no se guarda).
- Tarjetas: se redimensionan desde las 4 esquinas (`handles: 'ne, se, sw, nw'`); marcas
  en «L» visibles al pasar el mouse o con foco, siempre visibles en táctil.
- Datos solo en memoria; única excepción: diseño del tablero en `localStorage`
  (`ac-telemetry-lab.tablero.v1`, constitución §5 enmendada; test `t88_*`).
## Decisiones (y por qué)
- La constitución rige sobre `AGENTS.md`; `doc/FormatoTelemetria.md` manda sobre el parser.
- v2: alineación por arco `s`, "Conjunto" solo autos de la REF; eje X = distancia; no finitos = `null`.
- Jugador = auto 0 (`INDICE_JUGADOR`): `current_recording_index` es un frame, no un auto.
- Tiempos: jugador por `last_lap_time` de la vuelta siguiente; otros autos por reinicio
  de `current_lap_time`. Inválidas: un solo tramo o < 90 % del largo de la pista.
- Selección al cargar: 2 válidas más rápidas (REF = 1.ª, B = 2.ª). Vueltas: jugador primero.
- Tablero: cada gráfico se registra con `registrarGrafico` (`tablero/catalogo.js`):
  `uplot(datos)` → plots (regla de curvas + «Ver en grande» genéricos) o `montar(cuerpo…)`.
  El `id` es estable (se guarda). Datos por fuente con `puente.pedirPestana` (caché por
  versión + rot/alt). Sin chips: el usuario arma el tablero.
- B se elige en «Sesión» (franja del reproductor, `sel-b-global`) o en Vueltas.
- Expandido/comprimido del reproductor no se persiste: §5 solo cubre el diseño del tablero.
- «Trazada por vuelta» es un gráfico aparte de «Mapa de pista» (`unaPorVuelta`).
- En 1 columna (≤ 640 px) no se guardan posiciones: se conserva el diseño de escritorio.
- Diseño: respetar `DESIGN.md` / `.impeccable/design.json` (cian único acento) y la
  accesibilidad ya aplicada (diálogos con foco/Tab/Esc, targets ≥24 px, 32 en táctil).
- Colores de canvas/uPlot vía `COLOR.*` (utils.js); ruedas FL/FR/RL/RR con hex propios.
## Aprendizajes y errores a evitar
- Compilar: `cmd /c "call <vcvars64.bat> && cargo build -p ac-telemetry-lab"` (evita el
  `link.exe` de Git). vcvars en `D:\BuildTools\VC\Auxiliary\Build\` (si D: está) o en
  `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\`.
  Si C: está lleno, `--target-dir D:\herramientas\telemetria-target-msvc`.
- Si la app está abierta, `cargo run/build` falla con «Acceso denegado» al reemplazar el .exe.
- Tras editar `front/`, recompilar: el front va embebido. No correr `cargo fmt` (repo sin formatear).
- Release: subir versión en `tauri.conf.json`, `src-tauri/Cargo.toml` y `Cargo.lock`, tag
  `vX.Y.Z`, instalador con `cd src-tauri && npm ci && npx tauri build --bundles nsis`
  (sale en `target\release\bundle\nsis\`). `gh` no está instalado: release desde la web.
- Verificación por CDP: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`,
  `cargaArchivos.cargarDesdeRutas([replay, fast_lane])` (rutas con `/`) y `Page.captureScreenshot`.
- uPlot: `setScale`/`setSize` se aplican diferidos (leer en `requestAnimationFrame`).
- Tarjetas: cada una redibuja con su `ResizeObserver`; un canvas en panel oculto mide 0.
- Probar en la app con el diseño del usuario: guardarlo antes y restaurarlo al terminar.
- `[hidden]` no oculta si el CSS pone `display`. Al renombrar ids en `index.html`, revisar CSS.
- Tauri convierte args snake_case a camelCase (`numero_local` → `numeroLocal`).
- `core/tests/` comparten `soporte/`. No crear `docs/` (docs en `doc/`).
## Próximos pasos
- Replays de prueba (locales, no commitear): `Downloads/temp-20261108T163338Z-1-001/temp`
  (7 de Monza) y `Downloads/temp (1)-20261107T021753Z-1-001/temp (1)` (Misano).
- v0.4.0 publicada. v0.5.0 (reproductor en línea, esquinas, tokens de diseño): tag
  subido; falta instalador y publicar la release en GitHub.
- Pendientes manuales: TV06, T123, DIST02/DIST03; ING02–ING04, ING28, ING35, ING47.
- `spec/modificacion de pista/`: 14 tareas sin empezar.
