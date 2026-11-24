# MEMORY.md — AC Telemetry Lab
Memoria entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
## Estado actual
- v2 Tauri + Rust: `core` parsea replay v16/`fast_lane.ai` y calcula el análisis
  (`cargo test --workspace` en verde). `visualizador/` es legado.
- Front = **tablero** (rama `tablero/playground`, `spec/tablero/`, TB01–TB18 hechas):
  pestañas Tablero y Vueltas; 37 gráficos en un catálogo; Gridstack 14.1.1 vendorizado.
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
  versión + rot/alt, pedidos en paralelo compartidos). Sin chips: el usuario arma el tablero
  (los chips de la versión anterior se retiraron a pedido del usuario).
- B se elige en el bloque «Sesión» del lateral (`sel-b-global`) o en Vueltas.
- Leyendas de tarjetas con `etiquetaCorta` (`piloto · Vn`): el `car_id` no entra en tarjetas chicas.
- En 1 columna (≤ 640 px) no se guardan posiciones: se conserva el diseño de escritorio.
- Diseño: respetar `DESIGN.md` / `.impeccable/design.json` (cian único acento) y la
  accesibilidad ya aplicada (diálogos con foco/Tab/Esc, targets ≥24 px, 32 en táctil).
- Colores de canvas/uPlot vía `COLOR.*` (utils.js); ruedas FL/FR/RL/RR con hex propios.
## Aprendizajes y errores a evitar
- Compilar: `cmd /c "call <vcvars64.bat> && cargo build -p ac-telemetry-lab"` (evita el
  `link.exe` de Git). vcvars en `D:\BuildTools\VC\Auxiliary\Build\` (si D: está) o en
  `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\`.
- Tras editar `front/`, recompilar: el front va embebido. No correr `cargo fmt` (repo sin formatear).
- Verificación por CDP: lanzar con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`,
  cargar con `cargaArchivos.cargarDesdeRutas([replay, fast_lane])` y `Page.captureScreenshot`.
- uPlot: `setScale` y `setSize` se aplican diferidos (leer posiciones en `requestAnimationFrame`);
  al cambiar la escala recalcula el cursor con el píxel viejo: ignorarlo (`zoomAmpliadoEnCurso`).
- Tarjetas: cada una redibuja con su `ResizeObserver`; un canvas en panel oculto mide 0.
- `[hidden]` no oculta si el CSS pone `display`: agregar `[hidden] { display: none }`.
- Círculos de tracción: filtrar con la grilla de `datosVuelta`, no con `mapa.trazas`.
- Tauri convierte args snake_case a camelCase (`numero_local` → `numeroLocal`).
- `core/tests/` comparten `soporte/`. No crear `docs/` (docs en `doc/`).
- `gh` no está instalado: las releases se publican desde la web.
## Próximos pasos
- Replays de prueba (locales, no commitear): `Downloads/temp-20261108T163338Z-1-001/temp`
  (7 de Monza) y `Downloads/temp (1)-20261107T021753Z-1-001/temp (1)` (Misano).
- Tablero: falta PR a `main`; probar a mano Comparación sin B y con varios autos.
- Pendientes manuales: TV06, T123, DIST02/DIST03; ING02–ING04, ING28, ING35, ING47.
- `spec/modificacion de pista/`: 14 tareas sin empezar. Cambios en `main` sin release (v0.3.0).
