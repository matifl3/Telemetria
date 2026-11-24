# Tareas — Tablero de gráficos

## Objetivo

Reemplazar las pestañas de gráficos por un **tablero libre**: el usuario agrega
cualquier gráfico desde un menú, lo mueve y le cambia el tamaño, y el diseño se
recuerda entre ejecuciones. Siguen el panel lateral (reproductor) y la pestaña
Vueltas. Diseño completo en `spec/tablero/plan.md`.

## Alcance y reglas

- Solo front: sin cambios en `core`, `src-tauri`, DTO ni comandos.
- Gridstack.js vendorizado (MIT), sin paso de build.
- Persistencia **solo del diseño del tablero** en `localStorage`, tras enmendar el
  principio 5 de la constitución (TB01). Nunca datos del replay.
- Tablero vacío al entrar la primera vez; se puede agregar el mismo gráfico varias
  veces.
- Respetar `DESIGN.md`, la accesibilidad ya aplicada y el mínimo de 360 px.
- Todo se hace en la rama `tablero/playground`; `main` conserva las pestañas hasta
  el merge.

## Tareas

### Fase 0 — Reglas

- [x] **TB01 · Enmendar el principio 5.** Texto de `plan.md` §2 en
  `doc/constitucion.md`; actualizar `AGENTS.md`, `README.md` y `MEMORY.md`.
  *Hecho cuando:* las reglas permiten solo la clave del diseño en `localStorage`.

### Fase 1 — Armazón del tablero

- [x] **TB02 · Vendorizar Gridstack.** `front/vendor/gridstack/` con JS, CSS y
  `LICENSE`; versión anotada en `README.md`.
  *Hecho cuando:* la app carga Gridstack sin red ni paso de build.
- [x] **TB03 · Pestañas y grilla.** Pestañas Tablero (inicial) y Vueltas; grilla de
  12 columnas (1 a ≤ 640 px); barra con `+ Agregar gráfico` y `Vaciar tablero`;
  estado vacío.
  *Hecho cuando:* con una sesión cargada se ve el tablero vacío y la pestaña
  Vueltas sigue funcionando.
- [x] **TB04 · Tarjeta.** Cabecera arrastrable con título, `⤢`, `⚙`, `⋯` y `✕`;
  cuerpo; manija de tamaño; `ResizeObserver` con debounce; menú de teclado para
  mover y redimensionar.
  *Hecho cuando:* una tarjeta de prueba se mueve, redimensiona y quita con mouse y
  con teclado.
- [x] **TB05 · Menú «Agregar gráfico».** Diálogo con buscador y categorías;
  agrega varias copias; la tarjeta nueva toma el foco.
  *Hecho cuando:* se puede encontrar y agregar cualquier gráfico del catálogo.
- [x] **TB06 · Catálogo y datos.** `CATALOGO_GRAFICOS` con el contrato de §4;
  pedido de fuentes según las tarjetas presentes; remontar al cambiar
  sesión/REF/B.
  *Hecho cuando:* solo se piden las fuentes en uso y un cambio de REF actualiza
  las tarjetas.
- [x] **TB07 · Persistencia del diseño.** Guardar (debounce), leer y validar
  `ac-telemetry-lab.tablero.v1`; «Vaciar tablero» con confirmación.
  *Hecho cuando:* cerrar y abrir la app restaura el diseño, y un diseño corrupto da
  tablero vacío con aviso.

### Fase 2 — Una vuelta

- [x] **TB08 · Regla de curvas por tarjeta y cursor por instancia.**
  `dibujarReglaCurvas` sobre el uPlot de cada tarjeta; `actualizarPorIdx` llama a
  `alCursor` de cada instancia (sin mirar `state.tab`).
  *Hecho cuando:* tarjetas de distinto ancho tienen su regla alineada y siguen al
  reproductor.
- [x] **TB09 · Migrar Una vuelta (8).** Velocidad, RPM, Marcha, Volante,
  Aceleración total, Rumbo, Carga por rueda, Acelerador/Freno.
  *Hecho cuando:* los 8 se agregan, redimensionan y sincronizan el cursor.
- [x] **TB10 · «Ver en grande» genérico.** `ampliado.js` abre cualquier tarjeta
  uPlot con su definición y ajustes.
  *Hecho cuando:* funciona desde cualquier tarjeta uPlot del tablero.

### Fase 3 — Mapas

- [x] **TB11 · Migrar Mapas (2).** Mapa de pista (visual, canal, bordes, frenada,
  cambios, 3D, rotación, elevación y zoom como ajustes de la tarjeta) y Carga por
  rueda en vivo.
  *Hecho cuando:* dos mapas con canales distintos conviven y siguen al
  reproductor.

### Fase 4 — Conjunto

- [x] **TB12 · Migrar Conjunto (14).** Incluye tooltips, zoom de la trazada teórica
  y tablas.
  *Hecho cuando:* los 14 se agregan y dibujan igual que en la pestaña actual.

### Fase 5 — Comparación y Curvas

- [x] **TB13 · B global.** Selector de B en el bloque «Sesión»; aviso en tarjetas
  que necesitan B.
  *Hecho cuando:* cambiar B desde el lateral o desde Vueltas actualiza las
  tarjetas A/B.
- [x] **TB14 · Migrar Comparación (6).** Incluye el ranking con salto a la zona.
  *Hecho cuando:* los 6 funcionan y tocar una fila del ranking mueve el
  reproductor.
- [x] **TB15 · Migrar Curvas (7).** Incluye círculos de tracción, fases y balance.
  *Hecho cuando:* los 7 funcionan con sus interacciones.

### Fase 6 — Cierre

- [x] **TB16 · Quitar las pestañas viejas.** HTML, CSS y `front/app/pestanas/` que
  queden sin uso.
  *Hecho cuando:* no quedan referencias a las pestañas viejas ni código muerto.
- [x] **TB17 · Responsive y accesibilidad.** 1 columna a ≤ 640 px, menú a pantalla
  completa, `aria-live`, targets táctiles, `prefers-reduced-motion`.
  *Hecho cuando:* todo se opera con teclado y a 360 px sin scroll horizontal.
- [x] **TB18 · Verificación y documentación.** Checklist de `plan.md` §11;
  `node --check`, `cargo test --workspace`, `cargo build -p ac-telemetry-lab`;
  `doc/Catalogo_Graficos.md` y `MEMORY.md`.
  *Hecho cuando:* todo pasa y la documentación refleja el tablero.

## Decisiones

Se aplicaron las propuestas de `plan.md` §12: selector de B en el bloque «Sesión»
del lateral, celdas de 60 px en 12 columnas y tamaños iniciales por gráfico.

## Cierre (2026-11-24)

- Gridstack 14.1.1 vendorizado; 37 gráficos registrados en el catálogo.
- Verificado en la app (CDP) con un replay de Monza: tablero vacío al entrar; los
  37 se agregan y dibujan sin errores; búsqueda en el menú; mover y redimensionar
  con teclado; ajustes del mapa (trazada por vuelta y 3D con rotación); quitar y
  vaciar con confirmación; «Ver en grande» (uPlot, pedales, trazada teórica y
  tracción); reproducción; diseño restaurado al reiniciar la app; diseño
  corrupto → tablero vacío con aviso; 360 px en una columna sin tocar el diseño
  de escritorio guardado.
- `localStorage` solo contiene `ac-telemetry-lab.tablero.v1` (sin datos del
  replay). El test `t88` se adaptó a la enmienda y se sumó
  `t88_el_diseno_del_tablero_usa_solo_su_clave`.
- Leyendas de los gráficos de líneas con etiqueta corta (`piloto · Vn`) para que
  entren en tarjetas chicas.
