# Plan: detección y análisis de curvas desde el `.ai`

Estado: **diseñado para v2** (Tauri + Rust). En v1 la pestaña existe pero queda vacía
por el bug de `detectarCurvas` duplicada (ver aviso al final).
Ámbito v2: crate `core` (`curvas`), DTO de la pestaña Curvas y front `front/pestanas/curvas.js`.
Base: pista de referencia `fast_lane.ai` (Monza noDRS, `lfmv2`)

## Objetivo
Detectar las curvas de la pista a partir de la línea central del `.ai` y usarlas para:
- panel/tab **"Curvas"** con métricas por curva y por vuelta,
- **pintar/etiquetar el mapa** por curva (`C1..Cn`).

Pendiente (fase 2): **comparación por curva** entre dos vueltas (delta de tiempo y de `vMin`). → **Implementado** (ver §6).

Decisiones v2: la detección corre **una sola vez por pista** sobre `fast_lane.ai` y se
cachea en `Pista.curvas`; la numeración `C1..Cn` es estable y no depende de la vuelta ni
del auto. Cada arco por separado (sin unir chicanes); segundo umbral para curvas rápidas;
`.ai` obligatorio.

---

## 1. Detección (núcleo, geometría del `.ai`)

`detectarCurvas(env)` en `core/src/curvas.rs` (v2). En v1 vivía en
`visualizador/app.js`, junto a `parsearAi`; ver el aviso sobre la duplicación al final.

- Entrada: línea central `nx,nz` y distancia acumulada `ns` (del propio `.ai`: 3750 pts, paso ≈1,54 m, largo ≈5757 m). Si `ns` no es monótona, se recalcula el arco desde `nx,nz`.
- Rumbo `θ(s) = atan2(dz, dx)` desenrollado (sin saltos de 2π).
- Curvatura **con signo** `κ(s)=(θ[b]−θ[a])/(s[b]−s[a])` con ventana `±6` pts; radio `R = 1/|κ|`.
- Umbrales con histéresis: entra en curva cuando `R < R_CURVA=300`, sale cuando `R > R_RECTA=1200`; descarta arcos de largo `< CURVA_LARGO_MIN=20 m`.
- **Corte por cambio de sentido** dentro de la curva (chicane): si el signo de `κ` se invierte mientras `R < R_CURVA`, se cierra el arco y se abre el siguiente.
- Sentido: `dir = signo(Δθ)`; `dir>0` → **derecha**, `dir<0` → **izquierda**.
- Salida por arco: `{ i0, i1, apex, sIni, sApex, sFin, largo, rmin, dir, gir, nombre }`.

### Validación con Monza (11 arcos, coincide con los giros oficiales)
| # | s (m) | largo | Rmin | sentido | tramo |
|---|-------|-------|------|---------|-------|
| C1 | 899–950 | 50 | 24 | der | Rettifilo (1) |
| C2 | 950–1034 | 84 | 25 | izq | Rettifilo (2) |
| C3 | 1289–1779 | 490 | 272 | der | Curva Grande |
| C4 | 2099–2161 | 62 | 35 | izq | Roggia 1 |
| C5 | 2161–2232 | 71 | 42 | der | Roggia 2 |
| C6 | 2455–2673 | 218 | 82 | der | Lesmo 1 |
| C7 | 2816–2945 | 129 | 65 | der | Lesmo 2 |
| C8 | 3894–3983 | 90 | 66 | izq | Ascari 1 |
| C9 | 3989–4084 | 94 | 103 | der | Ascari 2 |
| C10 | 4097–4235 | 138 | 117 | izq | Ascari 3 |
| C11 | 5068–5483 | 414 | 81 | der | Parabólica |

Anclas verificadas: Curva Grande y Parabólica **derecha**; Ascari **L-R-L** (`izquierda-derecha-izquierda`).

Nota: el campo `[4]` del `AiPointExtra` correlaciona con la curvatura (r ≈ −0,857) pero su escala no es `1/R`; no se usa.

### Constantes (calibración sin tocar lógica)
`R_CURVA`, `R_RECTA`, `CURVA_LARGO_MIN` (arriba de `app.js`); ventana de curvatura `kw=6` dentro de `detectarCurvas`.

## 2. Mapeo de curvas al eje de distancia común (solo v1)

> **v1, no v2.** En v2 los gráficos, sectores, curvas y deltas usan directamente el arco
> de pista `s` sobre `fast_lane.ai`; no hay mapeo a una vuelta de referencia. Esta sección
> se conserva como historia del algoritmo que la v2 reemplaza.

El `.ai` mide ~5757 m y **no comparte origen de distancia con las vueltas** en v1.

`mapearCurvas(env, curvas, ref)` proyecta los límites de cada arco (`i0`, `apex`, `i1`) al punto más cercano de la línea central de la vuelta REF (`ref.grid.x/z`) y guarda `d0`, `dApex`, `d1` en distancia de `state.grid`. Maneja el cruce de la meta sumando `maxDist`.

`calcularCurvas(ref)` cachea el resultado por `ref.id | nombre .ai | maxDist` y se recalcula cuando cambia la REF o la pista. Se invoca desde `renderCurvas`.

## 3. Métricas por curva y por vuelta (`metricasCurva(l, c)` sobre `l.grid`)
- velocidad mínima (`vMin`) y en entrada (`vIni`), apex (`vApex`) y salida (`vFin`);
- tiempo dentro de la curva (`time[i1] − time[i0]`);
- punto de frenada (primer `brake > 0.45`) y de reaceleración (primer `throttle > 0.9` desde el apex);
- `rmin`, largo y `Δθ` de la geometría del arco.

## 4. UI (implementado)
- **Tab "Curvas"** en `index.html` (nav) + `panel-curvas`.
- `renderTabActiva` → `renderCurvas(laps)` (`app.js`); `activarTab` genérico por `data-tab`.
- `drawMapaCurvas`: vista top-down de la REF con cada arco coloreado (paleta) y etiqueta `C1..Cn` sobre el apex.
- `drawCurvasTiempos`: barras "tiempo por curva" (una barra por vuelta) + tooltip `tt-curvas`.
- `drawTractionCurvas`: un **círculo de tracción (g-g) por arco**, con escala común y color por vuelta. Orientación: **acelerador arriba, freno abajo, der derecha, izq izquierda**. El canvas es **cuadrado** (`aspect-ratio: 1/1`, `max-width: 240px`) y el dibujo usa `size = min(w,h)`, para que la circunferencia quede siempre redonda. Un `ResizeObserver` repinta al escalar la ventana.
- **Click en una tarjeta de tracción** → abre el overlay `#zoom-teorico` (reutilizado, con `zoomTeorico.modo='traccion'`) con el diagrama de esa curva **en grande**, con zoom (rueda) y paneo (arrastre). El título del overlay pasa a `Tracción · C# (sentido) · R# m`. Helper `pintarCirculoTraction` compartido entre el mini y el zoom.
- **Marcadores de slip** dentro de cada círculo: **triángulo ámbar** = rueda deslizando (spin) y **X roja** = rueda bloqueada. Se detecta con `slip_ratio` de las ruedas **delanteras** (los traseros vienen con outliers), clampeado a [−1, 1] y solo con `velocidad > 30 km/h`. Constantes: `SLIP_SPIN = 0.15`, `SLIP_LOCK = -0.3`, `SLIP_VEL_MIN = 30` (calibradas sobre 167k muestras de las 17 vueltas: el slip frontal rara vez supera ±0.1; ver §6). El `slip_ratio` lo lee `parsearReplay` del frame `.acreplay` en el offset **188** (4×`f16`: FL, FR, RL, RR), así los marcadores aparecen al cargar un replay.
- `renderTablaCurvas`: **una tarjeta por curva** (grid responsive `auto-fit minmax(340px,1fr)`); dentro, una **fila de tiles por vuelta** (v mín, v apex, T curva, freno, reaceleración) con marca del mejor tiempo.

## 5. Verificación

> **Aviso:** los scripts smoke nombrados abajo (`ai_smoke.js`,
> `smoke_visualizador.js`, `replay_e2e.js`, `delta_curvas_smoke.js`) **ya no existen** en el
> repo; no buscarlos. La verificación de la v2 es `cargo test` en `core` (ver
> `spec/migracion-tauri-rust/tareas.md`).

- `ai_smoke.js`: ancho constante, `env.ns`, nº de arcos = 11, orden creciente, Curva Grande y Parabólica derecha, Ascari L-R-L, mapeo identidad+monótono. `exit=0`.
- `smoke_visualizador.js`: sin regresiones nuevas (queda un `[FAIL] no hay rects de barras` preexistente, ajeno a curvas).
- `replay_e2e.js`: parsea el `.ai` real (11 arcos) + un `.acreplay` real → 17 vueltas, `grid.slipFL` poblado, marcadores presentes (spin/lock) y `renderTabActiva()` sin excepciones.
- `node --check` OK.

### Riesgos / decisiones
1. **Mapeo `s_ai → grid`** es lo más delicado (secciones casi paralelas / chicanes): se resolvió por proyección al punto más cercano de la REF. En chicanes los límites del intervalo pueden desplazarse unos metros.
2. **Curva Grande**: con `R_CURVA=300` entra como un único arco (largo ~490 m, Rmin ~272). No se parte en 2.
3. **Comparación por curva** (A/B): implementada en §6.

## 6. Comparación A/B por curva (fase 2)
- `deltaCurvas(A, B)` (`app.js`): para cada curva de `state.curvas`, cruza `metricasCurva(A,c)` vs `metricasCurva(B,c)` → `dT` (s), `dvMin`/`dvApex` (km/h), `dFren`/`dAcel` (m). **Positivo = A más lento / con más o menos velocidad según la métrica.**
- **Ventana = el arco `i0..i1`** (idéntica a `tCurva`): el tiempo ganado en la frenada/recta previa se atribuye al tramo anterior; por eso `Σ ΔT por curva ≠ Δ de vuelta`.
- UI (tab Curvas): selector A/B propio (`#sel-lap-b-curvas` + `#vs-a-curvas`, comparte `state.lapBId` con el tab Comparación) + barras de `ΔT` por curva (`drawBarrasDelta`, rojo = A pierde / verde = A gana) + tabla `C1..Cn` con columnas **ΔT, Δv mín, Δv ápex, Δ frenada, Δ reaceleración**, coloreadas verde (A mejor) / rojo (A peor) y con `title` explicando el signo. `renderDeltaCurvas(A, B)` se llama al final de `renderCurvas`.
- **Calibración de umbrales de slip** (§5): análisis de 167039 muestras con vel>30: pico de slip frontal p50=0.014, p90=0.035, p99=0.082, máx=0.349; mínimo p01=−0.098. Umbrales elegidos 0.15 / −0.30 (≈206 spin / ≈230 lock en 17 vueltas, balanceados). Distribución de marcadores: C3 spin 79, C6 21, C5 8, C7 7; lock C11 110, C4 15.
- No se toca el tab Comparación (sigue con los 3 sectores).

### Verificación
- `delta_curvas_smoke.js`: `deltaCurvas(A,A)` → todo 0; `deltaCurvas(A,B)` finito en las 11 curvas y con diferencias; `renderCurvas` sin excepciones; tabla y selector renderizados. `TODO OK`.


### Archivos afectados
- `visualizador/app.js`: `parsearAi` (guarda `ns`), `detectarCurvas`, `mapearCurvas`, `calcularCurvas`, `indicesCurva`, `sentidoCurva`, `metricasCurva`, `renderCurvas`, `drawMapaCurvas`, `drawCurvasTiempos`, `drawTractionCurvas`, `puntosDeCurva`, `pintarCirculoTraction`, `dibujarCirculoTraction`, `abrirZoomTraction`, `dibujarZoomTeorico` (rama tracción), `marcaTriangulo`, `marcaCruz`, `hoverCurvas`, `renderTablaCurvas`, `deltaCurvas`, `renderDeltaCurvas`, `drawBarrasDelta`, `tablaDeltaHTML`, `fmtDelta`, `claseDelta`, `poblarSelB`, `ocultarTooltip`, `state.curvas`, ALIAS/series/grid de `slipFL/FR/RL/RR`.
- `visualizador/index.html`: tab + panel "Curvas" (+ selector A/B y delta por curva).
- `visualizador/estilos.css`: `.curva-*`, `.traction-*`, `.tabla-delta`/`.delta-gana`/`.delta-pierde`.
- `delta_curvas_smoke.js` (temp de verificación): aserciones de `deltaCurvas`/render.

## 7. Deuda de v1 que la v2 corrige

`visualizador/app.js` declara `detectarCurvas` **dos veces** (aprox. líneas 1947 y 2171).
Por *hoisting* gana la segunda, que espera la grilla de una vuelta; `curvasBase(env)` le
pasa la pista, obtiene una lista vacía y la pestaña Curvas queda sin datos. La v2 tiene
**una sola implementación** sobre el `.ai` (ver `plan.md`, D-02) y un test de regresión
que falla si aparecen curvas vacías en una pista con curvas reales.
