# Plan de implementación — Tablero de gráficos

Documento de diseño del nuevo front: un **tablero libre** donde el usuario agrega
cualquier gráfico desde un menú, lo mueve y le cambia el tamaño. Reemplaza las
pestañas de gráficos. Tareas en `spec/tablero/tareas.md`.

Fuentes normativas:

- `doc/constitucion.md` — principios; este plan **enmienda el principio 5** (§2).
- `DESIGN.md` y `.impeccable/design.json` — sistema de diseño; la UI nueva lo respeta.
- `front/index.html`, `front/app/` — estado real de la interfaz.
- `src-tauri/src/comandos.rs`, `core/src/dto.rs` — contrato de datos (no cambia).

---

## 0. Resumen ejecutivo

**Qué sigue:** todos los gráficos actuales, el panel lateral (reproductor,
lecturas, sesión) y la pestaña **Vueltas**.

**Qué se va:** los gráficos agrupados por pestañas (Telemetría, Mapa, Conjunto,
Comparación, Curvas).

**Qué es nuevo:** una pestaña **Tablero** con una grilla libre (Gridstack.js) donde
cada gráfico es una tarjeta que se agrega desde un menú, se mueve y se
redimensiona. El diseño del tablero se recuerda entre ejecuciones.

Decisiones tomadas por el usuario (2026-11-24):

| # | Tema | Decisión |
|---|---|---|
| 1 | Cómo se cambia el tamaño | **Gridstack.js vendorizado**: arrastre y redimensión libres sobre una grilla. |
| 2 | Persistencia | **Se guarda solo el diseño del tablero** (enmienda del principio 5). Nunca datos de telemetría. |
| 3 | Al entrar | **Tablero vacío** (la primera vez o tras vaciarlo); después, el último diseño guardado. |
| 4 | Migración | **Reemplazar las pestañas** (sin convivencia de los dos fronts). |
| 5 | Copias | **Se puede agregar el mismo gráfico varias veces**, cada copia con sus ajustes. |

Consecuencias que ordenan el diseño:

1. **Cada gráfico pasa a ser una pieza independiente** (`montar` / `redimensionar` /
   `destruir`) que se dibuja en cualquier contenedor. Hoy cada pestaña dibuja todos
   sus gráficos sobre ids fijos del HTML; ese es el grueso del trabajo.
2. **La regla de curvas pasa a ser por tarjeta.** Con anchos libres, una regla
   global ya no puede alinearse con todos los gráficos.
3. **La elección de B pasa a ser global** (hoy está en los selectores «vs B» de
   Comparación y Curvas).
4. **El backend no cambia.** Los DTO por «pestaña» (`vuelta`, `mapa`, `conjunto`,
   `comparacion`, `curvas`) pasan a ser **fuentes de datos**: el tablero pide solo
   las que usan las tarjetas presentes.
5. **Reemplazo en una rama.** Todo se hace en `tablero/playground`; `main` conserva
   las pestañas hasta que el tablero esté completo y se mergee.

---

## 1. Punto de partida

| Pieza | Estado actual | En el tablero |
|---|---|---|
| `front/index.html` | Pestañas Telemetría, Vueltas, Mapa, Conjunto, Comparación, Curvas; ~37 tarjetas con ids fijos. | Pestañas **Tablero** y **Vueltas**; el tablero se arma por JS. |
| `front/app/main.js` | `renderPestanaActiva` pide el DTO de la pestaña y llama a su render. | Despacha Tablero/Vueltas; el tablero pide fuentes según sus tarjetas. |
| `front/app/pestanas/*.js` | ~2000 líneas: un render por pestaña sobre ids fijos. | Se reparte en módulos por categoría bajo `front/app/graficos/`, con el contrato de §4. |
| `front/app/graficos/uplot.js` | `lineChart`, `SYNC_KEY` (cursor sincronizado), `graficoGuia`. | Se reutiliza; cada tarjeta uPlot registra su instancia. |
| `front/app/graficos/ampliado.js` | «Ver en grande» atado a `GRAFICOS_TELEMETRIA` y `state.datosVuelta`. | Se generaliza a cualquier tarjeta uPlot. |
| `front/app/reproductor.js` | `actualizarPorIdx` redibuja la regla si `state.tab === 'vuelta'` y el mapa en vivo si `state.tab === 'mapa'`. | Avisa a todas las tarjetas montadas (`alCursor`). |
| `front/app/selector_vueltas.js` | `poblarSelB` / `fijarBDesdeSelect` alimentan los «vs B». | Un único selector de B global (§5.4). |
| `front/app/puente.js` | `pedirPestana(pestana, rot, alt)` con caché por versión. | Sin cambios. |
| Backend (`core`, `src-tauri`) | DTO por pestaña. | **Sin cambios.** |

### Inventario de gráficos (37)

| Categoría (ex pestaña) | Gráficos | Fuente |
|---|---|---|
| **Una vuelta** (Telemetría) | Velocidad · RPM · Marcha · Volante · Aceleración total · Rumbo · Carga por rueda · Acelerador/Freno por vuelta | `vuelta` |
| **Mapas** (Mapa) | Mapa de pista · Carga por rueda en vivo | `mapa` / `vuelta` |
| **Conjunto** | Tiempos por vuelta · Velocidad media/máx · Envolvente de velocidad · Histograma de velocidad · Uso de marchas · Combustible por vuelta · Desvío lateral vs REF · Tiempo por sector · Mapa por sectores · Trazada de mejores sectores · Consistencia por curva · Dispersión de velocidad · Resumen por vuelta (tabla) · Vuelta teórica | `conjunto` |
| **Comparación A/B** | Delta A−B · Pendiente del delta · Dónde pierde tiempo A (ranking, tabla) · Diferencia de velocidad · Diferencia de pedales · Delta por sector | `comparacion` |
| **Curvas** | Mapa por curvas · Tiempo por curva · Círculo de tracción por curva · Métricas por curva (tabla) · Delta por curva · Fases de curva · Balance y slip | `curvas` |

La lista exacta y la fuente de cada uno se confirman al migrar cada categoría.

---

## 2. Enmienda de la constitución (principio 5)

Texto actual: *«Sin persistencia — nada se escribe en disco: los datos viven solo
en memoria durante la sesión.»*

Texto propuesto:

> 5. **Sin persistencia de datos** — los datos de telemetría y del análisis viven
>    solo en memoria durante la sesión. Única excepción: el **diseño del tablero**
>    (qué gráficos hay, su posición, tamaño y ajustes) se guarda en el
>    `localStorage` del WebView.
>    *Verificable*: el binario no escribe archivos; `localStorage` solo contiene la
>    clave del diseño, sin rutas, nombres de pilotos, tiempos ni datos del replay.

Se actualizan en el mismo cambio: `AGENTS.md` (reglas duras: «ni `localStorage`»),
`README.md` (línea «no persiste datos en disco») y `MEMORY.md`.

---

## 3. Gridstack.js

- **Qué es:** librería de grilla con arrastre y redimensión, sin dependencias,
  licencia MIT. No es un framework de UI: no impone componentes ni render; encaja
  en el principio 1 igual que uPlot (vendorizada, sin paso de build).
- **Cómo se incorpora:** `front/vendor/gridstack/` con `gridstack-all.js`,
  `gridstack.min.css` y su `LICENSE`. Se fija la última versión estable al
  implementar y se anota en `README.md` (sección de dependencias vendorizadas).
- **Configuración base:** 12 columnas; alto de celda fijo (~60 px); margen 8 px;
  arrastre solo desde la cabecera de la tarjeta (`handle`); compactación vertical
  (sin huecos); a ≤ 640 px pasa a **1 columna** (`columnOpts`).
- **Tarjetas:** se crea el elemento con DOM y se registra con `grid.makeWidget`
  (no se pasa HTML como texto).
- **Eventos:** `resizestop` / `dragstop` / `change` → redibujar lo necesario y
  guardar el diseño; además un `ResizeObserver` por tarjeta (con debounce) para
  redibujar el gráfico cuando cambia su tamaño.
- **Teclado:** Gridstack no es accesible por teclado; cada tarjeta suma un menú
  con «Mover» (← → ↑ ↓) y «Tamaño» (más ancho/angosto, más alto/bajo) que llama a
  `grid.update`.

---

## 4. Contrato de un gráfico (catálogo)

Un registro único `CATALOGO_GRAFICOS` (en `front/app/tablero/catalogo.js`) con una
entrada por gráfico:

```js
{
  id: 'velocidad',              // estable: es lo que se guarda en el diseño
  nombre: 'Velocidad',
  categoria: 'una-vuelta',      // una-vuelta | mapas | conjunto | comparacion | curvas
  fuente: 'vuelta',             // DTO que necesita (puente.pedirPestana)
  ejeDistancia: true,           // lleva regla de curvas propia
  ampliable: true,              // ofrece «Ver en grande»
  tamano: { w: 6, h: 4, minW: 3, minH: 2 },   // en celdas de la grilla
  ajustes: [                    // opcionales, por tarjeta
    { clave: 'canal', etiqueta: 'Canal', tipo: 'select', opciones: [...], valor: 'velocidad_kmh' },
  ],
  montar(cuerpo, datos, ajustes) {
    // dibuja en `cuerpo` y devuelve la instancia:
    return { redimensionar() {}, alCursor(idx) {}, destruir() {} };
  },
}
```

- `montar` recibe un contenedor vacío; **ningún gráfico usa ids fijos**.
- `redimensionar` se llama cuando cambia el tamaño de la tarjeta.
- `alCursor` (opcional) recibe el índice del reproductor: mapas en vivo, carga en
  vivo, regla de curvas.
- `destruir` libera uPlot, observers y listeners.

---

## 5. Diseño de la pantalla

### 5.1 Estructura

- **Barra superior** sin cambios (cargar replay, pista, limpiar, avisos).
- **Pestañas:** `Tablero` (inicial) y `Vueltas`.
- **Panel lateral** sin cambios de contenido: reproductor, lecturas y sesión, más
  el selector de B global (§5.4).
- **Tablero:** barra de herramientas (`+ Agregar gráfico`, `Vaciar tablero`) y la
  grilla.

### 5.2 Estado vacío

Sin tarjetas, el tablero muestra un mensaje centrado («Tu tablero está vacío») y
el botón `+ Agregar gráfico`. Es lo que se ve la primera vez y tras «Vaciar
tablero» (que pide confirmación).

### 5.3 Menú «Agregar gráfico»

- Panel lateral derecho (en el celular, a pantalla completa) con buscador y los
  gráficos agrupados por categoría.
- Cada entrada: nombre, una línea de descripción y botón `Agregar`. Se puede
  agregar el mismo gráfico varias veces.
- La tarjeta nueva entra en el primer hueco libre con su tamaño inicial, se hace
  visible (scroll) y recibe el foco.
- Los gráficos que necesitan B muestran un aviso si no hay B elegida.

### 5.4 Elección de B

Los selectores «vs B» de Comparación y Curvas desaparecen. Queda **un selector de
B en el panel lateral**, en el bloque «Sesión», que usa `poblarSelB` /
`fijarBDesdeSelect`. La pestaña Vueltas sigue permitiendo fijar REF y B. Cambiar
REF o B redibuja todas las tarjetas desde el `DtoResumen`, como hoy.

### 5.5 La tarjeta

- **Cabecera** (zona de arrastre): título + unidad, y acciones `⤢ Ver en grande`
  (si es ampliable), `⚙ Ajustes` (si tiene), `⋯` (mover/tamaño por teclado) y
  `✕ Quitar`.
- **Regla de curvas propia** si `ejeDistancia`: el mismo dibujo de
  `dibujarReglaCurvas`, alineado al uPlot de la tarjeta.
- **Cuerpo:** el gráfico, que ocupa todo el alto disponible.
- **Manija de tamaño** de Gridstack en la esquina inferior derecha.
- Ajustes: un pequeño panel desplegable dentro de la tarjeta; al cambiar un valor,
  se vuelve a montar el gráfico y se guarda el diseño.
- Los que hoy tienen interacción propia la conservan: ranking (tocar una fila →
  `irA`), trazada teórica (zoom propio), círculos de tracción (abrir en grande),
  tooltips de sectores y curvas.

### 5.6 Cursor y reproductor

- Las tarjetas uPlot comparten `SYNC_KEY`: el cursor se sincroniza entre todas.
- `actualizarPorIdx` deja de mirar `state.tab` y llama a `alCursor` de cada
  instancia montada (regla de curvas, mapa en vivo, carga en vivo).
- `moverCursor` usa la primera tarjeta uPlot con eje de distancia.

---

## 6. Datos

- Al renderizar el tablero se calculan las fuentes que usan las tarjetas y se piden
  con `puente.pedirPestana` (con su caché por versión). Una fuente sin tarjetas no
  se pide.
- Al cambiar de sesión, REF, B o visibilidad (`aplicarResumen` → `state.version++`)
  se vuelven a pedir las fuentes y se remontan las tarjetas.
- Mapas: las copias con distinta rotación/elevación piden su propio DTO `mapa`
  (el caché ya usa `rot`/`alt` como clave).
- Sin datos (no hay sesión cargada), el tablero no se muestra: igual que hoy, el
  análisis exige replay y pista.

---

## 7. Persistencia del diseño

- Clave única: `ac-telemetry-lab.tablero.v1` en `localStorage`.
- Contenido: `{ version: 1, tarjetas: [{ id, x, y, w, h, ajustes }] }`. Solo ids del
  catálogo, posiciones, tamaños y ajustes; **nada del replay**.
- Se guarda (con debounce) al agregar, quitar, mover, redimensionar o cambiar
  ajustes. Se lee al iniciar la app.
- Al leer se valida: se descartan tarjetas con `id` desconocido o tamaños fuera de
  rango y ajustes con valores que ya no existen (vuelven al valor por defecto).
  Si el JSON es inválido o de otra versión, se empieza con el tablero vacío y se
  avisa una vez.
- «Vaciar tablero» deja la clave con cero tarjetas.

---

## 8. Archivos

| Archivo | Cambio |
|---|---|
| `front/vendor/gridstack/` *(nuevo)* | `gridstack-all.js`, `gridstack.min.css`, `LICENSE`. |
| `front/app/tablero/tablero.js` *(nuevo)* | Grilla, agregar/quitar, estado vacío, barra, eventos de Gridstack, render por fuentes. |
| `front/app/tablero/catalogo.js` *(nuevo)* | `CATALOGO_GRAFICOS` y categorías. |
| `front/app/tablero/tarjeta.js` *(nuevo)* | Cabecera, regla propia, ajustes, menú de teclado, `ResizeObserver`. |
| `front/app/tablero/menu.js` *(nuevo)* | Menú «Agregar gráfico» con buscador. |
| `front/app/tablero/diseno.js` *(nuevo)* | Guardar, leer y validar el diseño. |
| `front/app/graficos/una_vuelta.js`, `mapas.js`, `conjunto.js`, `comparacion.js`, `curvas.js` *(nuevos)* | Gráficos migrados desde `pestanas/` con el contrato de §4. |
| `front/app/pestanas/*.js` | Se eliminan al terminar la migración (se conserva lo que use Vueltas). |
| `front/app/graficos/ampliado.js` | Generalizado a cualquier tarjeta uPlot. |
| `front/app/reproductor.js`, `main.js`, `estado.js`, `carga.js`, `selector_vueltas.js` | Despacho Tablero/Vueltas, `alCursor` por instancia, B global. |
| `front/index.html`, `front/estilos.css` | Pestañas nuevas, tablero, tarjeta, menú, estilos de Gridstack adaptados a `DESIGN.md`. |
| `doc/constitucion.md`, `AGENTS.md`, `README.md` | Enmienda del principio 5; Gridstack en dependencias. |
| `doc/Catalogo_Graficos.md`, `MEMORY.md` | Reflejar el tablero. |

Sin cambios: `core/`, `src-tauri/`, `puente.js`, DTO, comandos.

---

## 9. Accesibilidad y responsive

- Tarjetas operables por teclado: foco en la cabecera, menú `⋯` para mover y
  cambiar tamaño, `✕` con nombre accesible («Quitar Velocidad»).
- Menú «Agregar gráfico» como diálogo (foco, Tab atrapado, Esc).
- Anuncio en una región `aria-live` al agregar, quitar o mover («Velocidad
  agregada»).
- ≤ 640 px: 1 columna; se puede cambiar el alto y el orden; el menú ocupa la
  pantalla. Sin scroll horizontal a 360 px.
- Targets ≥ 24 px (32 con `pointer: coarse`), `prefers-reduced-motion` sin
  animaciones de Gridstack.

---

## 10. Errores y estados límite

| Caso | Comportamiento previsto |
|---|---|
| Diseño guardado inválido o de otra versión | Tablero vacío y un aviso. |
| Diseño con un gráfico que ya no existe | Se descarta esa tarjeta; el resto se carga. |
| Gráfico que necesita B y no hay B | La tarjeta muestra «Elegí una vuelta B en el panel lateral». |
| Carga por rueda sin REF | Aviso dentro de la tarjeta (como hoy). |
| Fuente que falla al pedirse | Aviso dentro de las tarjetas de esa fuente; el resto se dibuja. |
| Muchas tarjetas | Redibujo con debounce por tarjeta; solo se piden las fuentes usadas. |
| Ventana que cambia de ancho | Gridstack reacomoda; cada tarjeta redibuja por su `ResizeObserver`. |
| «Limpiar» sesión | El tablero se oculta (como hoy) y conserva su diseño para la próxima sesión. |
| «Vaciar tablero» | Pide confirmación; borra las tarjetas y guarda el diseño vacío. |

---

## 11. Verificación

- `node --check` en todos los JS tocados; `cargo test --workspace` en verde;
  `cargo build -p ac-telemetry-lab` tras editar `front/`.
- Checklist manual por CDP con un replay de Monza (por fase), entre otros:
  1. Primera ejecución: tablero vacío con el botón de agregar.
  2. Agregar uno de cada categoría; agregar dos copias del mismo con ajustes
     distintos.
  3. Mover y redimensionar con el mouse y con el teclado; el gráfico se redibuja.
  4. Regla de curvas propia alineada en tarjetas de distinto ancho.
  5. Cursor sincronizado y reproductor moviendo mapas, carga en vivo y reglas.
  6. Cambiar REF/B: todas las tarjetas se actualizan.
  7. Cerrar y abrir la app: el diseño vuelve igual; `localStorage` solo tiene la
     clave del diseño.
  8. Diseño corrupto a mano: tablero vacío y aviso.
  9. 360 px: una columna, sin scroll horizontal.
  10. «Ver en grande» desde una tarjeta uPlot.

---

## 12. Riesgos y decisiones a confirmar

| # | Tema | Propuesta | Motivo |
|---|---|---|---|
| 1 | Selector de B global | En el bloque «Sesión» del panel lateral. | Está siempre a la vista, junto a REF/B de la sesión. |
| 2 | Alto de celda | ~60 px, 12 columnas. | Da pasos finos de tamaño sin que el arrastre sea tedioso. |
| 3 | Tamaño inicial por gráfico | Medio ancho para series; ancho completo para tablas y mapas grandes. | Que al agregarlo ya se vea bien. |
| 4 | Diseños predefinidos | **Fuera de alcance** (el usuario eligió tablero vacío). | Se puede sumar después si se pide. |
| 5 | Migración de 37 gráficos | Por categoría, en este orden: Una vuelta, Mapas, Conjunto, Comparación, Curvas. | De lo más simple (uPlot) a lo más acoplado (tablas e interacciones). |
| 6 | Rendimiento | Debounce de redibujo y fuentes bajo demanda. | Un tablero con muchos canvas puede ser pesado en el WebView. |
| 7 | Clave de `localStorage` versionada | `…tablero.v1` | Permite cambiar el formato sin romper diseños viejos. |

---

## 13. Orden de implementación

1. Enmienda de la constitución y docs de reglas. (TB01)
2. Gridstack vendorizado y el armazón: pestañas, grilla, estado vacío, tarjeta,
   menú, catálogo, carga por fuentes y persistencia. (TB02–TB07)
3. Una vuelta + regla por tarjeta + cursor por instancia + «Ver en grande». (TB08–TB10)
4. Mapas. (TB11)
5. Conjunto. (TB12)
6. B global, Comparación y Curvas. (TB13–TB15)
7. Quitar pestañas y código viejo; responsive y accesibilidad; verificación y docs.
   (TB16–TB18)

---

## 14. Definición de terminado

- Existen solo las pestañas Tablero y Vueltas; el panel lateral sigue igual (más
  el selector de B).
- Los 37 gráficos se pueden agregar desde el menú, varias veces, y cada tarjeta se
  mueve y redimensiona con mouse y teclado.
- El diseño se recuerda entre ejecuciones y no se guarda ningún dato del replay.
- Cursor, reproductor, regla de curvas, REF/B y «Ver en grande» funcionan en el
  tablero.
- Se ve bien a 360 px.
- `cargo test --workspace` y `cargo build -p ac-telemetry-lab` terminan bien; no
  cambió el backend.
