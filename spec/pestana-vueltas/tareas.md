# Tareas — Pestaña de vueltas

## Objetivo

Mover el listado de vueltas que hoy ocupa el lateral del análisis a una pestaña
propia, para despejar la pantalla principal. La pestaña mostrará las vueltas
válidas de todos los autos en dos bloques: primero las del jugador real
(`current_recording_index`), en su orden actual, y después las de los demás
autos ordenadas por tiempo, de más rápida a más lenta.

## Alcance y reglas

- La nueva pestaña se llamará **Vueltas** y mostrará dos secciones:
  **«Tus vueltas»** (auto del jugador real) y **«Otros autos»** (el resto).
- El jugador real se identifica con `indice_jugador` (`current_recording_index`),
  no con el primer auto del replay ni con la REF actual.
- Solo se listan vueltas válidas y seleccionables.
- Las vueltas del jugador conservan su orden actual.
- Las vueltas de los demás autos se ordenan por `tiempo_s` ascendente: la más
  rápida primero. Los empates se resuelven por índice de auto y `numero_local`.
- El orden es fijo: no hay botón de ascendente/descendente.
- El orden por tiempo aplica solo a la pestaña Vueltas; los selectores «vs B»
  de Comparación y Curvas conservan su orden.
- Cada vuelta tendrá un selector para fijarla como REF o B; la asignación actual
  se identificará claramente y cambiar un rol lo trasladará a la vuelta elegida.
  Una vuelta no puede tener los dos roles a la vez.
- Se conserva la asignación inicial automática de REF/B. El usuario podrá
  cambiarla desde esta pestaña.
- Se conserva el control del ojo para mostrar u ocultar cada vuelta.
- Si se oculta la REF o B, se mantiene la regla actual del sistema: normalizará
  la selección y asignará un reemplazo cuando haga falta.
- El cambio es de interfaz, con un cambio mínimo de backend para exponer el
  índice del jugador. Se reutilizan el resumen y los comandos actuales, sin
  cambiar el formato de datos, la lógica de análisis ni la persistencia.
- El reproductor y las lecturas actuales permanecen en el lateral.
- La pestaña debe adaptarse a pantallas angostas y mantener etiquetas y estados
  accesibles en español.

## Tareas

- [x] **TV01 · Definir el panel de la pestaña Vueltas** — *Hecho cuando:*
  `front/index.html` tiene una pestaña y un panel accesibles para Vueltas,
  integrado con el `tablist` y las convenciones ARIA de las pestañas existentes.
- [x] **TV02 · Trasladar el listado fuera del lateral** — *Hecho cuando:* la
  lista se muestra dentro del panel Vueltas en dos secciones y ya no aparece en
  el lateral de la pantalla de análisis; el reproductor y las lecturas continúan
  en el lateral.
- [x] **TV03 · Asignar REF y B desde cada vuelta** — *Hecho cuando:* cada fila
  válida ofrece un selector para fijarla como REF o B, refleja la asignación
  actual y mantiene un único REF y un único B distintos; cambiar un rol desde
  otra fila sustituye la asignación anterior.
- [x] **TV04 · Conservar visibilidad y reemplazo de roles** — *Hecho cuando:*
  el ojo permite mostrar u ocultar vueltas y, si se oculta REF o B, se conserva
  el comportamiento actual de reemplazo automático; la lista se actualiza con
  el resumen recibido.
- [x] **TV05 · Ajustar presentación responsive y accesible** — *Hecho cuando:*
  las secciones y controles siguen utilizables en una ventana angosta, con orden
  de foco lógico, controles operables por teclado y nombres accesibles.
- [ ] **TV06 · Verificar el flujo completo** — *Hecho cuando:* se comprueba
  manualmente con una sesión multi-auto que la lista contiene solo vueltas
  válidas, el jugador aparece primero, los demás autos se ordenan por tiempo, se
  pueden cambiar REF/B y visibilidad, ocultar REF/B elige un reemplazo, las
  otras pestañas siguen mostrando los datos correctos y limpiar la sesión vacía
  la lista. `cargo build -p ac-telemetry-lab` ya está ejecutado; falta el
  checklist manual con un replay real.
- [x] **TV07 · Orden fijo de la lista** — *Hecho cuando:* las vueltas válidas
  del jugador real aparecen primero en su orden actual; las de los demás autos
  aparecen después en una lista plana ordenada por tiempo, de más rápida a más
  lenta; los empates se resuelven de forma estable; no hay control de orden; y
  los roles REF/B y la visibilidad no se alteran.
- [x] **TV08 · Exponer el jugador en el DTO** — *Hecho cuando:* `DtoResumen`
  incluye `indice_jugador: Option<usize>`, se completa desde
  `replay.meta.indice_jugador` validando el rango, y hay un test que lo cubre.

## Fuera de alcance

- Añadir filtros, búsqueda, orden manual/arbitrario o selección masiva. El orden
  fijo por jugador y tiempo sí forma parte de TV07.
- Cambiar la forma en que el backend clasifica vueltas o elige la REF inicial.
- Guardar selección o datos entre sesiones.
