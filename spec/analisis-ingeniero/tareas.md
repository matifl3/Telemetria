# Tareas — Análisis de ingeniero de pista

## Objetivo

Pasar de "mostrar telemetría" a "explicar dónde y por qué se pierde tiempo",
con la lectura que haría un ingeniero de pista: qué zonas cuestan más, qué hace
el piloto en cada fase de la curva, cómo se comporta el auto (sub/sobreviraje,
bloqueos, patinamiento) y qué tan repetible es el piloto vuelta a vuelta.

Son cinco funcionalidades sobre los datos que ya parsea `core`:

1. **Ranking de zonas de pérdida** A/B con causa probable.
2. **Fases de curva** (frenada, entrada, vértice, salida) con presión de freno,
   trail braking, coasting y distancia hasta gas a fondo.
3. **Balance** sub/sobreviraje a partir de volante, yaw y velocidad.
4. **Bloqueos y patinamiento** a partir de `slip_ratio`.
5. **Consistencia** entre vueltas del mismo auto.

El orden de las fases no sigue el de la lista: el ranking (1) se construye al
final porque su "causa probable" se arma con lo que producen 2, 3 y 4.

## Alcance y reglas

- Todos los cálculos viven en `core` y se testean sin Tauri (constitución §3).
  El front solo dibuja lo que recibe; los umbrales `SLIP_*` que hoy están en
  `front/app/estado.js` pasan a `core`.
- Convención de signos sin cambios: los deltas son **A − B**, positivo = A más
  lento. A es la REF y B la vuelta comparada. El ranking habla de "lo que pierde
  A frente a B".
- Todo se calcula sobre la grilla común de `s` (`alinear_vuelta`); un valor
  ausente queda `None`/`NaN`, no se inventa.
- Constantes de calibración nuevas, con nombre y comentario, junto a las
  existentes (`curvas.rs` o un módulo nuevo), igual que `R_CURVA`/`FRENO_UMBRAL`.
- Cambios de DTO solo aditivos: se agregan campos o DTO nuevos; no se renombra
  ni se quita nada de lo que ya consume el front. *(AGENTS.md pide preguntar
  antes de cambiar el formato de los DTO: aprobar este plan cuenta como esa
  consulta para los campos listados acá.)*
- Sin persistencia ni crates nuevos.
- Datos que **no** se usan: `slip_angle` (da 0 en las pruebas, R-04 del plan de
  migración) ni temperatura/presión de neumáticos (no existen en `.acreplay`).
- Las comparaciones de balance y de "gas a fondo" entre autos distintos son
  orientativas: el volante y el pedal no tienen la misma relación en cada auto.
  La UI lo avisa cuando A y B no comparten `car_id`.

## Hallazgos del código que condicionan el plan

- `metricas_curva` busca el inicio de frenada (`d_fren`) **solo dentro del arco**
  `s_ini..s_fin`. Como el arco empieza donde el radio baja de `R_CURVA` (300 m),
  en curvas lentas la frenada suele empezar antes y hoy no se detecta o se
  detecta tarde. Las fases de curva necesitan una ventana de aproximación previa
  (ING10).
- `GAS_UMBRAL = 0.9` marca "reaceleración", no "gas a fondo". Se agrega un
  umbral propio para gas a fondo sin tocar el existente.
- El DTO de vuelta solo expone `slip_ratio` de las ruedas delanteras; las
  traseras hacen falta para el patinamiento en tracción trasera.
- `Series` de la vuelta no guarda `vel_x/vel_z`, pero sí `x`, `z` y `yaw`
  continuo: alcanza para la dirección de avance y el ángulo de deriva del chasis.
- `nd_slip` (offset 196, documentado) no se parsea. Queda como alternativa a
  `slip_angle` si el balance por volante/yaw resulta insuficiente (fuera de
  alcance por ahora).
- La grilla tiene hasta 10 000 puntos: el paso es ≈0,5–0,7 m en pistas de
  5–7 km. Las derivadas sobre `s` necesitan suavizado.

## Convenciones

- Cada tarea tiene una condición de cierre verificable ("Hecho cuando"): un test
  nombrado, un comando o un checklist concreto.
- **(manual)** = se cierra con un checklist sobre un replay real de
  `Paquetes de telemetria/`.
- Tolerancias: `1e-3` s en tiempos, `0.1` km/h en velocidades, un paso de grilla
  en `s`, `1e-6` en igualdades derivadas.
- Fixtures sintéticos en `core/tests/soporte/`, como los tests existentes.

| Fase | Tareas | Contenido |
|---|---|---|
| 0 | ING01–ING04 | Decisiones y validación de señales |
| 1 | ING05–ING09 | Base común en `core` |
| 2 | ING10–ING17 | Fases de curva |
| 3 | ING18–ING22 | Bloqueos y patinamiento |
| 4 | ING23–ING28 | Balance sub/sobreviraje |
| 5 | ING29–ING35 | Ranking de zonas de pérdida |
| 6 | ING36–ING40 | Consistencia entre vueltas |
| 7 | ING41–ING47 | Interfaz |
| 8 | ING48–ING50 | Cierre |

Camino crítico: 0 → 1 → 2 → 5. Las fases 3, 4 y 6 pueden hacerse en paralelo
después de la 1.

---

## Fase 0 — Decisiones y validación de señales

- [x] **ING01 · Decidir dónde se muestra cada análisis** — *Hecho cuando:* queda
  anotado en este archivo y en `MEMORY.md`. Propuesta: el ranking va en
  **Comparación**; fases, balance y bloqueos en **Curvas** (por curva y A/B);
  consistencia en **Conjunto** (que ya está limitado al auto de la REF). No se
  crea una pestaña nueva salvo que se decida lo contrario. *(Decidido así.)*
- [ ] **ING02 · Validar signo y unidad de `slip_ratio` (manual)** — *Hecho
  cuando:* con un replay real se confirma, en una frenada fuerte y en una salida
  con patinamiento, que bloquear da valores negativos y patinar positivos, y en
  qué rango (¿±1?); el resultado queda en `doc/FormatoTelemetria.md`. Si el
  signo es otro, se corrigen los umbrales antes de la fase 3.
- [ ] **ING03 · Validar volante y yaw (manual)** — *Hecho cuando:* queda
  documentado el signo de `volante` (izquierda/derecha), si es ángulo de volante
  o de rueda, y el signo de la tasa de yaw en una curva a derecha. Se compara
  contra `Sentido` de `CurvaPista` en al menos dos pistas calibradas.
- [ ] **ING04 · Confirmar que `slip_angle` sigue en 0 (manual)** — *Hecho
  cuando:* se revisan 3 replays y `doc/Catalogo_Graficos.md` dice "verificado"
  o corrige la nota. Si tiene datos, se anota como posible mejora del balance;
  este plan no depende de él.

## Fase 1 — Base común en `core`

- [x] **ING05 · Media móvil sobre la grilla** — *Hecho cuando:* existe
  `senales::suavizar(canal, s, ventana_m)` que respeta los `None` (no promedia
  a través de huecos); test `suavizado_no_cruza_huecos`. *(Cambio: no envuelve
  por la meta, porque el delta y el tiempo saltan ahí; las ventanas que cruzan
  la meta usan `puntos_de_tramo` con `s` extendido.)*
- [x] **ING06 · Derivada respecto de `s` y del tiempo** — *Hecho cuando:* hay
  `derivada_en_s` y `derivada_en_t` (diferencia centrada, `None` en bordes y
  huecos); test con una rampa lineal que devuelve la pendiente exacta (`1e-6`).
- [x] **ING07 · Tasa de yaw y dirección de avance** — *Hecho cuando:* a partir
  del yaw continuo y de `x/z` alineados se obtienen la tasa de yaw (rad/s) y el
  rumbo de la trayectoria; test con un círculo sintético de radio conocido:
  tasa de yaw = v/R dentro del 1 %.
- [x] **ING08 · Exponer `slip_ratio` trasero alineado** — *Hecho cuando:*
  `DtoVueltaCanales` suma `slip_ratio_trasera_izquierda/derecha` (aditivo) y un
  test de DTO verifica que llegan alineados a la grilla.
- [x] **ING09 · Rangos de `s` con envoltura por meta** — *Hecho cuando:* hay un
  tipo `Tramo { s_ini, s_fin }` reutilizable (mismo criterio que
  `indices_de_curva`) y un helper que devuelve sus índices de grilla; test de
  tramo que cruza la meta.

## Fase 2 — Fases de curva

Definiciones (por vuelta y por curva):

- **Inicio de frenada**: primer punto con freno > `FRENO_INICIO` (≈0,05) en una
  ventana `VENTANA_APROXIMACION` (≈250 m) antes de `s_ini`, y que sigue frenando
  hasta la curva.
- **Frenada**: inicio de frenada → turn-in. **Entrada**: turn-in → vértice.
  **Vértice**: ventana corta alrededor de `v_min`. **Salida**: vértice → gas a
  fondo (o `s_fin` si no llega).
- **Turn-in**: primer punto donde |volante| supera `VOLANTE_TURN_IN` en la
  dirección de la curva; si no se encuentra, `s_ini`.
- **Gas a fondo**: primer punto después del vértice con gas ≥ `GAS_FONDO`
  (≈0,98) sostenido al menos `GAS_FONDO_SOSTENIDO_M` metros.

- [x] **ING10 · Ventana de aproximación** — *Hecho cuando:* las fases buscan la
  frenada antes de `s_ini` sin invadir la curva anterior (corta en el `s_fin`
  de la previa); test con frenada sintética 80 m antes del arco. `d_fren`
  actual no cambia (se documenta la diferencia).
- [x] **ING11 · Puntos de fase por curva** — *Hecho cuando:* existe
  `fases_curva(canales, curva, curva_anterior)` que devuelve `s` de inicio de
  frenada, turn-in, vértice y gas a fondo (`NaN` si falta); tests con una curva
  sintética completa y con una curva "a fondo" sin frenada.
- [x] **ING12 · Presión de freno** — *Hecho cuando:* por curva se calculan freno
  máximo, `s` del máximo y freno medio en la fase de frenada; test con perfil
  de freno conocido.
- [x] **ING13 · Trail braking** — *Hecho cuando:* se mide el largo (m) y la
  integral de freno mientras |volante| > `VOLANTE_TURN_IN` y freno >
  `FRENO_INICIO`, y el freno residual en el turn-in; test: frenada que termina
  antes del turn-in da 0 m.
- [x] **ING14 · Coasting** — *Hecho cuando:* se mide metros y tiempo con gas <
  `PEDAL_SUELTO` y freno < `PEDAL_SUELTO` (≈0,05) entre inicio de frenada y gas
  a fondo; test con un hueco de 20 m sin pedales.
- [x] **ING15 · Distancia y tiempo vértice → gas a fondo** — *Hecho cuando:*
  hay metros y segundos desde el vértice hasta gas a fondo; test que diferencia
  "gas a fondo tarde" de "nunca a fondo" (`NaN`).
- [x] **ING16 · Tiempo por fase y delta A/B por fase** — *Hecho cuando:*
  `DeltaCurva` (o un `DeltaFasesCurva` nuevo) suma deltas de tiempo por fase,
  de punto de frenada, freno máximo, trail, coasting y distancia a gas a fondo;
  test `ing16_delta_por_fase`. *(Cambio: como A y B tienen límites de fase
  propios, la suma exacta se verifica en el ranking, que usa los límites de
  la REF: `ing31_la_suma_de_perdidas_es_el_delta_final`.)*
- [x] **ING17 · DTO de fases** — *Hecho cuando:* `DtoCurvas` incluye las fases
  por vuelta y el delta por fase (aditivo, no finitos como `null`); test de DTO.

## Fase 3 — Bloqueos y patinamiento

- [x] **ING18 · Mover umbrales de slip a `core`** — *Hecho cuando:*
  `SLIP_BLOQUEO`, `SLIP_PATINA` y `SLIP_VEL_MIN` viven en `core` con los
  valores de hoy (−0,3 / 0,15 / 30 km/h, ajustados según ING02) y el front deja
  de definirlos; el círculo de tracción de Curvas sigue igual.
- [x] **ING19 · Detectar eventos por rueda** — *Hecho cuando:* hay
  `eventos_slip(alineada)` que devuelve tramos contiguos por rueda con tipo
  (bloqueo/patinamiento), `s_ini`, `s_fin`, pico y duración, descartando
  eventos menores a `SLIP_LARGO_MIN` m; tests con un bloqueo de 10 m en FL y un
  pico aislado de un punto que se descarta.
- [x] **ING20 · Ubicar el evento** — *Hecho cuando:* cada evento indica curva y
  fase (ING11) o "recta"; test con evento en la frenada de una curva.
- [x] **ING21 · Resumen por curva** — *Hecho cuando:* por curva y vuelta hay
  cantidad de bloqueos/patinamientos y la rueda más afectada; test.
- [x] **ING22 · DTO de eventos** — *Hecho cuando:* los eventos llegan en el DTO
  de Curvas para las vueltas visibles; test de DTO.

## Fase 4 — Balance sub/sobreviraje

Idea: comparar la tasa de giro real del auto con la que "pide" el volante, y
mirar el ángulo de deriva del chasis.

- **Curvatura de trayectoria** κ = tasa de yaw / velocidad.
- **Ganancia de dirección** = κ / volante. Se calibra por vuelta con los puntos
  de baja aceleración lateral (comportamiento casi neutro).
- **Índice de balance** = cuánto volante sobra o falta respecto de esa
  calibración en el mismo punto: más volante para la misma curvatura =
  **subviraje**; menos volante, o volante contrario al giro = **sobreviraje**.
- **Deriva del chasis** β = yaw − rumbo de la trayectoria: refuerza el
  diagnóstico de sobreviraje (β alto con contravolante).

- [x] **ING23 · Curvatura de trayectoria** — *Hecho cuando:* se calcula κ con
  ING07, filtrando velocidad < `BALANCE_VEL_MIN`; test con círculo sintético.
- [x] **ING24 · Calibración neutra por vuelta** — *Hecho cuando:* la ganancia de
  dirección se estima con mediana sobre puntos con |acc_lat| <
  `BALANCE_G_NEUTRO` y volante no despreciable; test con datos sintéticos de
  ganancia conocida.
- [x] **ING25 · Índice de balance** — *Hecho cuando:* hay un canal por punto
  (positivo = subviraje, negativo = sobreviraje, `None` en rectas y a baja
  velocidad); tests: auto "neutro" da ≈0, más volante para la misma curvatura da
  positivo, contravolante da negativo.
- [x] **ING26 · Deriva del chasis** — *Hecho cuando:* β se calcula y un test con
  auto que avanza de costado da el ángulo esperado (signo según ING03).
- [x] **ING27 · Balance por fase de curva** — *Hecho cuando:* por curva se
  resume el índice medio en entrada, vértice y salida, con etiqueta
  "subvira / neutro / sobrevira" según `BALANCE_UMBRAL`; test.
- [ ] **ING28 · Validación con replay real (manual)** — *Hecho cuando:* en una
  curva lenta con salida en sobreviraje conocida y otra rápida con subviraje,
  el índice da el signo esperado; se ajustan constantes y se anota en
  `MEMORY.md`.

## Fase 5 — Ranking de zonas de pérdida

Se parte la vuelta en **segmentos** que cubren toda la pista: por cada curva sus
fases (frenada, entrada, vértice, salida) y las rectas entre curvas. La pérdida
de un segmento es Δt(fin) − Δt(inicio). Al cubrir toda la vuelta, la suma de
pérdidas y ganancias da el delta final. La pendiente del delta (s/100 m)
ubica el punto exacto de mayor pérdida dentro de cada segmento y se dibuja.

Fases de A y B pueden diferir; los límites de segmento se toman de la REF (A).

- [x] **ING29 · Pendiente del delta** — *Hecho cuando:* hay
  `pendiente_delta(delta_acumulado, grilla)` en s/100 m, suavizada con ING05
  (`DELTA_VENTANA_M` ≈30 m); test con delta sintético que crece 0,1 s en un
  tramo de 50 m.
- [x] **ING30 · Segmentación de la vuelta** — *Hecho cuando:* los segmentos
  cubren la pista sin huecos ni solapes (incluida la curva que cruza la meta);
  test de cobertura.
- [x] **ING31 · Pérdida por segmento** — *Hecho cuando:* cada segmento tiene
  pérdida (s), `s` y valor de pendiente máxima; test: la suma de pérdidas es el
  delta final (`1e-3` s).
- [x] **ING32 · Causa probable** — *Hecho cuando:* cada segmento con pérdida
  tiene una lista ordenada de causas con su evidencia en números, por reglas
  simples y documentadas:
  - frenada: "frena N m antes", "menos presión de freno", "bloqueo en FL";
  - entrada/vértice: "N km/h menos de mínima", "más trail" o "menos trail",
    "subviraje";
  - salida: "gas a fondo N m más tarde", "patinamiento RR", "sobreviraje",
    "coasting N m";
  - recta: "arrastra salida de Cn" si la diferencia de velocidad ya existía al
    entrar a la recta; si no, "menos velocidad punta" (posible auto/aero, fuera
    del control del piloto).
  Si ninguna regla aplica: "sin causa clara". Un test por regla con fixture.
- [x] **ING33 · Ranking** — *Hecho cuando:* se devuelven los `RANKING_TOP`
  (≈5) segmentos de mayor pérdida, ordenados, con su porcentaje del delta total
  y las ganancias aparte; test de orden y empates estables.
- [x] **ING34 · DTO del ranking** — *Hecho cuando:* `DtoComparacion` suma
  `pendiente_delta` y `ranking` (aditivo); test de DTO con A y B, y sin B.
- [ ] **ING35 · Validación con replay real (manual)** — *Hecho cuando:* en una
  comparación conocida, las 3 primeras zonas coinciden con lo que se ve en el
  gráfico de delta y las causas son coherentes con los pedales; se ajustan
  umbrales.

## Fase 6 — Consistencia entre vueltas

Ámbito: vueltas válidas y visibles del auto de la REF (como Conjunto). Se
excluyen vueltas con tiempo > `CONSISTENCIA_CORTE` (≈107 %) de la mejor, para
que un trompo no arruine la estadística; se informa cuántas se excluyeron.

- [x] **ING36 · Dispersión por curva** — *Hecho cuando:* por curva hay desvío
  estándar de inicio de frenada (m), `v_min` (km/h), gas a fondo (m) y tiempo de
  curva (s); test con 3 vueltas sintéticas de dispersión conocida.
- [x] **ING37 · Dispersión a lo largo de la vuelta** — *Hecho cuando:* hay un
  canal de desvío estándar del tiempo por segmento (ING30) y de la velocidad
  por punto; test.
- [x] **ING38 · Ranking de inconsistencia** — *Hecho cuando:* las curvas se
  ordenan por desvío del tiempo de curva, con la métrica que más varía como
  explicación ("frena en un rango de 22 m"); test.
- [x] **ING39 · Mínimo de vueltas** — *Hecho cuando:* con menos de 3 vueltas
  útiles el DTO devuelve un aviso en español en lugar de estadísticas; test.
- [x] **ING40 · DTO de consistencia** — *Hecho cuando:* `DtoConjunto` suma el
  bloque de consistencia (aditivo); test de DTO.

## Fase 7 — Interfaz

Siguiendo `front/app/graficos/` (canvas 2D + uPlot), registrando cada gráfico
nuevo en `doc/Catalogo_Graficos.md` y comprobando el ancho mínimo de 360 px.

- [x] **ING41 · Comparación: pendiente del delta** — *Hecho cuando:* bajo el
  delta acumulado hay un uPlot de pendiente con las zonas del ranking
  sombreadas.
- [x] **ING42 · Comparación: tabla del ranking** — *Hecho cuando:* una tabla
  muestra posición, zona ("C5 · salida"), pérdida, % del total y causa; al
  tocar una fila el cursor de los gráficos salta a esa zona.
- [x] **ING43 · Curvas: fases A/B** — *Hecho cuando:* la tabla de cada curva
  muestra los puntos de fase, freno máximo, trail, coasting y gas a fondo para
  A y B con su delta, y una barra horizontal de fases sobre `s`.
- [x] **ING44 · Curvas: balance** — *Hecho cuando:* cada curva indica
  subvira/neutro/sobrevira por fase, y hay un aviso si A y B son autos
  distintos.
- [ ] **ING45 · Curvas y Mapa: eventos de slip** — *Hecho cuando:* los
  bloqueos y patinamientos se listan por curva y se marcan sobre el mapa de la
  curva; el círculo de tracción usa los eventos de `core`. *(Parcial: la tabla
  "Balance y slip" lista los eventos por curva y el círculo de tracción usa los
  umbrales de `core` con las cuatro ruedas; falta marcarlos en el mapa.)*
- [x] **ING46 · Conjunto: consistencia** — *Hecho cuando:* hay tabla de
  inconsistencia por curva y un gráfico de dispersión a lo largo de la vuelta;
  con menos de 3 vueltas se ve el aviso.
- [ ] **ING47 · Verificación visual (manual)** — *Hecho cuando:* con un replay
  real se revisan las tres pestañas en escritorio y a 360 px (captura por CDP,
  como indica `MEMORY.md`).

## Fase 8 — Cierre

- [x] **ING48 · Documentar las definiciones** — *Hecho cuando:*
  `doc/PLAN_CURVAS.md` (o un `doc/` nuevo) explica fases, balance, slip,
  ranking y consistencia, con todas las constantes y su valor.
- [x] **ING49 · Tests en verde** — *Hecho cuando:* `cargo test --workspace` pasa
  y `node --check` pasa en los `.js` tocados. *(`cargo test -p core`: 160 tests
  en verde en Linux; `src-tauri` no compila en Linux sin GTK, falta correrlo en
  Windows.)*
- [x] **ING50 · Actualizar memoria** — *Hecho cuando:* `MEMORY.md` refleja el
  estado, las decisiones de ING01–ING04 y los umbrales calibrados.

## Fuera de alcance

- Usar `slip_angle`, parsear `nd_slip` o leer datos CSP extra.
- Temperatura y presión de neumáticos (no están en `.acreplay`).
- Recomendaciones de setup del auto; el análisis describe el comportamiento,
  no propone cambios de reglaje.
- Comparar contra vueltas de otras sesiones o guardar resultados (sin
  persistencia).
- Línea de trazada respecto del ancho de pista: depende de
  `spec/modificacion de pista/`.

## Verificación

- `cargo test --workspace`.
- Checklists manuales ING02–ING04, ING28, ING35 e ING47 con replays reales en al
  menos dos de las pistas ya calibradas (Monza, Imola, Spa, Mugello).
