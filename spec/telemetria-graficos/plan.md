# Plan de implementación — Gráficos de Telemetría: ampliar y elegir canales

Documento de diseño para ver con más detalle los gráficos de la pestaña
Telemetría (id interno `vuelta`). Tareas en `spec/telemetria-graficos/tareas.md`.

Fuentes normativas:

- `doc/constitucion.md` — principios (stack mínimo, lógica aparte de la UI, sin
  persistencia, idioma).
- `DESIGN.md` y `.impeccable/design.json` — sistema de diseño ("El muro de
  boxes"); la UI nueva lo respeta.
- `front/index.html`, `front/app/pestanas/vuelta.js`,
  `front/app/graficos/uplot.js`, `front/app/reproductor.js`, `front/estilos.css`
  — estado real de la interfaz.

---

> **Actualización 2026-11-24:** la parte 2 (chips de canales y reparto del
> alto, §4 y TG06–TG07) se implementó y luego se retiró a pedido del usuario.
> Queda vigente solo "Ver en grande" (§3).

## 0. Resumen ejecutivo

Dos cambios, solo de front (sin Rust, sin DTO, sin comandos):

1. **Botón "Ver en grande" (⤢)** en el título de cada gráfico de Telemetría. Abre
   el gráfico en un overlay casi a pantalla completa, con la regla de curvas y
   **zoom en el eje X** (arrastrar para acercar, doble clic o "Vuelta completa"
   para volver).
2. **Chips de canales** sobre los gráficos: una fila de botones conmutables
   (`Velocidad · RPM · Marcha · Volante · Acel. · Rumbo · Carga · Pedales`). Solo
   se dibujan los gráficos activos y **se reparten el alto disponible**: con
   menos gráficos, cada uno es más alto.

Decisiones que ordenan el diseño:

1. **Una sola definición de los gráficos.** Una tabla `GRAFICOS_TELEMETRIA`
   (clave, título, unidad, alto mínimo y cómo construir datos/series) alimenta
   el render normal, los chips y el overlay. Así no se duplica la configuración
   de las 8 series.
2. **Se dibujan solo los gráficos activos.** Los ocultos no crean uPlot; la
   pestaña rinde igual o mejor que hoy.
3. **El zoom vive solo en el overlay.** Los gráficos de la pestaña siguen
   mostrando la vuelta completa, como hoy.
4. **Cursor sincronizado gratis.** El uPlot del overlay usa la misma clave de
   sincronía (`SYNC_KEY`), así que sigue al reproductor y a los demás gráficos.
5. **Selección en memoria.** Los canales activos viven en `state` y se pierden
   al cerrar la app (constitución: sin persistencia, sin `localStorage`).

---

## 1. Punto de partida

| Pieza | Estado actual | Uso en este plan |
|---|---|---|
| `front/index.html` | Panel `panel-vuelta`: regla de curvas + 8 `.grafico-card` fijas (`chart-speed` … `chart-inputs`). Overlay `#zoom-teorico` (diálogo con foco/Esc) usado por la trazada teórica. | Agregar `data-grafico` y botón ⤢ a cada tarjeta, la fila de chips y un diálogo nuevo `#grafico-ampliado`. |
| `front/app/pestanas/vuelta.js` | `renderPestanaVuelta` crea los 8 gráficos con llamadas sueltas a `lineChart`; `dibujarReglaCurvas` usa el canvas `ch-regla-curvas` y `state.charts.lines[0]`. | Pasar a la tabla de definiciones; crear solo los activos; parametrizar la regla (canvas + uPlot). |
| `front/app/graficos/uplot.js` | `opcionesGrafico` con `drag.setScale: false` (no hay zoom); `lineChart` registra en `state.charts.lines`; `moverCursor` usa `lines[0]`. | Opción para habilitar el zoom en X; `lineChart` acepta alto variable. |
| `front/app/reproductor.js` | `actualizarPorIdx` redibuja la regla y mueve el cursor; Espacio = play/pausa. | Redibujar también la regla del overlay si está abierto. |
| `front/app/main.js` | `init` y `iniciarResize` (re-render con debounce al cambiar el tamaño de ventana). | Iniciar chips y overlay; redimensionar el overlay. |
| `front/app/estado.js` | `state.charts = { lines, inputs }`. | Agregar `state.graficosOcultos`. |
| `front/estilos.css` | `.zoom-overlay`, `.zoom-panel`, `.btn-ampliar` ya existen (trazada teórica). | Reutilizar clases; estilos de chips y alto del overlay. |

---

## 2. Alcance

### Dentro del alcance

- Botón ⤢ en las 8 tarjetas de Telemetría y overlay con zoom en X.
- Regla de curvas dentro del overlay, alineada con el zoom.
- Fila de chips para mostrar/ocultar cada gráfico, con reparto del alto.
- Accesibilidad (diálogo, teclado, `aria-pressed`) y responsive desde 360 px.
- Registrar los cambios en `doc/Catalogo_Graficos.md`.

### Fuera del alcance

- Zoom en los gráficos de la pestaña (opción "A" de la evaluación) y barra de
  vista general (opción "C").
- Grupos predefinidos de canales (opción "2c").
- Botón ⤢ o chips en las demás pestañas (Comparación, Curvas, Conjunto).
- Cambios en Rust, DTO, comandos o persistencia.

---

## 3. Diseño — Botón "Ver en grande"

### 3.1 Disparador

- Cada `.grafico-card` de Telemetría lleva en su `<h2>` un botón
  `⤢ Ver en grande` (misma clase `btn fantasma btn-ampliar` que ya usa la
  trazada teórica) con `aria-label="Ver en grande: <título>"`.
- Solo los gráficos activos muestran el botón (los ocultos no se ven).

### 3.2 Diálogo

- Nuevo `<section id="grafico-ampliado" class="zoom-overlay oculto"
  role="dialog" aria-modal="true" aria-labelledby="ampliado-titulo">`, con la
  misma estructura que `#zoom-teorico` (cabecera, acciones, cuerpo).
- **No se reutiliza `#zoom-teorico`**: su lógica (`zoomTeorico`) está atada a un
  canvas de mapa. Se reutilizan solo las clases CSS para no tocar algo que
  funciona.
- Cabecera: título del gráfico + unidad, y acciones `−`, `+`,
  `Vuelta completa` y `✕`.
- Cuerpo: canvas de regla de curvas (`ch-regla-ampliado`) y el contenedor del
  uPlot (`plot-ampliado`).
- Alto del gráfico: el disponible en el panel (≈ `100vh` menos cabecera y
  regla), con mínimo de 240 px.

### 3.3 Gráfico dentro del overlay

- Se construye un uPlot nuevo con la **misma definición** de la tabla
  (`GRAFICOS_TELEMETRIA[clave]`) y los datos actuales (`state.datosVuelta`).
- No se registra en `state.charts.lines` (para que `destroyCharts` y la regla
  principal no lo toquen); vive en el objeto `ampliado` de `ampliado.js`.
- uPlot aplica `setScale` de forma diferida: el rango visible se guarda aparte
  (`ampliado.rango`) y, mientras se aplica un zoom, los eventos de cursor que
  uPlot recalcula se ignoran para no mover el reproductor.
- Usa `SYNC_KEY`: el cursor se sincroniza con el reproductor y la pestaña.
- **Pedales** (mini-gráfico por vuelta): el overlay muestra los mini-gráficos de
  todas las vueltas visibles apilados, con más alto cada uno. Todos comparten
  el mismo rango X del zoom.

### 3.4 Zoom en X

- `drag: { x: true, y: false, setScale: true }` solo en el overlay: arrastrar
  selecciona un tramo y acerca.
- Doble clic o `Vuelta completa`: vuelve a `[0, largo de pista]`.
- `+` / `−`: acercan o alejan ×1,5 centrados en el cursor (o en el centro si no
  hay cursor). Mínimo ~50 m de ancho visible; máximo, la vuelta completa.
- Es la vía para pantallas táctiles, donde el arrastre de uPlot no está
  garantizado.
- El eje Y se ajusta solo al tramo visible (`auto: true`), salvo los gráficos que
  hoy tienen rango fijo (aceleración y carga desde 0).
- El zoom no se propaga a la pestaña (la sincronía de uPlot es solo de cursor).

### 3.5 Regla de curvas en el overlay

- `dibujarReglaCurvas` pasa a recibir `(canvasId, u)`; la pestaña la sigue
  llamando con `ch-regla-curvas` y el primer gráfico activo.
- Con zoom, `u.valToPos` ya devuelve la posición en la escala acercada y el
  dibujo ya está recortado al área de trazado: las curvas fuera del tramo no se
  ven y las parciales se cortan en el borde.
- Se redibuja al cambiar la escala (hook `setScale`) y en cada
  `actualizarPorIdx` mientras el overlay está abierto.

### 3.6 Abrir, cerrar y foco

- Al abrir: se guarda el foco previo, se muestra el diálogo, se crea el uPlot en
  `requestAnimationFrame` (uPlot necesita el contenedor ya medido) y el foco va
  al contenedor del gráfico (`tabindex="0"`): si fuera a `✕`, Espacio cerraría
  el diálogo en lugar de reproducir.
- Esc o `✕`: se destruye el uPlot del overlay, se oculta el diálogo y el foco
  vuelve al botón ⤢ que lo abrió.
- Tab queda atrapado en el diálogo, como en `#zoom-teorico`.
- Espacio sigue siendo play/pausa (el reproductor escucha en `window`), así que
  la reproducción se puede seguir dentro del overlay; el cursor avanza solo.

### 3.7 Cambios mientras está abierto

- Redimensionar la ventana: `setSize` del uPlot del overlay conservando el zoom.
- Si `renderPestanaActiva` vuelve a correr (resize), el overlay no se destruye
  porque no está en `state.charts.lines`.
- Los cambios de REF/B o visibilidad no son posibles con el diálogo modal
  abierto; no hace falta sincronizarlos.

---

## 4. Diseño — Chips de canales

### 4.1 Fila de chips

- Encima de la regla de curvas, una fila `role="group"
  aria-label="Gráficos visibles"` con 8 botones `type="button"` y
  `aria-pressed`: `Velocidad · RPM · Marcha · Volante · Acel. · Rumbo · Carga ·
  Pedales`.
- El estado no depende solo del color: chip activo con relleno y marca ✓,
  inactivo con borde.
- Un enlace/botón final `Todos` vuelve a activar los 8.

### 4.2 Estado

- `state.graficosOcultos`: `Set` de claves ocultas (vacío = todos visibles). Por
  defecto **los 8 activos** (comportamiento actual).
- **No se puede desactivar el último**: su chip queda con `aria-disabled` y un
  `title` que lo explica. Evita una pestaña vacía.
- La selección se conserva al cambiar de pestaña y de REF/B, y se reinicia con
  "Limpiar" o al cargar otra sesión.

### 4.3 Render

- `renderPestanaVuelta` recorre `GRAFICOS_TELEMETRIA` y solo crea los activos;
  la tarjeta de un gráfico inactivo queda con `hidden`.
- Cambiar un chip vuelve a llamar a `renderPestanaVuelta` con los mismos datos
  (sin pedir DTO al backend).
- La regla de curvas y `moverCursor` usan **el primer gráfico activo** en lugar
  de "Velocidad" fija (hoy `state.charts.lines[0]` es siempre Velocidad).
- **Carga** solo existe si hay REF; si su chip está activo y no hay REF, su
  tarjeta muestra el aviso habitual.

### 4.4 Reparto del alto

- Alto disponible = alto de ventana − barra superior − pestañas − chips − regla
  − márgenes de tarjeta (se leen las variables `--alto-topbar` y `--alto-tabs`
  que ya mide `medirBarras`).
- Cada gráfico activo recibe `max(altoMinimo, disponible / n)`, con tope de
  ~520 px para que un solo gráfico no quede desproporcionado.
- `altoMinimo` = los altos de hoy (250, 170, 140, 150, 150, 140, 170, 140). Con
  los 8 activos la pestaña se ve igual que ahora.
- Pedales: el alto asignado se reparte entre sus mini-gráficos, con mínimo de
  140 px cada uno.

---

## 5. Cambios por archivo

| Archivo | Cambio | Tareas |
|---|---|---|
| `front/index.html` | `data-grafico` y botón ⤢ en las 8 tarjetas; fila de chips; diálogo `#grafico-ampliado`; `<script>` del módulo nuevo si se aprueba (decisión 1). | TG01, TG04, TG06 |
| `front/app/pestanas/vuelta.js` | Tabla `GRAFICOS_TELEMETRIA`; render solo de activos con alto repartido; `dibujarReglaCurvas(canvasId, u)`. | TG02, TG03, TG07 |
| `front/app/graficos/uplot.js` | Opción `zoomX` en `opcionesGrafico`; `moverCursor` sobre el primer gráfico activo. | TG03, TG05 |
| `front/app/graficos/ampliado.js` *(nuevo, a confirmar)* | Abrir/cerrar el diálogo, crear el uPlot del overlay, botones de zoom, foco. | TG04, TG05 |
| `front/app/reproductor.js` | En `actualizarPorIdx`, redibujar la regla del overlay si está abierto. | TG05 |
| `front/app/main.js` | Iniciar chips y overlay; redimensionar el overlay en `resize`. | TG04, TG06 |
| `front/app/estado.js` | `graficosOcultos`. | TG02, TG06 |
| `front/app/carga.js` | Reiniciar `graficosOcultos` al limpiar o cargar otra sesión. | TG06 |
| `front/estilos.css` | Chips (con scroll horizontal en móvil), alto del overlay, regla del overlay. | TG04, TG06, TG08 |
| `doc/Catalogo_Graficos.md` | Registrar "Ver en grande" con zoom y la elección de canales. | TG09 |
| `MEMORY.md` | Estado y decisiones al cerrar. | TG09 |

Sin cambios: `core/`, `src-tauri/`, `puente.js`, DTO, comandos.

---

## 6. Accesibilidad y responsive

- Diálogo: `role="dialog"`, `aria-modal`, foco inicial en `✕`, Tab atrapado, Esc
  cierra, foco devuelto al ⤢ de origen.
- Botones de zoom con `aria-label` ("Acercar", "Alejar"); "Vuelta completa" con
  texto visible.
- Chips: botones nativos con `aria-pressed`; el último activo con
  `aria-disabled` y explicación.
- Targets ≥ 24 px (32 px con `pointer: coarse`), como el resto de la app.
- 360 px: el diálogo ocupa toda la pantalla; las acciones de la cabecera pueden
  pasar a una segunda línea; la fila de chips se desplaza en horizontal sin
  desbordar la página.
- `prefers-reduced-motion`: sin animación al abrir el diálogo.

---

## 7. Errores y estados límite

| Caso | Comportamiento previsto |
|---|---|
| Se intenta desactivar el último chip | No cambia; el chip explica que debe quedar al menos un gráfico. |
| Velocidad oculta | La regla y el cursor se alinean con el primer gráfico activo. |
| Carga activa sin REF | Tarjeta con aviso; el ⤢ queda deshabilitado. |
| Zoom menor a ~50 m | Se limita a 50 m. |
| Doble clic en el overlay | Vuelve a la vuelta completa. |
| Resize con el overlay abierto | `setSize` del uPlot del overlay; se conserva el zoom. |
| Reproducción en curso al abrir | El cursor del overlay sigue avanzando; Espacio pausa. |
| Curva parcialmente fuera del zoom | La regla la recorta en el borde; su nombre se centra en la parte visible. |
| "Limpiar" o nueva sesión | Se cierra el overlay si estaba abierto y los 8 chips vuelven a activos. |
| Ventana de 360 px | Diálogo a pantalla completa, chips con scroll horizontal, sin scroll horizontal de la página. |

---

## 8. Verificación

### Comprobaciones estáticas

- `node --check` sobre cada archivo JS tocado.

### Tests y compilación

- `cargo test --workspace` debe seguir en verde (no hay cambios de lógica en
  Rust; el front no tiene tests automáticos).
- `cargo build -p ac-telemetry-lab` tras editar `front/` (ver receta MSVC en
  `MEMORY.md`).

### Checklist manual

Con un replay y su `fast_lane.ai`:

1. Telemetría muestra los 8 chips activos y se ve igual que antes.
2. Desactivar 6 chips: los 2 restantes ocupan el alto de la ventana; la regla y
   el cursor siguen alineados.
3. Desactivar Velocidad: la regla se alinea con el nuevo primer gráfico.
4. Intentar desactivar el último chip: no se puede y se explica.
5. Cambiar de pestaña y volver: la selección se conserva.
6. ⤢ en Velocidad: se abre el diálogo con regla y gráfico grandes.
7. Arrastrar sobre un tramo: acerca; la regla muestra solo las curvas de ese
   tramo; doble clic vuelve a la vuelta completa.
8. `+`, `−` y "Vuelta completa" funcionan sin ratón.
9. Espacio reproduce y el cursor del overlay y la regla avanzan.
10. Esc cierra y el foco vuelve al ⤢.
11. ⤢ en Pedales: mini-gráficos por vuelta, todos con el mismo zoom.
12. Redimensionar la ventana con el overlay abierto: se adapta sin perder el zoom.
13. Ancho de 360 px: diálogo a pantalla completa, chips desplazables.
14. "Limpiar" y cargar otra sesión: chips de nuevo todos activos.
15. Las demás pestañas (incluido el ⤢ de la trazada teórica) siguen funcionando.

---

## 9. Decisiones a confirmar

| # | Tema | Propuesta | Motivo |
|---|---|---|---|
| 1 | Archivo nuevo para el overlay | `front/app/graficos/ampliado.js` | `vuelta.js` ya mezcla render y regla; el overlay es una pieza aparte. AGENTS.md pide preguntar antes de crear archivos. |
| 2 | Gráficos al entrar | Los 8 activos | Mantiene el comportamiento actual; el usuario recorta si quiere. |
| 3 | Pedales | Un solo chip y un solo ⤢ para todas las vueltas | Es una sola tarjeta hoy; separar por vuelta complica la fila de chips. |
| 4 | Zoom | Solo en el overlay | Es lo pedido (1 + 2a); el zoom en la pestaña queda como mejora futura. |
| 5 | Reproductor en el overlay | Sin controles propios; Espacio y el cursor sincronizado alcanzan | Evita duplicar el reproductor dentro del diálogo. |
| 6 | Tope de alto por gráfico | ~520 px | Con un solo gráfico activo, más alto no agrega lectura y obliga a mover la vista. |

---

## 10. Orden de implementación

1. Tabla `GRAFICOS_TELEMETRIA` y render a partir de ella, sin cambiar lo que se
   ve. (TG02)
2. Regla y cursor sobre el primer gráfico activo. (TG03)
3. Chips, estado y reparto del alto. (TG06, TG07)
4. Diálogo y uPlot del overlay. (TG01, TG04)
5. Zoom en X, botones y regla en el overlay. (TG05)
6. Estilos responsive y accesibilidad. (TG08)
7. Verificación, catálogo y `MEMORY.md`. (TG09)

---

## 11. Definición de terminado

- Cada gráfico de Telemetría tiene ⤢ y se ve en grande con zoom en X y regla de
  curvas alineada.
- El usuario elige qué gráficos ver; los activos se reparten el alto y la regla y
  el cursor siguen alineados.
- Con los 8 activos, la pestaña se ve como antes.
- Todo es operable con teclado y se ve bien a 360 px.
- `cargo test --workspace` y `cargo build -p ac-telemetry-lab` terminan bien.
- No se tocaron Rust, DTO, comandos ni persistencia.
