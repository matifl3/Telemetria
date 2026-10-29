# Tareas de implementación — v2 (Tauri + Rust)

Desglose de `spec/migracion-tauri-rust/plan.md` en tareas de **menos de 30 minutos**,
ordenadas por dependencia. Cada tarea indica los RF del spec que cubre y una condición
de cierre verificable ("Hecho cuando").

Convenciones:
- Cada tarea asume completada la anterior, salvo que indique otra cosa.
- "Hecho cuando" debe poder comprobarse con un comando, un test nombrado o un checklist
  concreto; no es una revisión difusa.
- Las tareas marcadas **(manual)** no son automatizables: su cierre es un checklist.
- Tolerancias acordadas: `1e-6` en igualdades derivadas, `1e-3` s en tiempos,
  `0.1` km/h en velocidades, un paso de grilla en `s`.

Estimación: 127 tareas × ~20 min ≈ 42 h de trabajo enfocado.
Camino crítico: fases 1 → 5 (parser, pista, vueltas, proyección, grilla).

| Fase | Tareas | Contenido |
|---|---|---|
| 0 | T01–T04 | Documentación previa (spec y formato) |
| 1 | T05–T22 | Esqueleto y parser `.acreplay` |
| 2 | T23–T30 | Pista `fast_lane.ai` |
| 3 | T31–T40 | Vueltas y clasificación |
| 4 | T41–T48 | Proyección a `s` de pista |
| 5 | T49–T53 | Grilla común |
| 6 | T54–T64 | Curvas |
| 7 | T65–T76 | Sectores, agregados y comparación |
| 8 | T77–T80 | Matemática de mapa |
| 9 | T81–T88 | Sesión |
| 10 | T89–T95 | DTO |
| 11 | T96–T103 | Capa Tauri |
| 12 | T104–T123 | Frontend |
| 13 | T124–T127 | Cierre |

---

## Fase 0 — Documentación previa (RF-006, 011, 012, 014, 015)

- [x] **T01 · Documentar `fast_lane.ai` en `doc/FormatoTelemetria.md`** — RF-006/012 —
  *Hecho cuando:* hay una sección con cabecera 4×i32, puntos de 20 B y bloque opcional de
  72 B (semianchos en floats 6–7), y ningún offset usado por `parsearAi` queda sin
  documentar.
- [x] **T02 · Corregir RF-015 (alineación por `s`)** — RF-015 — *Hecho cuando:* el RF dice
  "arco de pista (`s`)" y ya no presenta la distancia recorrida como criterio.
- [x] **T03 · Corregir RF-014 y §2 (alcance de "Conjunto")** — RF-014 — *Hecho cuando:* el
  RF limita "Conjunto" al auto de la REF y nombra Vuelta/Mapa/Comparación/Curvas para el
  multi-auto.
- [x] **T04 · Actualizar `doc/PLAN_CURVAS.md`** — RF-011 — *Hecho cuando:* describe la
  detección sobre `.ai`, sus umbrales y advierte que los scripts smoke nombrados no
  existen.

## Fase 1 — Esqueleto y parser (RF-001, 002, 005, 009, 012)
 
- [x] **T05 · Crear workspace y crate `core`** — RF-012 — *Hecho cuando:*
  `cargo test -p core` compila y corre; `core/Cargo.toml` solo declara `serde`.
- [x] **T06 · Tipos de error en español** — RF-001/009 — *Hecho cuando:* el test
  `motivo_version_15_en_espanol` verifica mensaje con nombre de archivo y versión.
- [x] **T07 · `lector`: u8/u16/u32 con límites** — RF-001 — *Hecho cuando:* los tests de
  lectura y avance de posición pasan.
- [x] **T08 · `lector`: f32/f64** — RF-001 — *Hecho cuando:* test de round-trip de bytes
  little-endian.
- [x] **T09 · `lector`: f16** — RF-012 — *Hecho cuando:* test cubre normal, subnormal, ±∞
  y NaN.
- [x] **T10 · `lector`: `str` UTF-8** — RF-001/009 — *Hecho cuando:* test cubre cadena
  válida, vacía, >1 MB y truncada.
- [x] **T11 · `lector`: salto con `checked_mul`** — RF-009 — *Hecho cuando:* saltar fuera
  del buffer devuelve `ErrorFormato` con offset, sin panic.
- [x] **T12 · Test de truncado sistemático** — RF-009 — *Hecho cuando:* truncar un fixture
  en cada sección produce error tipado en todos los casos.
- [x] **T13 · Structs `MetaReplay`/`Auto`/`Replay`** — RF-002 — *Hecho cuando:* se
  construyen en un test y todos los campos tienen unidad documentada.
- [x] **T14 · Parsear encabezado y validar versión** — RF-001 — *Hecho cuando:* v16 acepta;
  v15 y v17 devuelven `VersionNoSoportada`.
- [x] **T15 · Saltar frames de objetos de pista** — RF-001 — *Hecho cuando:* con 2 objetos ×
  3 frames el primer auto se lee en la posición correcta.
- [x] **T16 · Encabezado por auto** — RF-002/005 — *Hecho cuando:* con 3 autos se leen
  `car_id`, piloto, nación, equipo, skin, frames y wings correctos.
- [x] **T17 · Frame de 256 B → canales crudos** — RF-005 — *Hecho cuando:* un frame con
  valores conocidos produce speed/rpm/marcha/gas/freno/volante/tiempo/carga/slip
  esperados.
- [x] **T18 · Avance entre frames, wings y `extra_count`** — RF-005 — *Hecho cuando:* con
  `wings=2` y `extra=1` el segundo frame se lee alineado.
- [x] **T19 · Pie CSP: detectar y descartar** — RF-009 — *Hecho cuando:* fixtures con y sin
  pie producen los mismos autos y vueltas.
- [x] **T20 · Recorrido de todos los autos** — RF-002/005 — *Hecho cuando:* fixture de 3
  autos devuelve `autos.len()==3` en el orden del archivo.
- [x] **T21 · Fixture builder de replay mínimo** — RF-001 — *Hecho cuando:* el helper genera
  bytes que el parser acepta de punta a punta.
- [x] **T22 · Fixture builder multi-auto parametrizado** — RF-002/005 — *Hecho cuando:*
  permite variar autos, frames, versión y wings sin tocar el parser.

## Fase 2 — Pista (RF-006, 007, 011)

- [x] **T23 · Parsear cabecera de `.ai`** — RF-006 — *Hecho cuando:* fixture de 5 puntos
  devuelve `n=5`.
- [x] **T24 · Parsear puntos (x, y, z, ns, id)** — RF-006 — *Hecho cuando:* test compara
  valores exactos del fixture.
- [x] **T25 · Bloque de 72 B y semianchos** — RF-006 — *Hecho cuando:* con semianchos 5 y 7
  el resultado es 6.
- [x] **T26 · Fallback sin bloque de 72 B** — RF-006 — *Hecho cuando:* el fixture sin bloque
  carga igual y usa semiancho por defecto.
- [x] **T27 · Validaciones de pista** — RF-006/007 — *Hecho cuando:* `n<3`, `n` fuera de
  rango y coordenadas no finitas devuelven `PistaInvalida`; un archivo cortado devuelve
  `ArchivoTruncado`.
- [x] **T28 · Longitud de pista y `ns` recalculado** — RF-011 — *Hecho cuando:* con `ns` no
  monótono se recalcula y `longitud_m` es mayor que 0.
- [x] **T29 · Fixture de pista circular cerrada** — RF-006 — *Hecho cuando:* el helper
  produce un `.ai` sintético válido y reutilizable.
- [x] **T30 · Tests de pista** — RF-006 — *Hecho cuando:* válida, inválida, con bloque y sin
  bloque pasan.

## Fase 3 — Vueltas y clasificación (RF-004, 005, 011, 016)

- [ ] **T31 · Segmentar por `current_lap`** — RF-005 — *Hecho cuando:* secuencia 1-2-2-3
  produce 3 segmentos con sus índices.
- [ ] **T32 · Series base y tiempo relativo** — RF-011 — *Hecho cuando:* `t_rel[0] == 0` y
  las longitudes coinciden con los frames del segmento.
- [ ] **T33 · `dt` robusto** — RF-011 — *Hecho cuando:* con saltos y valores inválidos todo
  `dt` es > 0 y usa el fallback.
- [ ] **T34 · Yaw: unwrap y fallback por posiciones** — RF-011 — *Hecho cuando:* con yaw
  todo cero se usa el rumbo calculado.
- [ ] **T35 · Aceleraciones long/lat/total con clamp** — RF-011 — *Hecho cuando:* un caso de
  aceleración constante da el valor esperado.
- [ ] **T36 · Normalizar pedales (1/100/255)** — RF-011 — *Hecho cuando:* las tres escalas
  quedan en 0..1.
- [ ] **T37 · `tiempoDeVuelta` y cobertura** — RF-004 — *Hecho cuando:* devuelve el último
  tiempo válido y el máximo `s` de la vuelta.
- [ ] **T38 · `clasificarVueltas` por auto** — RF-004 — *Hecho cuando:* con 3 autos, medianas
  y bordes se calculan por separado.
- [ ] **T39 · Motivos y `seleccionable`** — RF-005/016 — *Hecho cuando:* salida, entrada,
  cortada e incompleta se asignan y las inválidas quedan no seleccionables.
- [ ] **T40 · Etiqueta `piloto · car_id · Vn`** — RF-005 — *Hecho cuando:* el test compara la
  cadena exacta.

## Fase 4 — Proyección a `s` (RF-015)

- [ ] **T41 · API `proyectar(pista, x, z, idx_previo)`** — RF-015 — *Hecho cuando:* un punto
  sobre la línea central da error 0 y devuelve su `s`.
- [ ] **T42 · Ventana local + respaldo global** — RF-015 — *Hecho cuando:* en una trayectoria
  sintética acierta todos los puntos y un contador demuestra menos comparaciones que el
  barrido completo.
- [ ] **T43 · Umbral de error y muestras como hueco** — RF-015 — *Hecho cuando:* un punto a
  100 m de la pista queda marcado y sin `s`.
- [ ] **T44 · Unwrap de meta y rebase a 0** — RF-015 — *Hecho cuando:* una vuelta completa
  termina con `s` monótona y arranca en 0.
- [ ] **T45 · `ProyeccionDeficiente`** — RF-015 — *Hecho cuando:* superar el porcentaje de
  muestras descartadas emite el aviso y la vuelta no es analizable.
- [ ] **T46 · Test: dos trazadas, misma `s`** — RF-015 — *Hecho cuando:* una línea por
  dentro y otra por fuera de la misma curva difieren en `s` menos que un paso de grilla.
- [ ] **T47 · Test: trompo y salida de pista** — RF-015 — *Hecho cuando:* `s` no retrocede y
  aparecen huecos donde corresponde.
- [ ] **T48 · Test: cruce de meta** — RF-015 — *Hecho cuando:* no hay salto mayor a media
  pista en ningún punto.

## Fase 5 — Grilla común (RF-013, 014, 015)

- [ ] **T49 · Grilla sobre longitud de pista** — RF-015 — *Hecho cuando:* respeta
  `GRID_PUNTOS_MAX`/`GRID_PASO_MIN`, empieza en 0 y termina en la longitud.
- [ ] **T50 · Resampleo lineal por `s`** — RF-015 — *Hecho cuando:* una serie lineal se
  reproduce con error < 1e-6.
- [ ] **T51 · Resampleo por vecino para marcha** — RF-015 — *Hecho cuando:* los escalones de
  marcha se conservan.
- [ ] **T52 · Huecos sin extrapolar** — RF-015 — *Hecho cuando:* fuera de rango el valor es
  `None`, nunca el primero/último repetido.
- [ ] **T53 · Test: grilla estable ante selección** — RF-013/015 — *Hecho cuando:* mostrar u
  ocultar vueltas deja la grilla idéntica.

## Fase 6 — Curvas (RF-011, 015)

- [ ] **T54 · Curvatura O(n) sobre `.ai`** — RF-011 — *Hecho cuando:* en un círculo
  sintético de radio R, κ ≈ 1/R dentro de tolerancia.
- [ ] **T55 · Histéresis `R_CURVA`/`R_RECTA`** — RF-011 — *Hecho cuando:*
  recta-curva-recta produce exactamente un arco.
- [ ] **T56 · Unión de dobles ápices (`CURVA_GAP`)** — RF-011 — *Hecho cuando:* dos tramos
  del mismo sentido a 10 m producen una sola curva.
- [ ] **T57 · Filtros de largo y giro, y sentido** — RF-011 — *Hecho cuando:* un arco corto
  se descarta y el sentido (izq/der) es el correcto.
- [ ] **T58 · Numeración `C1..Cn` y cache en `Pista`** — RF-011 — *Hecho cuando:* se calcula
  una sola vez (contador de llamadas = 1) y numera en orden de recorrido.
- [ ] **T59 · Curva que cruza la meta** — RF-011 — *Hecho cuando:* un arco sobre `s=0` queda
  como una sola curva con `s_fin > longitud`.
- [ ] **T60 · Tests de curvas sintéticas** — RF-011 — *Hecho cuando:* no hay curvas fantasma
  ni faltantes en la pista de prueba.
- [ ] **T61 · Test de estabilidad REF/visibilidad** — RF-011/015 — *Hecho cuando:* cambiar la
  REF no altera cantidad, orden ni límites de las curvas.
- [ ] **T62 · Métricas por curva** — RF-011 — *Hecho cuando:* `vMin`, `vIni`, `vApex`,
  `vFin`, `tCurva`, `dFren` y `dAcel` coinciden con un caso calculado a mano.
- [ ] **T63 · Delta por curva** — RF-015 — *Hecho cuando:* la diferencia de tiempos por arco
  coincide con el caso de prueba.
- [ ] **T64 · Tests de métricas y delta** — RF-011/015 — *Hecho cuando:* los valores
  conocidos pasan con las tolerancias acordadas.

## Fase 7 — Sectores, agregados y comparación (RF-011, 014, 015)

- [ ] **T65 · Sectores sobre `s`** — RF-011 — *Hecho cuando:* los 3 sectores suman el tiempo
  de vuelta.
- [ ] **T66 · Vuelta teórica** — RF-011 — *Hecho cuando:* suma el mejor tiempo de cada sector
  y calcula el potencial a ganar.
- [ ] **T67 · Barras de tiempos y delta vs mejor** — RF-011 — *Hecho cuando:* el orden es
  mejor→peor y el delta por vuelta es correcto.
- [ ] **T68 · Velocidad media/máx y envolvente** — RF-011 — *Hecho cuando:* la envolvente
  devuelve min/media/máx por punto de la grilla.
- [ ] **T69 · Histogramas de velocidad y marcha** — RF-011 — *Hecho cuando:* la suma de las
  barras equivale a las muestras válidas.
- [ ] **T70 · Fuel y desvío lateral** — RF-011 — *Hecho cuando:* el consumo por vuelta y la
  separación lateral vs REF son correctos.
- [ ] **T71 · Tabla resumen** — RF-011 — *Hecho cuando:* tiene las 9 columnas de v1 y el
  delta al mejor.
- [ ] **T72 · "Conjunto" limitado al auto de la REF** — RF-014 — *Hecho cuando:* al poner una
  REF de otro auto, los agregados pasan a ese auto y no mezclan.
- [ ] **T73 · Delta acumulado A/B** — RF-015 — *Hecho cuando:* A vs A da 0 y el signo es
  correcto.
- [ ] **T74 · Δvelocidad y Δpedales** — RF-015 — *Hecho cuando:* coinciden con el caso
  calculado a mano.
- [ ] **T75 · Mini-delta por sector** — RF-015 — *Hecho cuando:* la suma de los 3 mini-deltas
  es coherente con el delta acumulado.
- [ ] **T76 · Test A/B de autos distintos** — RF-015 — *Hecho cuando:* en la misma `s` el
  delta es el esperado entre dos autos.

## Fase 8 — Matemática de mapa (RF-011)

- [ ] **T77 · Bounds y transform 2D** — RF-011 — *Hecho cuando:* los puntos extremos caen
  dentro del canvas con margen.
- [ ] **T78 · Transform 3D con rotación/elevación** — RF-011 — *Hecho cuando:* la proyección
  es determinista y cambia al rotar.
- [ ] **T79 · Normal de la traza y banda** — RF-011 — *Hecho cuando:* la banda es simétrica
  respecto de la línea central con el semiancho dado.
- [ ] **T80 · Cache por vista** — RF-011 — *Hecho cuando:* misma clave devuelve el mismo
  resultado y un cambio de vista la invalida.

## Fase 9 — Sesión (RF-002, 003, 009, 010, 013, 014, 016)

- [ ] **T81 · `Sesion` y carga candidata atómica** — RF-009 — *Hecho cuando:* un fallo en la
  candidata deja la sesión anterior idéntica.
- [ ] **T82 · `auto_referencia` con fallback y aviso** — RF-002/003 — *Hecho cuando:* índice
  inválido y jugador sin vueltas producen el auto correcto y `ReferenciaFallback`.
- [ ] **T83 · Rechazo sin vueltas analizables** — RF-003 — *Hecho cuando:* el mensaje es
  exactamente "El replay no contiene vueltas analizables" y no se entra.
- [ ] **T84 · Selección por defecto** — RF-013 — *Hecho cuando:* solo las vueltas válidas del
  auto de referencia quedan visibles.
- [ ] **T85 · Alternar visibilidad e invariantes REF/B** — RF-014/016 — *Hecho cuando:*
  ocultar la REF reasigna una válida y una vuelta inválida no se puede seleccionar.
- [ ] **T86 · Limpiar sesión** — RF-010 — *Hecho cuando:* todo vuelve a vacío sin tocar
  disco.
- [ ] **T87 · Tests de integración de sesión** — RF-002/003/013/014 — *Hecho cuando:*
  cargar, fallback, alternar y consultar DTO pasan en un solo test.
- [ ] **T88 · Guarda estática de persistencia** — RF-010 — *Hecho cuando:* el test falla si
  aparece `fs::write`, `File::create`, `OpenOptions` o `localStorage`.

## Fase 10 — DTO (RF-012)

- [ ] **T89 · DTO resumen** — RF-012 — *Hecho cuando:* serializa autos, vueltas y avisos con
  nombres en español.
- [ ] **T90 · DTO Vuelta** — RF-011 — *Hecho cuando:* incluye canales alineados y readouts de
  la vuelta REF.
- [ ] **T91 · DTO Mapa** — RF-011 — *Hecho cuando:* incluye pista y trazas por vuelta
  visible.
- [ ] **T92 · DTO Conjunto** — RF-011/014 — *Hecho cuando:* contiene solo los agregados del
  auto de la REF.
- [ ] **T93 · DTO Comparación** — RF-015 — *Hecho cuando:* incluye A, B y las series de
  delta.
- [ ] **T94 · DTO Curvas** — RF-011/015 — *Hecho cuando:* incluye curvas, métricas por vuelta
  y delta por curva.
- [ ] **T95 · Tests de serialización y tolerancias** — RF-012 — *Hecho cuando:* el JSON no
  contiene `NaN` y los huecos viajan como `Option`.

## Fase 11 — Capa Tauri (RF-006, 008, 009, 010, 013, 014)

- [ ] **T96 · Scaffold de `src-tauri` y capabilities** — RF-008/010 — *Hecho cuando:*
  `cargo build` compila y la capability solo permite lectura de archivos elegidos.
- [ ] **T97 · `estado_app` con `Mutex<Sesion>`** — RF-009 — *Hecho cuando:* un test del
  wrapper demuestra que dos accesos concurrentes no corrompen el estado.
- [ ] **T98 · Comando `cargar_archivos` atómico** — RF-008/009 — *Hecho cuando:* se ejecuta
  en `spawn_blocking` y un lote inválido devuelve aviso sin mutar la sesión.
- [ ] **T99 · Comando `cargar_pista`** — RF-006/008 — *Hecho cuando:* una pista inválida
  conserva la anterior.
- [ ] **T100 · Comandos de pestaña y selección** — RF-013/014 — *Hecho cuando:*
  `datos_pestana`, `alternar_vuelta`, `fijar_referencia`, `fijar_b` y `limpiar_sesion`
  devuelven lo esperado en una prueba manual.
- [ ] **T101 · Diálogo nativo** — RF-008 — *Hecho cuando:* abre y devuelve rutas de
  `.acreplay` y `.ai`.
- [ ] **T102 · Drag & drop** — RF-008 — *Hecho cuando:* soltar archivos produce el mismo
  resultado que el diálogo.
- [ ] **T103 · Prueba manual de errores de carga (manual)** — RF-008/009 — *Hecho cuando:* un
  checklist confirma rechazo por versión, truncado y pista inválida sin perder la sesión.

## Fase 12 — Frontend (RF-003, 005, 006, 011, 013, 014, 015, 016)

- [ ] **T104 · `index.html` con layout y 5 pestañas** — RF-011 — *Hecho cuando:* las pestañas
  conmutan sus paneles y no hay errores en consola.
- [ ] **T105 · Vendorizar uPlot + licencia** — RF-011 — *Hecho cuando:* la app grafica con la
  pestaña Network en modo offline.
- [ ] **T106 · Wrapper de uPlot** — RF-011 — *Hecho cuando:* el cursor queda sincronizado
  entre dos gráficos y las curvas se dibujan como marcas verticales.
- [ ] **T107 · Helper de canvas (DPR)** — RF-011 — *Hecho cuando:* los canvas se ven nítidos
  con DPR 1 y 2.
- [ ] **T108 · `avisos.js`** — RF-003/006 — *Hecho cuando:* muestra `FALTA_PISTA` y los
  rechazos con archivo y motivo.
- [ ] **T109 · Selector de vueltas** — RF-005/013/016 — *Hecho cuando:* muestra etiqueta,
  motivo, REF/B y no permite seleccionar inválidas.
- [ ] **T110 · Reproductor** — RF-011 — *Hecho cuando:* play/pausa/scrub mueven cursor y mapa
  de forma consistente.
- [ ] **T111 · Vuelta: velocidad, RPM y marcha** — RF-011 — *Hecho cuando:* los 3 gráficos
  muestran datos de todas las vueltas visibles.
- [ ] **T112 · Vuelta: volante, aceleración y rumbo** — RF-011 — *Hecho cuando:* los 3
  gráficos responden a la selección.
- [ ] **T113 · Vuelta: carga por rueda y pedales** — RF-011 — *Hecho cuando:* hay 4 series de
  carga y un mini-gráfico de pedales por vuelta.
- [ ] **T114 · Mapa: base, banda y trazadas** — RF-011 — *Hecho cuando:* se ve la pista y la
  trazada de cada vuelta visible.
- [ ] **T115 · Mapa: canales y marcadores** — RF-011 — *Hecho cuando:* cambiar de canal
  recolorea y se ven frenadas y cambios.
- [ ] **T116 · Mapa: 3D, auto en vivo y zoom** — RF-011 — *Hecho cuando:* rotar/elevar y
  reproducir funcionan sin recargar.
- [ ] **T117 · Conjunto: tiempos, velocidad, envolvente, histogramas y fuel** — RF-011 —
  *Hecho cuando:* los 6 paneles muestran datos del auto de la REF.
- [ ] **T118 · Conjunto: desvío, sectores, mapas, tabla y teórica** — RF-011 — *Hecho
  cuando:* los 6 paneles restantes están presentes y coinciden con el DTO.
- [ ] **T119 · Comparación: 4 paneles** — RF-015 — *Hecho cuando:* se puede comparar A/B de
  autos distintos.
- [ ] **T120 · Curvas: mapa, tiempos y tracción** — RF-011 — *Hecho cuando:* hay una tarjeta
  de tracción por curva y el mapa colorea cada arco.
- [ ] **T121 · Curvas: tabla y delta** — RF-011/015 — *Hecho cuando:* la tabla muestra
  métricas por vuelta y el delta por curva.
- [ ] **T122 · Estilos responsive** — RF-011 — *Hecho cuando:* a 360 px no hay scroll
  horizontal en ninguna pestaña.
- [ ] **T123 · Checklist de paridad de los 32 paneles (manual)** — RF-011 — *Hecho cuando:*
  los 32 paneles quedan marcados con un replay real.

## Fase 13 — Cierre (RF-010, 011, 012)

- [ ] **T124 · Calibrar curvas con 2–3 pistas** — RF-011 — *Hecho cuando:* no hay curvas
  fantasma ni faltantes y los umbrales quedan en `PLAN_CURVAS.md`.
- [ ] **T125 · `cargo test` completo + guardas** — RF-012 — *Hecho cuando:* todo verde y la
  guarda estática no reporta hallazgos.
- [ ] **T126 · Verificación de cero escrituras en runtime (manual)** — RF-010 — *Hecho
  cuando:* cargar, analizar y cerrar no crea ni modifica archivos (comparación
  antes/después).
- [ ] **T127 · Actualizar `MEMORY.md` y estado del plan** — — *Hecho cuando:* la memoria
  refleja la fase completada y las decisiones nuevas.
