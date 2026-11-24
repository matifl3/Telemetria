# Tareas — Gráficos de Telemetría: ampliar y elegir canales

## Objetivo

Que los gráficos de la pestaña Telemetría se puedan ver con más detalle:

1. **Ver en grande**: botón ⤢ en cada gráfico que lo abre en un overlay con zoom
   en el eje X y regla de curvas.
2. **Chips de canales**: el usuario elige qué gráficos ver y los activos se
   reparten el alto de la pantalla.

Diseño completo en `spec/telemetria-graficos/plan.md`.

## Alcance y reglas

- Solo front (`front/`): sin cambios en Rust, DTO, comandos ni persistencia.
- Sin frameworks ni paso de build; uPlot vendorizado.
- La selección de canales vive en memoria por sesión.
- Respetar `DESIGN.md` y las reglas de accesibilidad ya aplicadas (diálogo con
  foco/Esc, targets ≥ 24/32 px).
- Responsive desde 360 px.

## Tareas

- [x] **TG01 · Disparador ⤢.** Botón `⤢ Ver en grande` en el título de las 8
  tarjetas de Telemetría, con `data-grafico` en cada tarjeta.
  *Hecho cuando:* cada gráfico activo muestra el botón con nombre accesible.
- [x] **TG02 · Tabla de gráficos.** `GRAFICOS_TELEMETRIA` con clave, título,
  unidad, alto mínimo y construcción de datos/series; `renderPestanaVuelta` la
  recorre.
  *Hecho cuando:* la pestaña se ve exactamente igual que antes del cambio.
- [x] **TG03 · Regla y cursor desacoplados de Velocidad.**
  `dibujarReglaCurvas(canvasId, u)` y `moverCursor` usan el primer gráfico
  activo.
  *Hecho cuando:* ocultando Velocidad la regla y el cursor siguen alineados.
- [x] **TG04 · Diálogo "Ver en grande".** `#grafico-ampliado` con cabecera,
  regla y uPlot propio (misma `SYNC_KEY`, fuera de `state.charts.lines`); foco,
  Tab atrapado, Esc y devolución del foco.
  *Hecho cuando:* cualquier gráfico se abre en grande y se cierra sin dejar
  rastros ni romper la pestaña.
- [x] **TG05 · Zoom en X del overlay.** Arrastrar para acercar, doble clic y
  "Vuelta completa" para volver, `+`/`−` centrados en el cursor, mínimo 50 m;
  regla redibujada al cambiar la escala y con el reproductor.
  *Hecho cuando:* se puede inspeccionar una curva en detalle con ratón y sin él.
- [ ] ~~**TG06 · Chips de canales.**~~ *Retirada (2026-11-24): el usuario pidió sacar la selección de gráficos.* Fila con 8 chips `aria-pressed` + "Todos";
  `state.graficosOcultos` (vacío = los 8 visibles); no se puede desactivar el último;
  se reinicia con "Limpiar" o una nueva sesión.
  *Hecho cuando:* activar/desactivar un chip muestra u oculta su gráfico sin
  pedir datos al backend.
- [ ] ~~**TG07 · Reparto del alto.**~~ *Retirada junto con TG06.* Cada gráfico activo recibe
  `max(altoMinimo, disponible / n)` con tope ~520 px; Pedales reparte entre sus
  mini-gráficos.
  *Hecho cuando:* con 2 gráficos activos ocupan la ventana y con 8 se ve como
  antes.
- [x] **TG08 · Responsive y accesibilidad.** Diálogo a pantalla completa y chips
  con scroll horizontal en 360 px; targets táctiles; `prefers-reduced-motion`.
  *Hecho cuando:* todo se opera con teclado y en 360 px sin scroll horizontal de
  la página.
- [x] **TG09 · Verificación y documentación.** Checklist manual del plan (§8),
  `node --check`, `cargo test --workspace`, `cargo build -p ac-telemetry-lab`;
  registrar en `doc/Catalogo_Graficos.md` y actualizar `MEMORY.md`.
  *Hecho cuando:* todo pasa y la documentación refleja lo implementado.

## Decisiones

Aprobadas tal como se propusieron en `plan.md` §9 (archivo nuevo
`front/app/graficos/ampliado.js`, los 8 gráficos activos al entrar, chip único
de Pedales, zoom solo en el overlay, sin reproductor propio en el overlay y tope
de 520 px).

## Cierre

Verificado en la app (CDP) con un replay de Monza: los 8 gráficos se ven igual
que antes; chips, reparto del alto, regla guiada por el primer gráfico visible,
overlay con zoom (+/−, doble clic, mínimo 50 m), Esc con devolución del foco,
Pedales ampliado y 360 px sin scroll horizontal.

Después se retiró la selección de gráficos (TG06–TG07) a pedido del usuario:
la pestaña vuelve a mostrar siempre los 8 gráficos con sus altos fijos; queda
solo "Ver en grande". `cargo test --workspace` en
verde y `cargo build -p ac-telemetry-lab` correcto.
