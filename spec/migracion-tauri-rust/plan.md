# Plan de implementación — Migración AC Telemetry Lab a Tauri + Rust (v2)

Documento de diseño previo a la implementación. No contiene código.

Fuentes normativas:
- `doc/constitucion.md` — 6 principios innegociables.
- `spec/migracion-tauri-rust/spec.md` — requisitos funcionales RF-001…RF-016.
- `doc/FormatoTelemetria.md` — offsets del `.acreplay` v16 (única fuente).
- `visualizador/app.js` + `visualizador/index.html` — inventario real de v1 a replicar.

---

## 0. Resumen ejecutivo

Se reescribe la app como Tauri + Rust en tres capas (`core` → `src-tauri` → `front`)
con paridad funcional sobre las 5 pestañas y 32 paneles de v1, más análisis
multi-auto.

Las cinco decisiones que ordenan todo el diseño:

1. **La pista es la coordenada común.** Cada muestra se proyecta sobre
   `fast_lane.ai` y se alinea por arco de pista `s`, no por distancia recorrida.
2. **Las curvas se detectan una sola vez sobre `fast_lane.ai`**, con numeración
   estable `C1..Cn`, independiente de la vuelta o del auto elegido.
3. **Se parsean todos los autos**; `current_recording_index` define la referencia y
   hay fallback al primer auto con vueltas válidas.
4. **La carga es atómica por lote**: replay y pista entran juntos o no entra ninguno.
5. **Cero persistencia**: `core` recibe bytes, no rutas; la app no escribe nada.

---

## 1. Principios que condicionan el diseño

| Principio | Consecuencia directa |
|---|---|
| 1. Stack mínimo | Front HTML/JS plano (sin framework ni build); `core` con `serde` como única dependencia; sin plugins de persistencia; uPlot vendorizado. |
| 2. El spec manda | Offsets solo desde `doc/FormatoTelemetria.md`; si código y spec divergen, se corrige el spec en el mismo cambio. Incluye documentar `fast_lane.ai`, hoy solo en comentarios. |
| 3. Lógica aparte de la UI | Todo cálculo en `core`; el front solo dibuja DTO ya calculados. `core` no depende de Tauri. |
| 4. Cada bug, su test | Todo fix de lógica entra con test de regresión; `cargo test` en verde antes de cerrar. |
| 5. Sin persistencia | `core` recibe `&[u8]`, no rutas: no puede escribir. La capa Tauri solo lee. Sin `store`, `sql`, `localStorage`. |
| 6. Todo en español | Módulos, structs, campos, mensajes y docs en español; se conservan literales del formato (`EXT_PERCAR_v6:`, `__AC_SHADERS_PATCH_v1__`). |

---

## 2. Inventario de paridad (qué hay que reproducir)

32 paneles en 5 pestañas. Es la lista de aceptación de "paridad total".

| Pestaña | Paneles / capacidades | Origen v1 |
|---|---|---|
| Vuelta | velocidad, rpm, marcha, volante, aceleración total, rumbo, carga por rueda (4 series), gas/freno por vuelta (un mini-gráfico por vuelta) | `renderVuelta` |
| Mapa | mapa con trazada + banda de pista, coloreado por canal (speed/throttle/brake/gear/y/accLat), marcadores de frenada y de cambios, 3D (rot/elevación), zoom/pan, auto en vivo, mini-mapa de zoom | `drawMap`, `pintarMapaCanal`, `pintarTrazada`, `drawMarcadoresRef`, `dibujarAutoCarga`, `ch-mapa-zoom` |
| Conjunto | barras de tiempos, velocidad media/máx, envolvente min/media/máx, histograma de velocidad, histograma de marchas, fuel por vuelta, desvío lateral vs REF, 3 sectores con tooltip, mapa por sectores, mapa de vuelta teórica, tabla resumen, vuelta teórica | `renderConjunto` + 12 funciones `draw*`/`render*` |
| Comparación | delta acumulado A−B, Δvelocidad, Δpedales, mini-delta por sector | `drawDelta`, `drawDVel`, `drawDPed`, `drawMiniDelta` |
| Curvas | mapa de curvas coloreadas, tiempo por curva, círculo de tracción por curva con marcadores de slip + zoom, tabla de métricas por curva, delta por curva (barras + tabla) | `renderCurvas` |

Datos derivados que deben existir en v2 (hoy en JS): `s` de pista por muestra,
resampleo lineal/vecino, `dt`, `accLong/accLat/accTotal`, `yaw` con fallback por
posiciones, normalización de pedales, `tiempoDeVuelta`, `clasificarVueltas`, curvas,
`sectorTimes`, métricas por curva y delta por curva.

**Único cambio visible respecto de v1:** el eje X y el readout "Distancia" pasan a ser
**distancia de pista** (`s` sobre `fast_lane.ai`), no la distancia recorrida por cada
vuelta.

---

## 3. Arquitectura

```
front/ (HTML + JS plano, uPlot local)
        │  invoke() → DTO JSON ya calculado
src-tauri/ (comandos + estado de sesión en memoria)
        │  llamadas Rust
core/ (parseo, modelo, cálculos, tests sin Tauri)
```

Regla de dependencia: `front → src-tauri → core`, nunca al revés. `core` no conoce
Tauri, rutas, ventanas ni el JSON de la UI (solo `serde` para DTO).

### 3.1 Módulos de `core` y RF que cubren

| Módulo | Responsabilidad | RF |
|---|---|---|
| `error` | `ErrorFormato { archivo, motivo, offset }`; catálogo de motivos en español; mensaje de UI | 001, 003, 006, 009 |
| `lector` | Cursor little-endian con límites: `u8/u16/u32/f32/f64/f16/str`, saltos con aritmética chequeada, detección de truncado | 001, 009, 012 |
| `acreplay` | Encabezado, salto de frames de objetos de pista, **recorrido de todos los autos**, frames de 256 B, relleno/wings, pie CSP | 001, 002, 005, 009, 012 |
| `pista` | Parser de `fast_lane.ai` (cabecera, puntos, bloque de 72 B con semianchos), validación y longitudes acumuladas | 006, 007, 011 |
| `vuelta` | Segmentación por `current_lap`, series por vuelta, canales derivados (dist, `dt`, g, yaw) | 004, 005, 011 |
| `proyeccion` | `s` de pista por muestra, detección de salidas de pista, unwrap de la meta | 011, 015 |
| `clasificacion` | `clasificarVueltas` por auto (salida/entrada/cortada/incompleta) con medianas y bordes propios del auto | 004, 005, 016 |
| `grilla` | Grilla común sobre `s` (0…longitud de pista), resampleo lineal/vecino | 013, 014, 015 |
| `curvas` | Detección **única** sobre la línea central del `.ai`, métricas por curva, delta por curva | 011, 015 |
| `sectores` | 3 sectores sobre `s`, tiempos por sector, vuelta teórica | 011 |
| `agregados` | Barras de tiempos, medias/máx, envolvente, histogramas, fuel, desvío lateral, tabla resumen | 011, 014 |
| `comparacion` | Delta acumulado A/B, Δvel, Δpedales, mini-delta por sector | 015 |
| `mapa` | Matemática de mapa: bounds, transform 2D/3D, normal de la traza, proyección y cache por vista | 011 |
| `sesion` | Estado en memoria, carga atómica, referencia y fallback, selección/visibilidad, avisos | 002, 003, 009, 010, 013, 014, 016 |
| `dto` | Structs `serde` de salida por pestaña; sin lógica | 012 |

### 3.2 Capa `src-tauri`

| Módulo | Responsabilidad | RF |
|---|---|---|
| `comandos` | `abrir_dialogo`, `cargar_archivos(rutas[])`, `cargar_pista(ruta)`, `datos_pestana(pestana, seleccion)`, `alternar_vuelta`, `fijar_referencia`, `fijar_b`, `limpiar_sesion` | 002, 003, 008, 009, 013, 014 |
| `estado_app` | `Mutex<Sesion>` en memoria; se reemplaza solo tras validación completa | 003, 009, 010 |
| `config_tarea` | Ventana, drag&drop, diálogo nativo; capabilities mínimas (lectura de archivos elegidos, sin escritura) | 008, 010 |

El parseo y la proyección corren en `spawn_blocking` para no bloquear la UI. Un evento
`carga_en_curso/fin` alimenta el spinner; no se agrega progreso por frame salvo que la
medición lo justifique.

### 3.3 Módulos del front

| Módulo | Responsabilidad |
|---|---|
| `main.js` | arranque, registro de pestañas, puente con `invoke` |
| `carga.js` | botón + drag&drop, mensajes de rechazo, estado "cargando" |
| `selector_vueltas.js` | lista por auto, etiqueta `piloto · car_id · Vn`, motivo, checkbox/eye, REF y B |
| `reproductor.js` | play/pausa/velocidad/loop/scrub y sincronización del cursor |
| `avisos.js` | banda de error/advertencia en español (`FALTA_PISTA`, fallback de auto) |
| `graficos/uplot.js` | wrapper de `lineChart`/`opcionesGrafico` (sync por clave, hooks de curvas) |
| `graficos/canvas.js` | `prepCanvas`, DPR, tooltips, zoom/pan |
| `pestanas/vuelta.js` | 7 paneles + mini-gráficos de pedales |
| `pestanas/mapa.js` | mapa, canales, marcadores, 3D, auto en vivo, zoom |
| `pestanas/conjunto.js` | 12 paneles agregados |
| `pestanas/comparacion.js` | 4 paneles A/B |
| `pestanas/curvas.js` | mapa, tiempos, tracción, tabla, delta |
| `vendor/` | uPlot fijado + licencia (D-15) |
| `estilos.css` | mismo diseño responsive; sin cambios de identidad |

Sin framework ni bundler: varios `.js` clásicos cargados por `<script>` en orden.

---

## 4. Modelo de datos

Unidades explícitas, nombres en español. Se guardan canales ya procesados, no frames
crudos (ver D-03).

```text
Sesion {
  replay: Option<Replay>,
  pista:  Option<Pista>,
  seleccion: Seleccion,        // ids de vueltas visibles, REF, B
  avisos: Vec<Aviso>,
}

Replay {
  meta: MetaReplay,
  autos: Vec<Auto>,            // todos los del archivo, en orden
  auto_referencia: Option<usize>,
}

MetaReplay {
  version: u32,                // == 16 (validado)
  intervalo_ms: f64,
  clima: String, pista: String, config_pista: String,
  indice_jugador: u32,         // current_recording_index
  frames_globales: u32,
  objetos_pista: u32,
}

Auto {
  indice: usize,
  car_id, piloto, nacion, equipo, skin: String,
  frames: u32, wings: u32,
  vueltas: Vec<Vuelta>,        // orden de recorrido
}

Vuelta {
  id: VueltaId { auto: usize, numero_local: usize },   // estable en la sesión
  numero: u8,                  // current_lap tal como viene
  etiqueta: String,            // "piloto · car_id · Vn"
  valida: bool,
  motivo: Motivo,              // Ninguno|Salida|Entrada|Cortada|Incompleta
  seleccionable: bool,         // = valida
  tiempo_s: f64, cobertura_s_m: f64, vel_media_mps: f64,
  muestras: Series,
  errores_proyeccion: usize,   // muestras descartadas por estar fuera de pista
}

Series {
  s: Vec<f64>,                 // arco de pista, monótono tras unwrap
  t_rel: Vec<f64>,             // tiempo relativo al inicio de la vuelta
  x, y, z: Vec<f32>,
  speed_kmh, rpm, steer, yaw: Vec<f32>,
  gas, freno: Vec<f32>,        // normalizados 0..1
  marcha: Vec<u8>,
  acc_long, acc_lat, acc_total: Vec<f32>,
  carga: [Vec<f32>; 4],        // FL, FR, RL, RR
  slip_ratio: [Vec<f32>; 4],
  slip_angle: [Vec<f32>; 4],   // se parsea; la UI no depende de él (spec §2.6)
  gasolina: Vec<f32>,
}

GrillaComun { paso_m: f64, longitud_pista_m: f64, s: Vec<f32> }
Alineada    { /* un Vec<f32> por canal de Series + marcha en u8, remuestreado por s */ }

Pista {
  nombre: String,
  nx, ny, nz, ns: Vec<f32>,    // ns = arco acumulado (se recalcula si no es válido)
  semiancho_izq, semiancho_der: Vec<f32>,
  longitud_m: f64,
  curvas: Vec<CurvaPista>,     // canónicas, en s de pista
}

CurvaPista {
  n: usize, s_ini, s_apex, s_fin, largo, radio_min, giro: f64,
  sentido: Izquierda|Derecha,
}

Seleccion { visibles: Vec<VueltaId>, ref_id: Option<VueltaId>, b_id: Option<VueltaId> }

Aviso { codigo: CodigoAviso, archivo: Option<String>, mensaje: String }
// CodigoAviso: VersionNoSoportada, ReplaySinVueltas, PistaInvalida,
// SinPista, ReferenciaFallback, ArchivoCorrupto, ExtensionNoSoportada,
// ProyeccionDeficiente

DatosPestana (enum de DTO): Vuelta | Mapa | Conjunto | Comparacion | Curvas
```

Invariantes:

1. Toda `Vuelta` de un mismo auto tiene series de igual longitud y la misma cantidad
   de canales.
2. `s` es monótona no decreciente dentro de la vuelta; un cruce de meta se resuelve
   con `unwrap` (sumar la longitud de pista).
3. `id` es estable durante la sesión; el color lo asigna la UI por orden, no el core.
4. `seleccion.ref_id` y `b_id` siempre apuntan a vueltas visibles y válidas.
5. `Pista` válida ⇔ `nx.len() >= 3`, longitudes coherentes y `longitud_m > 0`.
6. "Conjunto" agrega las vueltas válidas del **auto dueño de la REF**, no las de todos
   los autos.
7. Ningún DTO expone `NaN` como `null` ambiguo: `serde` con `Option<f32>` explícito.

---

## 5. Flujo de carga (contrato de atomicidad)

1. El usuario elige/arrastra N archivos. La capa Tauri clasifica por extensión
   (`.acreplay`, `.ai`); cualquier otra extensión aborta el lote.
2. Se leen los bytes y se construye una **sesión candidata** completa en memoria
   (parseo multi-auto + segmentación + proyección a `s` + clasificación + curvas).
3. Se valida el lote entero: versión, truncado, pista utilizable y al menos un auto con
   vueltas analizables.
4. Si algo falla: se descarta la candidata, se devuelve `Aviso` con archivo y motivo, y
   el estado anterior queda intacto (RF-009).
5. Si todo es válido: se reemplaza la sesión, se elige auto de referencia
   (`current_recording_index` válido con vueltas → si no, primer auto con vueltas y
   aviso) y se seleccionan por defecto solo sus vueltas válidas (RF-002/003/013).
6. La UI recibe un resumen (autos, vueltas, avisos) y pide el DTO de la pestaña activa.
7. Entrar al análisis exige replay **y** pista válida (RF-007); si falta la pista, se
   conserva el replay cargado y se muestra `FALTA_PISTA`.

**Atomicidad (P-01):** un lote que contiene replay + pista es atómico; si falla
cualquiera de los dos, no se aplica ninguno. Se permite cargar replay y pista en
acciones separadas, pero el análisis se habilita solo cuando ambos están válidos.

---

## 6. Decisiones justificadas

### D-01 — Curvas canónicas sobre `fast_lane.ai`, con numeración estable
**Decisión:** detectar los arcos una sola vez sobre la geometría de `fast_lane.ai`
(curvatura con histéresis, largo mínimo, giro mínimo, unión de dobles ápices) y expresar
sus límites en `s` de pista. La numeración `C1..Cn` no depende de la vuelta, del auto ni
de la visibilidad.
**Porqué:** RF-011 lo pide, es lo que declara la UI de v1 y es la única forma de
comparar A/B entre autos distintos (RF-015) sin renumerar al cambiar la REF.
**Alternativa descartada:** detectar sobre la grilla de la vuelta REF (algoritmo vigente
en `app.js:2171`). Cambiaría el número y los límites de las curvas al cambiar de auto o
de vuelta, y mezcla geometría de pista con estilo de conducción. El filtro por G lateral
de v1 se reemplaza por un **giro mínimo geométrico** acumulado, determinista e
independiente de la vuelta.

### D-02 — Una sola función de detección (deuda de v1)
**Decisión:** una única implementación O(n) sobre los puntos del `.ai`, calculada **una
vez por pista** al cargarla y cacheada en `Pista.curvas`. Sin segunda función, sin
recálculo por vuelta, sin desempate en runtime.
**Porqué:** `visualizador/app.js` declara `detectarCurvas` dos veces (líneas 1947 y
2171). Por hoisting gana la segunda, que espera `ref.grid`; `curvasBase(env)` le pasa la
pista y obtiene `[]`. Resultado: la pestaña Curvas de v1 queda vacía aunque el resto
funcione. v2 no debe replicar ese bug.
**Alternativa descartada:** portar ambas y elegir según el tipo de entrada. Dos fuentes
de verdad para el mismo concepto fueron la causa del bug.

### D-03 — Parsear todos los autos, guardando solo canales usados
**Decisión:** recorrer los frames de todos los autos; por auto retener las series
necesarias para las 5 pestañas (más `s` proyectado) y descartar el frame crudo de 256 B.
**Porqué:** RF-005/RF-013 exigen listar todos los autos y elegir el fallback de
referencia; guardar `Vec<CarFrame>` multiplica la memoria por autos y frames.
**Alternativa descartada:** parseo perezoso por auto. Obligaría a releer el archivo para
saber si "algún auto tiene vueltas" (RF-003) y para listar (RF-013), y complica la
atomicidad de RF-009.

### D-04 — Series derivadas en `core`, no en el front
**Decisión:** distancia, `s`, `dt`, aceleraciones, yaw con fallback, normalización de
pedales, grilla y resampleo se calculan en `core`.
**Porqué:** principio 3 y RF-012. `crearLap` de v1 mezcla cálculo con color y estado de
UI, lo que impide testearlo.
**Alternativa descartada:** devolver series crudas y calcular en JS (paridad literal con
v1). Duplica fórmulas y deja sin cobertura lo que el usuario ve.

### D-05 — Grilla común sobre `s` de pista
**Decisión:** la grilla es `s ∈ [0, longitud_pista]` con `GRID_PUNTOS_MAX` y
`GRID_PASO_MIN`; no depende de qué vueltas o autos estén cargados.
**Porqué:** con D-06 la coordenada común es la pista; la grilla no salta al
mostrar/ocultar vueltas y el delta entre autos es directamente comparable.
**Alternativa descartada:** grilla sobre la distancia recorrida máxima (v1). Hacía
saltar el eje X y los deltas al tocar un checkbox, y con autos distintos ni siquiera
representa el mismo punto físico.

### D-06 — Alineación por arco de pista (`s`), no por distancia recorrida
**Decisión:** cada muestra se proyecta sobre la línea central de `fast_lane.ai` y recibe
una `s`. Gráficos, delta, sectores y curvas usan `s`.
**Porqué:** es la única coordenada que identifica el mismo punto físico para dos autos con
trazadas distintas (RF-015). Las curvas ya viven en `s`, así que desaparece el mapeo por
vuelta y el riesgo de renumeración.
**Alternativa descartada:** distancia acumulada por vuelta (v1). Simple, pero dos autos
con líneas distintas comparan metros recorridos distintos en el mismo punto de pista; el
delta queda sesgado.
**Proyección eficiente:** punto más cercano con ventana local sobre el índice anterior
(O(n·w), sin crates nuevas) y búsqueda global de respaldo. Si el error supera el umbral
(constante calibrable, ~15–25 m), la muestra se marca fuera de pista: no se inventa una
`s` y queda como hueco (`null`) en el remuestreo. Si una vuelta supera cierto porcentaje
de muestras descartadas, se emite `ProyeccionDeficiente` y se trata como no analizable.
**Cruce de meta:** si `s` cae más de media pista respecto de la muestra anterior, se suma
`longitud_m` (unwrap) antes de comparar. Una vuelta que empieza antes de la meta y termina
después se re-basa a 0.
**Consecuencias:** eje X "Distancia de pista (m)"; `cobertura_s_m` reemplaza a la
distancia recorrida en la clasificación; corregir RF-015 y la sección 2 del spec en el
mismo cambio (principio 2).

### D-07 — DTO por pestaña bajo demanda
**Decisión:** al cargar se devuelve solo el resumen; cada cambio de pestaña/selección pide
un DTO con las series alineadas por `s` y los agregados de esa pestaña.
**Porqué:** evita serializar 25 canales × N puntos × vueltas cuando se mira una sola
pestaña; mantiene `core` como única autoridad de cálculo.
**Alternativa descartada:** un DTO gigante al cargar. Simple, pero multiplica memoria en
el webview y el coste de IPC en replays multi-auto.

### D-08 — Carga atómica por lote
**Decisión:** si un archivo del lote falla, no se aplica **ningún** cambio del lote.
Cargar replay y pista por separado sigue permitido; el análisis se habilita solo con
ambos válidos.
**Porqué:** RF-009 ("no aplicar cambios parciales") y criterio confirmado: solo se entra
cuando los dos parsean correctamente.
**Alternativa descartada:** commit por archivo (comportamiento v1: primero la pista,
después el replay). Deja estados mixtos y contradice el RF.

### D-09 — Sin modal previo de selección de vueltas
**Decisión:** cargar y luego aplicar la selección por defecto de RF-013 (solo vueltas
válidas del auto de referencia). El modal de v1 desaparece; la lista lateral permite
activar/desactivar cualquier vuelta (RF-014).
**Porqué:** el modal de v1 pregunta por un archivo y asume un solo auto; con N autos
bloquea el flujo y contradice el default explícito de RF-013.
**Alternativa descartada:** conservar el modal por paridad. Conflicto directo con RF-013 y
peor experiencia multi-auto.

### D-10 — Referencia: jugador, con fallback y aviso
**Decisión:** `auto_referencia = indice_jugador` si es válido y tiene ≥1 vuelta válida; si
no, primer auto (en orden del archivo) con vuelta válida, emitiendo
`ReferenciaFallback` con el nombre del auto. Si ningún auto tiene vueltas: rechazo total
`ReplaySinVueltas`.
**Porqué:** RF-002/RF-003. El aviso es parte del RF, no un extra.
**Alternativa descartada:** primer auto del archivo siempre. Ignora
`current_recording_index` y empeora la experiencia del jugador.

### D-11 — Clasificación independiente por auto
**Decisión:** medianas de cobertura, umbral del 90 % y velocidad de referencia de borde
se calculan **solo con las vueltas de ese auto**.
**Porqué:** RF-004. Mezclar autos produce falsos "salida/entrada/cortada" porque un auto
más lento corre la mediana.
**Alternativa descartada:** clasificar globalmente (una sola pasada). Falso positivo y
prohibido por el RF.

### D-12 — Números en `f64` para tiempo/`s`, `f32` para canales
**Decisión:** tiempo y arco de pista en `f64`; canales en `f32`. `current_lap_time` se
conserva como `u32` ms en el parser y se convierte a segundos al construir series.
**Porqué:** delta y `s` son sensibles a la precisión; los canales vienen de `f16`/`u8`,
donde `f32` sobra.
**Alternativa descartada:** todo `f32` (deriva visible en deltas largos); todo `f64`
(duplica memoria sin ganancia en canales de 8–16 bits).

### D-13 — Cursor con límites y errores tipados, nunca `panic`
**Decisión:** cada lectura valida límites y multiplicaciones (`checked_mul`); un archivo
truncado devuelve `ErrorFormato` con offset y motivo en español.
**Porqué:** RF-009/FO-007. Un panic cierra la app y pierde la sesión.
**Alternativa descartada:** indexado directo con `catch_unwind`. Los panics no son control
de flujo y el mensaje sería inútil.

### D-14 — `core` recibe bytes, no rutas
**Decisión:** la API de `core` es `parsear_replay(&[u8], &str) -> Result<...>`, sin
`std::fs`. Las rutas viven en `src-tauri`.
**Porqué:** principio 5 verificable por diseño y tests con fixtures en memoria
(principio 3).
**Alternativa descartada:** `core` abre archivos por ruta. Ahorra una copia, pero acopla a
E/S y permite escrituras accidentales.

### D-15 — uPlot vendorizado, versión fija
**Decisión:** copiar el build minificado de uPlot a `front/vendor/` (JS + CSS + licencia
MIT) y cargarlo con `<script>` local.
**Porqué:** una app de escritorio no debe depender de internet; no introduce build ni
`node_modules`; la versión queda fijada y reproducible.
**Alternativa descartada:** CDN de jsdelivr (como v1). Rompe la app sin conexión y la
versión puede cambiar sola.

### D-16 — Sin plugins de almacenamiento ni archivos de configuración
**Decisión:** sin `tauri-plugin-store`, `sql`, `fs` de escritura ni configuración. La
ventana se abre con valores fijos; no se recuerda tamaño, posición ni último directorio.
**Porqué:** RF-010 y principio 5.
**Alternativa descartada:** recordar tamaño de ventana o último directorio. Comodidad
mínima a cambio de romper un principio innegociable.

### D-17 — Pie CSP: se ignora de forma segura
**Decisión:** si existe el pie `__AC_SHADERS_PATCH_v1__`, se valida el offset/largo y se
descarta; no se descomprime ni se interpreta.
**Porqué:** ninguna capacidad de v1 (ni RF-011) usa `clutch`, `handbrake`, `wipers` ni los
extras de CSP; agregar `zlib` sería una dependencia sin propósito (principio 1).
**Alternativa descartada:** parsear los frames extra de 108 B. Añade crate y complejidad
para datos que la app no muestra.

### D-18 — "Conjunto" con las vueltas válidas del auto de referencia
**Decisión:** los 12 paneles agregados usan todas las vueltas válidas del **auto dueño de
la REF** (inicialmente el jugador; si no tiene, el primer piloto con vueltas). Si el
usuario cambia la REF a una vuelta de otro auto, "Conjunto" pasa a ese auto.
**Porqué:** evita mezclar autos con niveles distintos en estadísticas de consistencia,
fuel o vuelta teórica, que solo tienen sentido dentro de un mismo auto.
**Alternativa descartada:** agregar todas las vueltas válidas de todos los autos (v1).
Produce medias, envolventes y "vuelta teórica" mezclando autos. Requiere ajustar RF-014.

---

## 7. Riesgos y deudas detectadas

| # | Hallazgo | Impacto | Tratamiento |
|---|---|---|---|
| R-01 | `detectarCurvas` duplicada en `app.js` (1947 y 2171); la pestaña Curvas queda vacía | Paridad rota en v1; riesgo de portar el bug | D-02: una sola función + test de regresión |
| R-02 | v1 fija `jugador = 0` y hace `break` tras el primer auto | Multi-auto inexistente hoy | D-03: recorrer todos los autos; tests RF-002/005 |
| R-03 | Spec dice "detección desde `fast_lane.ai`" pero el algoritmo vigente usa la vuelta | Ambigüedad | D-01; alinear spec y código en el mismo cambio |
| R-04 | `slip_angle` viene en 0 en las pruebas (spec §2.6) | Paneles nuevos sobre eso serían planos | Parsear y exponer, sin construir paneles nuevos |
| R-05 | Frames CSP opcionales | Podrían desalinear el cursor si se interpretan mal | D-17: descartar el pie de forma segura; test con y sin CSP |
| R-06 | `current_lap` es `u8` y se repite tras 255 vueltas | Segmentación errónea en replays extremos | Segmentar por tramos contiguos y documentar el límite |
| R-07 | `numTrackObjects × numFrames` puede desbordar | Lectura fuera de rango o asignación enorme | Saltos con `checked_mul` + validación contra el buffer |
| R-08 | `fast_lane.ai` no está documentado en `FormatoTelemetria.md` (solo en comentarios) | Viola el principio 2 / RF-012 | Documentarlo: cabecera 4×i32, puntos de 20 B, bloque opcional de 72 B con semianchos en floats 6 y 7 |
| R-09 | Curvas cerca de la meta pueden partirse por el corte 0/longitud | Curva fantasma o faltante en el mapa | Arcos que cruzan la meta con `s_fin += longitud_m`; test específico |
| R-10 | Proyección a `s` en trompos/salidas fuertes | `s` no monótona o errónea | D-06: umbral de error, huecos y `ProyeccionDeficiente` |

---

## 8. Estrategia de tests

### 8.1 Niveles

1. **Unitarios de `core`** (sin Tauri, sin archivos reales): funciones puras y parsers
   contra fixtures construidos en memoria.
2. **Integración de `core`**: `Sesion` completa — cargar, fallback, alternar vueltas,
   consultar DTO.
3. **Regresión**: un test por cada bug corregido (principio 4), nombrado con el RF o el
   hallazgo (`r01_curvas_unicas`, `r02_multi_auto`, `r09_curva_en_meta`).
4. **Paridad manual**: checklist con un replay local (gitignored) comparando v1 vs v2
   panel por panel; no se commitean binarios.
5. **Guardas estáticas**: un test que falla si aparece `fs::write`, `File::create`,
   `OpenOptions` o `localStorage` en el código de producción.

### 8.2 Fixtures

- Constructor de bytes en `core/tests/soporte/`: encabezados, autos, frames de 256 B y
  `fast_lane.ai` sintéticos. Todo en Rust, sin binarios en el repo.
- Casos límite del formato: `f16` subnormal/∞/NaN, cadenas vacías, `num_wings = 0`,
  `extra_count = 0`, CSP presente/ausente, truncado en cada sección.
- Pista sintética: recta + curva de radio conocido + chicane + doble ápice + curva que
  cruza la meta.
- Smoke opcional `#[ignore]` que lee un replay real desde `AC_REPLAY_EJEMPLO`: no corre en
  CI ni exige datos en el repo.

### 8.3 Casos por requisito

| RF | Caso de test | Tipo |
|---|---|---|
| 001 | versión 15/17 → `VersionNoSoportada` con nombre de archivo; 16 → ok | unitario |
| 002 | `indice_jugador=2` de 5 autos → referencia = auto 2; índice ≥ `num_cars` → fallback; auto jugador sin vueltas → fallback + `ReferenciaFallback` | integración |
| 003 | todos los autos con 0 frames o todas las vueltas descartadas → `ReplaySinVueltas` y sesión previa intacta; jugador sin vueltas y otro con vueltas → carga + aviso | integración |
| 004 | 3 autos con escalas distintas: medianas y bordes por auto, sin falsos `salida/cortada` | unitario |
| 005 | etiqueta `piloto · car_id · Vn`; vueltas inválidas con motivo y `seleccionable=false` | unitario |
| 006 | `.ai` con n<3, truncado, longitudes incoherentes → `PistaInvalida`; pista previa conservada | unitario + integración |
| 007 | replay válido sin pista → no se entra; tras cargar pista → se entra | integración |
| 008 | (manual) diálogo nativo y drag&drop cargan ambos tipos | manual |
| 009 | lote replay+pista con pista corrupta → no se aplica nada; sesión previa intacta | integración |
| 010 | guarda estática: sin escrituras ni almacenamiento en código de producción | guarda |
| 011 | delta A/B, Δvel, Δpedales, sectores, delta por curva con valores calculados a mano; snapshots de los DTO | unitario |
| 012 | `core` compila y testea sin Tauri; cada offset documentado en el spec tiene su test | build + unitario |
| 013 | carga multi-auto → solo vueltas válidas del auto de referencia visibles | integración |
| 014 | activar vuelta de otro auto → aparece en las pestañas correspondientes; ocultarla → desaparece sin romper REF/B; "Conjunto" no mezcla autos | integración |
| 015 | A de un auto y B de otro → misma `s` en el mismo punto físico y delta alineado | unitario |
| 016 | auto sin vueltas válidas → sus vueltas listadas, no seleccionables | integración |

Casos propios de las decisiones nuevas:

| Tema | Caso | Tipo |
|---|---|---|
| Proyección | misma curva de la pista da la misma `s` para dos trazadas distintas (por dentro y por fuera) | unitario |
| Proyección | trompo/salida de pista → muestras descartadas como hueco, `s` no retrocede | unitario |
| Proyección | vuelta que cruza la meta → `unwrap` correcto, sin salto al final | unitario |
| Proyección | pista degenerada → `PistaInvalida`, nunca división por cero | unitario |
| Curvas | pista sintética: sin curvas fantasma, sin curvas reales faltantes, numeración `C1..Cn` estable al cambiar REF/visibilidad | unitario + regresión |
| Curvas | arco que cruza la meta: se conserva como una sola curva | regresión (R-09) |
| Grilla | `paso_m` respeta `GRID_PUNTOS_MAX` y `GRID_PASO_MIN`; grilla idéntica con distinta selección | unitario |
| Conjunto | cambiar la REF a otro auto → los agregados pasan a ese auto y no mezclan | integración |

### 8.4 Criterios numéricos y calibración

- Tolerancias: `1e-6` para igualdades derivadas, `1e-3` s para tiempos, `0.1` km/h para
  velocidades, un paso de grilla para `s`.
- Curvas: se acepta que el conteo difiera en ±1 respecto de v1 si y solo si (a) no
  aparece ninguna curva fantasma, (b) no falta ninguna curva real y (c) la numeración es
  estable entre autos y al cambiar REF. Se calibra con 2–3 pistas; los umbrales
  (`R_CURVA`, `R_RECTA`, `CURVA_LARGO_MIN`, giro mínimo, `CURVA_GAP`) se documentan en
  `doc/PLAN_CURVAS.md`.
- Estabilidad: cambiar REF o visibilidad **no** altera cantidad, orden ni límites de las
  curvas.

### 8.5 Definición de terminado

`cargo test` en verde, `core` sin Tauri, checklist manual de los 32 paneles con un replay
de ejemplo, cero escrituras verificadas por la guarda estática, spec actualizado
(`RF-014`, `RF-015`, `fast_lane.ai`) y mensajes en español revisados.

---

## 9. Matriz de trazabilidad

| RF | Módulos principales | Decisiones |
|---|---|---|
| 001 | `lector`, `acreplay`, `error` | D-13 |
| 002 | `acreplay`, `sesion` | D-03, D-10 |
| 003 | `sesion`, `clasificacion`, `error` | D-10 |
| 004 | `clasificacion` | D-11 |
| 005 | `acreplay`, `vuelta`, `sesion` | D-03 |
| 006 | `pista`, `error` | D-08 |
| 007 | `sesion`, `dto` | §5 |
| 008 | `src-tauri/comandos`, `front/carga.js` | §3.2 |
| 009 | `sesion`, `lector`, `error` | D-08, D-13 |
| 010 | `core` (sin fs), `src-tauri` (sin plugins) | D-14, D-16 |
| 011 | `curvas`, `sectores`, `agregados`, `mapa`, front pestañas | D-01, D-04, D-06 |
| 012 | todos los módulos de `core` | §3.1, R-08 |
| 013 | `sesion`, `grilla` | D-09, D-10 |
| 014 | `sesion`, `grilla`, `agregados` | D-05, D-18 |
| 015 | `proyeccion`, `grilla`, `comparacion`, `curvas` | D-06, D-12 |
| 016 | `clasificacion`, `sesion` | D-11 |

---

## 10. Orden de implementación

1. **Fundaciones:** `error`, `lector`, `acreplay` (multi-auto), `pista` + fixtures y
   tests de versiones/truncado (RF-001/006/009/012). Documentar `fast_lane.ai` (R-08).
2. **Vueltas y proyección:** `vuelta`, `proyeccion`, `clasificacion`, `grilla`, `sesion`
   (multi-auto, fallback, atomicidad) (RF-002/003/004/005/013).
3. **Análisis:** `curvas` (única), `sectores`, `agregados`, `comparacion`, `mapa`
   (RF-011/014/015/016), incluida la regresión de curvas (R-01) y de meta (R-09).
4. **Capa Tauri:** comandos, estado, diálogo, drag&drop, DTO por pestaña
   (RF-008/009/010/012).
5. **Frontend:** las 5 pestañas con los 32 paneles, selector multi-auto y reproductor
   (RF-011/013/014), uPlot vendorizado (D-15).
6. **Cierre:** checklist de paridad manual, guardas estáticas, `cargo test`, actualización
   de `doc/FormatoTelemetria.md`, `doc/PLAN_CURVAS.md` y del spec (`RF-014`, `RF-015`).

---

## 11. Ajustes de documentación en el mismo cambio

1. `doc/FormatoTelemetria.md`: agregar la sección de `fast_lane.ai` (cabecera 4×i32,
   puntos de 20 B, bloque opcional de 72 B con semianchos en floats 6 y 7).
2. `spec/migracion-tauri-rust/spec.md` RF-015: la alineación es por **arco de pista**
   (`s`), no por distancia recorrida.
3. `spec/migracion-tauri-rust/spec.md` RF-014 y §2: "Conjunto" agrega solo las vueltas
   válidas del auto de referencia; los demás autos se comparan en Vuelta, Mapa,
   Comparación y Curvas.
4. `doc/PLAN_CURVAS.md`: reemplazar la descripción del algoritmo por el vigente
   (detección sobre `.ai`), con los umbrales calibrados y la nota de que los scripts smoke
   nombrados allí no existen.
