# Plan de implementación — Pestaña Vueltas

Documento de diseño de la pestaña Vueltas. Describe el comportamiento acordado y
cómo se implementa.

Fuentes normativas:

- `spec/pestana-vueltas/tareas.md` — objetivo, alcance y tareas TV01–TV08.
- `doc/constitucion.md` — principios innegociables (especialmente 3 y 5).
- `front/index.html`, `front/app/selector_vueltas.js`, `front/app/main.js`,
  `front/app/carga.js`, `front/estilos.css` — estado real de la interfaz.
- `core/src/dto.rs`, `core/src/sesion.rs`, `src-tauri/src/comandos.rs` —
  contrato existente. Se agrega un campo mínimo a `DtoResumen` para exponer el
  índice del jugador.

---

## 0. Resumen ejecutivo

Se mueve el listado de vueltas que hoy ocupa el lateral a una pestaña propia
llamada **Vueltas**. La pestaña lista únicamente vueltas válidas en dos
secciones:

1. **Tus vueltas** — las del jugador real (`current_recording_index`), en su
   orden actual.
2. **Otros autos** — el resto, en una lista plana ordenada por `tiempo_s`
   ascendente (la más rápida primero).

Cada fila conserva las acciones actuales:

- selector explícito por fila para fijar **REF** o **B**;
- ojo para mostrar u ocultar la vuelta;
- actualización desde el `DtoResumen` que ya devuelven los comandos.

El lateral queda reducido al reproductor y a las lecturas actuales. El único
cambio de backend es exponer `indice_jugador` en el resumen; no se toca el
formato de datos, la lógica de análisis, los comandos ni la persistencia.

Decisiones que ordenan el diseño:

1. **La fuente de verdad sigue siendo el backend.** El front no calcula ni
   conserva roles: cada comando devuelve un `DtoResumen` fresco y la lista se
   vuelve a dibujar desde él.
2. **El jugador real se identifica por `indice_jugador`.** No se usa el primer
   auto ni la REF actual como sustituto. Si el índice no es válido, todas las
   vueltas válidas van a «Otros autos» y «Tus vueltas» muestra un aviso.
3. **Se conserva el `id="lista-vueltas"`** dentro del nuevo panel; cambia su
   contenedor a `<div>`.
4. **El selector de rol es explícito.** Se agregan controles dedicados para REF
   y B; el clic actual sobre `.vuelta-info` se conserva como atajo para fijar la
   REF.
5. **Solo se listan vueltas válidas.** Las inválidas dejan de mostrarse.
6. **El orden es fijo.** No hay botón de ascendente/descendente. El orden por
   tiempo aplica solo a esta pestaña; los selectores «vs B» no cambian.
7. **La normalización de REF/B sigue siendo del backend.** Ocultar una REF o B
   dispara el reemplazo automático existente; la UI solo refleja el resultado.

---

## 1. Punto de partida

| Pieza | Estado previo | Uso en este plan |
|---|---|---|
| `front/index.html` | El lateral contenía «Vueltas cargadas», la lista, el reproductor y las lecturas. El `tablist` tenía 5 pestañas. | Agregar la pestaña/panel Vueltas y quitar la lista del lateral. |
| `front/app/selector_vueltas.js` | `render()` dibujaba todos los autos y todas las vueltas, incluidas las inválidas; `fila()` mostraba el ojo y el badge REF; el clic sobre `.vuelta-info` fijaba la REF. `poblarSelB()` y `fijarBDesdeSelect()` alimentan Comparación y Curvas. | Reemplazar el render por dos secciones, filtrar válidas, ordenar y agregar controles REF/B. Conservar ojo y selectores «vs B». |
| `front/app/main.js` | `renderPestanaActiva()` despacha por pestaña; `iniciarTabs()` conecta los `.tab[data-tab]`; `iniciarColapsarVueltas()` controlaba el plegado del lateral. | Agregar el caso `vueltas` y retirar el plegado del lateral. |
| `front/app/carga.js` | `aplicarResumen()` guarda el resumen, invalida cachés, llama a `selectorVueltas.render()` y vuelve a renderizar la pestaña activa. | Sin cambios: ya es el punto único de refresco. |
| `front/app/puente.js` | Expone `alternarVuelta`, `fijarReferencia` y `fijarB`, todos devuelven `DtoResumen`. | Sin cambios: se reutilizan tal cual. |
| `core/src/dto.rs` | `DtoResumen` incluía `autos`, `vueltas`, `seleccion` y datos de pista, sin el índice del jugador. | Agregar `indice_jugador: Option<usize>`. |
| `core/src/sesion.rs` | `fijar_referencia` y `fijar_b` activan la vuelta si estaba oculta; `fijar_b` rechaza la REF; `normalizar_seleccion` reasigna REF/B y `auto_referencia` sigue a la REF. `meta.indice_jugador` es el índice crudo del replay. | Se reutiliza el dato; no se modifica la lógica. |
| `src-tauri/src/comandos.rs` | `alternar_vuelta`, `fijar_referencia` y `fijar_b` devuelven `DtoResumen` o un error de selección. | Sin cambios: solo reenvía el DTO ampliado. |
| `front/estilos.css` | Existían estilos de lista, grupos por auto, ojo, badge REF y plegado del lateral. | Reutilizar lo común y reemplazar los estilos de grupos por los de secciones. |

---

## 2. Alcance

### Dentro del alcance

- Pestaña y panel accesibles para Vueltas.
- Traslado del listado fuera del lateral, en dos secciones fijas.
- Exposición del jugador real en `DtoResumen` y su validación.
- Filtro de vueltas válidas y seleccionables.
- Orden fijo: jugador primero, resto por tiempo ascendente.
- Selector REF/B por fila, con identificación clara del rol actual.
- Badge B y estados visuales asociados.
- Conservación del ojo y del reemplazo automático de REF/B.
- Presentación responsive y accesible.
- Verificación manual y compilación.

### Fuera del alcance

- Cambiar el formato de datos, los comandos, la clasificación de vueltas o la
  elección automática de la REF inicial.
- Filtros, búsqueda, orden manual/arbitrario o selección masiva.
- Cambiar el orden de los selectores «vs B» de Comparación y Curvas.
- Guardar selección, roles o visibilidad entre sesiones.

---

## 3. Diseño de la pestaña

### 3.1 Ubicación y orden

Se propone este orden de pestañas:

1. Vuelta
2. Vueltas
3. Mapa
4. Conjunto
5. Comparación
6. Curvas

La pestaña inicial sigue siendo **Vuelta** (`state.tab` no cambia). Vueltas queda
junto al análisis principal, sin alterar la pantalla de arranque. Si se prefiere
al final, solo cambia el orden en el HTML; el resto del plan no se ve afectado.

### 3.2 Estructura del panel

- La pestaña es un botón nativo con `role="tab"`, `id="tab-vueltas"`,
  `data-tab="vueltas"`, `aria-controls="panel-vueltas"` y
  `aria-selected="false"` por defecto.
- El panel es un contenedor con `id="panel-vueltas"`, `role="tabpanel"` y
  `aria-labelledby="tab-vueltas"`. Sigue la misma convención que los paneles
  existentes.
- Dentro del panel va una tarjeta con título, una ayuda breve y el listado.
  Se conserva el `id="lista-vueltas"` como `<div>` contenedor de las secciones.
- La ayuda explica en español: tus vueltas van primero, el resto se ordena por
  tiempo, REF y B son excluyentes y, si se oculta una, el sistema elige un
  reemplazo.
- El panel solo es visible dentro del dashboard, igual que las demás pestañas,
  porque el análisis exige replay y pista válidos.

### 3.3 Listado: filtro, secciones y orden

- La fuente es siempre `state.resumen`; no se muta `resumen.vueltas`, se ordena
  una copia para dibujar.
- Se toma `validas = resumen.vueltas.filter(v => v.valida)`. En la práctica
  `valida` es la condición de seleccionabilidad que ya aplica el backend.
- El jugador se busca con `resumen.autos.find(a => a.indice === resumen.indice_jugador)`.
  Si `indice_jugador` es `null` o no coincide con ningún auto, no hay jugador
  identificado.
- **«Tus vueltas»**: vueltas válidas cuyo `id.auto` es el del jugador, en el
  orden en que aparecen en `resumen.vueltas`. Si no hay jugador identificado, la
  sección muestra «No se pudo identificar al jugador en este replay.»; si lo hay
  pero no tiene vueltas válidas, «El jugador no tiene vueltas válidas en este
  replay.».
- **«Otros autos»**: el resto de las vueltas válidas en una lista plana. El
  orden es por `tiempo_s` ascendente; los tiempos nulos van al final y los
  empates se resuelven por `id.auto` y luego por `numero_local`. La sección no se
  dibuja si no tiene filas.
- La cabecera de «Tus vueltas» muestra `piloto` (o `car_id`) y el recuento de
  vueltas válidas. La de «Otros autos» muestra el recuento y la leyenda «de más
  rápida a más lenta».
- Cada sección es plegable con estado por clave `jugador` / `otros`. El plegado
  se conserva entre redibujos y se reinicia al vaciar la sesión. La cabecera es
  un `<button>` con `aria-expanded` y `aria-controls`.
- Cada fila muestra color, etiqueta, tiempo, badges de rol, controles de rol y
  ojo. El tiempo se formatea con `fmtTiempo` y el color con `colorDeVuelta`,
  igual que hoy.
- Las clases de fila son `ref`, `b` y `oculta`. Como las inválidas ya no se
  listan, `no-valida` deja de usarse en esta lista; `badge-no` se conserva
  porque la tabla de Conjunto lo sigue usando.

### 3.4 Selector REF/B

Cada fila válida incluye un grupo de dos controles nativos:

- **REF**: fija la vuelta como referencia.
- **B**: fija la vuelta como comparación.

Reglas de presentación y comportamiento:

- El grupo tiene `role="group"` y un nombre accesible que incluye la etiqueta de
  la vuelta.
- Cada control es un botón con `type="button"`, `aria-pressed` verdadero cuando
  la vuelta ocupa ese rol y un nombre accesible del tipo «Fijar como REF la
  vuelta …».
- La asignación actual se identifica de tres formas a la vez: badge textual
  REF/B, estado presionado del control y clase de fila. No depende solo del
  color.
- Una fila sin rol tiene ambos controles habilitados.
- Una fila REF mantiene REF presionado; B se deshabilita con una explicación
  accesible de que una vuelta no puede ser REF y B a la vez. Para pasar esa
  vuelta a B, primero hay que fijar otra REF.
- Una fila B mantiene B presionado; REF sigue habilitado. Al promoverla a REF, el
  backend quita la B anterior y elige un reemplazo según su normalización; la UI
  refleja el resumen devuelto.
- Si la vuelta estaba oculta, fijarla como REF o B la vuelve visible, porque el
  backend ya la activa. La UI no duplica esa regla: solo vuelve a dibujar.
- No hay actualización optimista. El estado visual cambia únicamente cuando
  llega el `DtoResumen` de respuesta.
- Se conserva el clic actual sobre `.vuelta-info` como atajo para fijar la REF.
  Los botones de rol detienen la propagación para no disparar dos acciones; el
  selector explícito sigue siendo la vía principal y la fila mantiene el
  comportamiento que ya tenía.
- `poblarSelB()` y `fijarBDesdeSelect()` se conservan sin cambios: Comparación y
  Curvas siguen usando sus selectores «vs B», con su orden, y ambos caminos
  llaman a los mismos comandos, por lo que quedan sincronizados.

Para evitar respuestas fuera de orden por clics rápidos, el módulo del selector
mantiene una guarda interna de operación en curso: mientras un comando de rol u
ojo está pendiente, ignora nuevas activaciones y marca el listado como ocupado.
La guarda se libera siempre al terminar, haya éxito o error.

### 3.5 Ojo y normalización de roles

- El ojo sigue siendo un botón nativo con `aria-pressed` y nombre accesible
  «Ocultar la vuelta …» o «Mostrar la vuelta …».
- Como solo se listan vueltas válidas, el ojo ya no necesita el estado
  deshabilitado para inválidas.
- Al pulsarlo se llama a `alternarVuelta`. La respuesta pasa por
  `aplicarResumen`, que vuelve a dibujar la lista y la pestaña activa.
- Si se oculta la REF, el backend la quita y asigna como REF la primera vuelta
  visible. Si se oculta la B, asigna como B la primera visible distinta de la
  REF. Si no hay reemplazo posible, el rol queda vacío.
- `auto_referencia` sigue a la REF. Por eso, cambiar la REF a una vuelta de otro
  auto también cambia el conjunto de datos que usa la pestaña Conjunto. Es
  comportamiento existente del backend y debe verificarse, no modificarse.
- Si se oculta la única vuelta visible y no queda REF, `puede_analizar` pasa a
  falso y el dashboard se oculta. Es el comportamiento actual; se incluye como
  caso límite de verificación.

### 3.6 Sincronización con el resto de la aplicación

- `aplicarResumen()` sigue siendo el único punto de refresco: guarda el resumen,
  incrementa la versión, limpia cachés, redibuja el selector y renderiza la
  pestaña activa. No hace falta tocar `carga.js`.
- `renderPestanaActiva()` agrega un caso `vueltas` que solo llama a
  `selectorVueltas.render()`, sin pedir DTO ni ejecutar comandos.
- `cambiarTab()` ya alterna clases y `aria-selected` y llama al despachador; la
  pestaña nueva se integra sola porque `iniciarTabs()` escucha a todos los
  `.tab[data-tab]`.
- Cambiar roles desde la pestaña Vueltas o desde los selectores «vs B» produce el
  mismo efecto porque ambos caminos usan los comandos y `aplicarResumen`.
- Al vaciar la sesión, el listado se vacía y el dashboard se oculta. Se vacía
  también el conjunto de secciones plegadas para que una carga nueva no herede
  secciones colapsadas de la sesión anterior.

---

## 4. Cambios por archivo

| Archivo | Cambio | Tareas |
|---|---|---|
| `front/index.html` | Agregar botón de pestaña y panel Vueltas; mover la lista al panel; quitar del lateral el título «Vueltas cargadas», el botón de plegado y la lista. Conservar reproductor y lecturas. | TV01, TV02 |
| `front/app/selector_vueltas.js` | Reemplazar el render por dos secciones fijas; filtrar válidas; ordenar «Otros autos» por tiempo; agregar badge B y controles REF/B; restaurar foco; guarda de operación en curso; limpieza de secciones plegadas al vaciar. Conservar `poblarSelB()` y `fijarBDesdeSelect()`. | TV02–TV05, TV07 |
| `front/app/main.js` | Agregar el caso `vueltas` al despachador; retirar `iniciarColapsarVueltas()` y su llamada en `init()`. | TV01, TV02 |
| `front/estilos.css` | Estilos del panel, secciones, filas, controles de rol, badge B, foco visible y adaptación a ventanas angostas. Retirar los estilos del plegado lateral y de los grupos por auto que queden sin uso. | TV02, TV05 |
| `front/app/carga.js` | Sin cambios: ya llama a `selectorVueltas.render()` al aplicar un resumen. | TV04 |
| `front/app/puente.js` | Sin cambios: los comandos actuales alcanzan. | TV03, TV04 |
| `core/src/dto.rs` | Agregar `indice_jugador: Option<usize>` a `DtoResumen`, validado contra `autos`; `None` si el índice es inválido. | TV08 |
| `core/tests/dto.rs` | Cubrir el campo con un replay cuyo jugador no es el auto 0 y con el fixture de índice inválido. | TV08 |
| `src-tauri/src/comandos.rs` | Sin cambios: solo reenvía el DTO ampliado. | — |
| `spec/pestana-vueltas/tareas.md` | Marcar TV01–TV08 al cerrar la verificación. | TV06 |
| `MEMORY.md` | Actualizar el estado y el próximo paso al terminar la implementación. | — |

---

## 5. Accesibilidad y responsive

### Accesibilidad

- La pestaña sigue las convenciones ARIA de las pestañas existentes:
  `tablist`, botones con `role="tab"`, `aria-selected` y `aria-controls`; el
  panel usa `role="tabpanel"` y `aria-labelledby`.
- Se mantiene el modelo de teclado actual de la aplicación: Tab para recorrer y
  Enter/Espacio para activar. No se introduce un modelo de flechas solo para esta
  pestaña, para no romper la consistencia con las demás.
- Las cabeceras de sección son `<button>` con `aria-expanded` y `aria-controls`.
- Los controles de rol y el ojo son botones nativos, operables por teclado, con
  nombres accesibles que incluyen la vuelta y la acción.
- El estado de rol no se comunica solo por color: badges REF/B, `aria-pressed` y
  clase de fila.
- Tras un redibujo se restaura el foco en el control equivalente de la misma
  vuelta y acción. Si la fila ya no existe, el foco vuelve a la cabecera de la
  sección correspondiente.
- Los textos largos se recortan con elipsis; el nombre completo queda en el
  `title` o en el nombre accesible.

### Responsive

- El listado ocupa el ancho del panel con un máximo de lectura en pantallas
  anchas, sin estirar en exceso las filas.
- Las filas usan `flex-wrap`: en ventanas angostas, la información ocupa la
  primera línea y los controles de rol y ojo pasan a una segunda línea.
- Los controles mantienen un tamaño cómodo para tocar y un `:focus-visible`
  claro.
- La cabecera de sección también permite envolver el título y el recuento sin
  desbordar.
- No debe aparecer desplazamiento horizontal en anchos de móvil.
- La barra de pestañas ya envuelve sus botones; la pestaña nueva se suma sin
  cambios adicionales.

---

## 6. Errores y estados límite

| Caso | Comportamiento previsto |
|---|---|
| No se identifica al jugador | «Tus vueltas» muestra un aviso y todas las vueltas válidas van a «Otros autos». No se usa el primer auto como reemplazo. |
| El jugador no tiene vueltas válidas | «Tus vueltas» muestra un aviso vacío; el resto se ordena en «Otros autos». |
| «Otros autos» sin filas | La sección no se dibuja. |
| Un comando de selección falla | Se muestra el mensaje con `mostrarError(mensajeComando(error))`; la lista no cambia porque no hay actualización optimista. |
| Se intenta poner B en la fila que es REF | La UI deshabilita B y explica el motivo; no se llama al backend. |
| Se pone REF en la fila que es B | Se permite; el backend reasigna la B y la UI refleja el nuevo resumen. |
| Se oculta la REF o la B | El backend normaliza y asigna reemplazo si existe; la lista se redibuja con el resumen recibido. |
| Se oculta la única vuelta visible | No queda REF; el dashboard se oculta. Comportamiento existente. |
| Sesión vacía o «Limpiar» | El listado se vacía, el dashboard se oculta y no quedan filas, roles ni secciones plegadas. |
| Clics rápidos en roles u ojo | La guarda de operación en curso evita respuestas fuera de orden y estados visuales inconsistentes. |
| El foco estaba en un control que se redibuja | Se restaura en el control equivalente; si no existe, vuelve a la cabecera de la sección. |
| Etiquetas o nombres largos | Se recortan visualmente, pero el nombre accesible y el `title` conservan el texto completo. |
| Ventana angosta | Los controles se envuelven y siguen siendo operables sin desplazamiento horizontal. |

---

## 7. Trazabilidad con las tareas

| Tarea | Implementación propuesta | Hecho cuando |
|---|---|---|
| **TV01 · Definir el panel** | Botón `tab-vueltas` y panel `panel-vueltas` con la misma estructura ARIA que las pestañas existentes; `iniciarTabs()` lo conecta sin cambios. | Se puede activar Vueltas desde el `tablist`, el panel aparece y los estados `aria-selected`/`aria-labelledby` son correctos. |
| **TV02 · Trasladar el listado** | La lista con `id="lista-vueltas"` vive dentro del panel; el lateral conserva solo reproductor y lecturas; se retira el plegado del lateral. | La pantalla de análisis ya no muestra la lista en el lateral y el panel Vueltas muestra las dos secciones. |
| **TV03 · Asignar REF y B** | Dos botones por fila válida, badge del rol actual, reglas de exclusión y llamadas a `fijarReferencia`/`fijarB`; se conserva el clic en la fila como atajo para REF. | Cada fila válida permite fijar REF o B, se ve la asignación actual, cambiar un rol sustituye el anterior y nunca hay una vuelta con ambos roles. |
| **TV04 · Visibilidad y reemplazo** | El ojo sigue llamando a `alternarVuelta`; `aplicarResumen` redibuja la lista con el resumen recibido; la normalización queda en el backend. | Ocultar/mostrar funciona y ocultar REF o B produce el reemplazo automático actual. |
| **TV05 · Presentación responsive y accesible** | Controles nativos, nombres accesibles, foco restaurado, secciones con `aria-controls`, filas que envuelven y estilos de foco. | Se puede recorrer y operar todo con teclado, el foco no se pierde tras un cambio y la ventana angosta no desborda. |
| **TV06 · Verificar el flujo completo** | Checklist manual multi-auto y compilación de Tauri. | Se cumplen los casos de la sección 8 y `cargo build -p ac-telemetry-lab` termina bien. |
| **TV07 · Orden fijo de la lista** | «Tus vueltas» con las vueltas del jugador en su orden actual; «Otros autos» como lista plana ordenada por tiempo ascendente con desempate estable; sin control de orden. | El jugador aparece primero, el resto va de más rápida a más lenta y los roles/visibilidad no cambian. |
| **TV08 · Exponer el jugador en el DTO** | `indice_jugador: Option<usize>` en `DtoResumen`, completado desde `replay.meta.indice_jugador` y validado contra `autos`; test que lo cubre. | El front recibe el índice correcto o `null`, y el test pasa. |

---

## 8. Verificación

### Comprobaciones estáticas

- `node --check front/app/selector_vueltas.js`
- `node --check front/app/main.js`

El repositorio no tiene lint, tests de front ni CI; estas comprobaciones solo
validan sintaxis.

### Tests y compilación

- `cargo test -p core` — incluye el test de `indice_jugador`.
- `cargo build -p ac-telemetry-lab` después de editar `front/`. Tauri embebe los
  assets al compilar, así que recargar la WebView no alcanza.

### Checklist manual

Con un replay multi-auto y su `fast_lane.ai`:

1. Cargar replay y pista; entrar al dashboard; abrir Vueltas.
2. Confirmar que solo se listan vueltas válidas y que «Tus vueltas» muestra las
   del jugador real (`current_recording_index`), no las del primer auto.
3. Confirmar que «Tus vueltas» conserva el orden del resumen.
4. Confirmar que «Otros autos» está ordenado por tiempo, de más rápida a más
   lenta, y que no hay botón de orden.
5. Confirmar que la asignación inicial automática de REF y B se ve en las filas
   correspondientes.
6. Fijar REF en otra vuelta del mismo auto: la REF anterior pierde el badge, la
   nueva lo recibe y la B no cambia si no era la REF anterior.
7. Fijar B en otra vuelta: la B anterior pierde el badge y los selectores «vs B»
   de Comparación y Curvas muestran la nueva B.
8. Promover a REF una vuelta que era B: la vuelta pasa a REF y el backend asigna
   una nueva B; la lista y las demás pestañas quedan coherentes.
9. Fijar REF en una vuelta de otro auto: Conjunto pasa a usar las vueltas
   válidas de ese auto, según el comportamiento actual del backend.
10. Ocultar una vuelta sin rol: desaparece de los gráficos, pero sigue listada
    con el ojo apagado.
11. Ocultar la REF: se asigna una REF de reemplazo y la lista lo refleja.
12. Ocultar la B: se asigna una B de reemplazo si hay otra vuelta visible
    distinta de la REF; si no, la B queda vacía.
13. Mostrar de nuevo las vueltas ocultas y comprobar que los roles se mantienen
    según el resumen.
14. Recorrer la pestaña solo con teclado: plegar/desplegar secciones con Enter y
    Espacio, fijar REF/B, alternar el ojo y comprobar que el foco se mantiene en
    la fila operada.
15. Reducir la ventana a un ancho de móvil: comprobar que no hay desplazamiento
    horizontal y que los controles siguen siendo alcanzables.
16. Visitar Vuelta, Mapa, Conjunto, Comparación y Curvas: deben seguir mostrando
    datos correctos y sin errores en consola.
17. Pulsar «Limpiar»: el dashboard se oculta y la lista queda vacía. Cargar otra
    sesión: no deben quedar filas, roles ni secciones colapsadas heredadas.

### Comprobación opcional por CDP

Para inspeccionar el DOM o el foco durante la verificación se puede abrir la
WebView con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
No es un requisito del cierre.

---

## 9. Riesgos y decisiones a confirmar

| # | Tema | Propuesta | Motivo / impacto |
|---|---|---|---|
| 1 | Orden de la pestaña | Vueltas después de Vuelta; la pestaña inicial sigue siendo Vuelta. | Mantiene el selector junto al análisis principal sin cambiar el arranque. |
| 2 | Forma del selector | Dos botones REF/B con `aria-pressed` por fila. | Es explícito, compacto y operable por teclado; un desplegable con «sin rol» no tendría comando de borrado. |
| 3 | Clic sobre la fila | Conservarlo como atajo para REF; los botones son la vía explícita. | No se pierde una acción existente y el selector nuevo sigue siendo claro. |
| 4 | Jugador no identificado | Aviso en «Tus vueltas» y todo a «Otros autos». | No se inventa un jugador; el usuario ve que el dato no vino en el replay. |
| 5 | B en la fila REF | Deshabilitar B con explicación. | El backend rechaza que una vuelta sea REF y B; es mejor prevenir que mostrar un error. |
| 6 | Foco tras redibujar | Recordar vuelta y acción, y restaurarlo. | El render reconstruye la lista y, sin esto, el teclado perdería el lugar. |
| 7 | Cambio de REF a otro auto | Verificar que Conjunto cambia de auto; no intervenir. | Es una consecuencia existente de `auto_referencia`; el cambio es solo de UI. |
| 8 | Secciones plegadas al limpiar | Vaciar el conjunto de plegados cuando no hay autos. | Evita que una sesión nueva herede secciones colapsadas de la anterior. |
| 9 | Lista muy ancha | Limitar el ancho de lectura del listado. | En pantallas grandes las filas completas de lado a lado son difíciles de seguir. |
| 10 | Orden por tiempo | Solo en esta pestaña; los selectores «vs B» conservan su orden. | El requisito es de Vueltas; cambiar los selectores alteraría otras pestañas sin pedirlo. |

---

## 10. Orden de implementación

1. **Backend mínimo:** exponer `indice_jugador` y cubrirlo con tests. (TV08)
2. **Estructura:** agregar la pestaña y el panel; mover la lista; retirar el
   plegado del lateral. (TV01, TV02)
3. **Render:** filtrar válidas, separar jugador/otros, ordenar por tiempo y
   agregar badge B y estados de fila. (TV02, TV03, TV07)
4. **Roles:** agregar los botones REF/B, las reglas de exclusión y la
   restauración de foco. (TV03, TV05)
5. **Visibilidad:** conectar el ojo y comprobar que el reemplazo automático se
   refleja desde el resumen. (TV04)
6. **Presentación:** estilos responsive, foco visible y ajustes de accesibilidad.
   (TV05)
7. **Cierre:** checklist manual, `node --check`, `cargo test -p core` y
   `cargo build -p ac-telemetry-lab`. (TV06)
8. Marcar TV01–TV08 en `tareas.md` y actualizar `MEMORY.md`.

---

## 11. Definición de terminado

- La pestaña Vueltas existe, es accesible y sigue las convenciones del `tablist`.
- El lateral ya no muestra el listado; conserva reproductor y lecturas.
- La lista muestra solo vueltas válidas en dos secciones: el jugador real primero
  en su orden actual y el resto por tiempo ascendente.
- Si el jugador no se identifica, hay un aviso y no se usa el primer auto.
- Cada fila válida permite fijar REF o B; el rol actual se identifica con badge,
  estado presionado y clase de fila; nunca hay una vuelta con ambos roles.
- El ojo muestra u oculta vueltas y, al ocultar REF o B, se conserva el reemplazo
  automático actual.
- La lista se actualiza siempre desde el `DtoResumen` recibido, sin estado
  duplicado en el front.
- El foco se conserva tras las operaciones y la pestaña es utilizable con
  teclado y en ventanas angostas.
- Las demás pestañas siguen funcionando y «Limpiar» deja la lista vacía.
- `cargo test -p core` y `cargo build -p ac-telemetry-lab` terminan correctamente.
- No se modificaron el formato de datos, los comandos, la lógica de análisis ni
  la persistencia; el único cambio de backend es el campo `indice_jugador`.
