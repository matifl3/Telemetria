'use strict';

/* Tablero: grilla libre (Gridstack) donde cada gráfico del catálogo es una
   tarjeta que se agrega, mueve, redimensiona y quita. El diseño se guarda en
   `disenoTablero`; los datos se piden por fuente solo para las tarjetas presentes. */

const tablero = (() => {
  const COLUMNAS = 12;
  const MIN_W = 2;
  const MIN_H = 3;

  let grid = null;
  const tarjetas = new Map();   // uid → tarjeta (en orden de creación)
  let siguienteUid = 1;
  let versionMontada = -1;      // state.version con la que se montaron las tarjetas
  let guardarPendiente = null;

  const enUnaColumna = () => grid && grid.getColumn() !== COLUMNAS;
  const hayDatos = () => !!(state.resumen && state.resumen.puede_analizar && state.datosVuelta);

  function anunciar(texto) {
    const el = $('anuncio-tablero');
    if (!el) return;
    el.textContent = '';
    // En el cuadro siguiente para que los lectores de pantalla lo repitan aunque sea igual.
    requestAnimationFrame(() => { el.textContent = texto; });
  }

  function actualizarVacio() {
    const vacio = tarjetas.size === 0;
    $('tablero-vacio').classList.toggle('oculto', !vacio);
    $('btn-vaciar-tablero').disabled = vacio;
  }

  // ===== Diseño guardado =====

  /* Posiciones de 12 columnas. Con la grilla en 1 columna (celular) las
     posiciones de la grilla no se guardan: se conserva el diseño de escritorio. */
  function sincronizarPosicion(t) {
    const n = t.el.gridstackNode;
    if (!n || enUnaColumna()) return;
    t.pos = { x: n.x, y: n.y, w: n.w, h: n.h };
  }

  function guardar() {
    clearTimeout(guardarPendiente);
    guardarPendiente = setTimeout(() => {
      const lista = [...tarjetas.values()].map((t) => ({ id: t.def.id, ...t.pos, ajustes: t.ajustes }));
      disenoTablero.guardar(lista);
    }, 250);
  }

  // ===== Tarjetas =====

  const acciones = {
    quitar: (t) => quitar(t),
    mover: (t, dx, dy, dw, dh) => mover(t, dx, dy, dw, dh),
    cambiarAjuste: (t, clave, valor) => cambiarAjuste(t, clave, valor),
    ampliar: (t, origen) => { if (t.instancia && t.instancia.ampliar) t.instancia.ampliar(origen); },
  };

  /* Agrega una tarjeta. `pos` con x/y nulos = primer hueco libre. */
  function agregar(def, pos, ajustes, { montar = true, persistir = true } = {}) {
    const uid = `tarjeta-${siguienteUid++}`;
    const t = crearTarjeta(uid, def, ajustes, acciones);
    const w = clamp(pos.w ?? def.tamano.w, MIN_W, COLUMNAS);
    const h = Math.max(MIN_H, pos.h ?? def.tamano.h);
    const auto = pos.x == null || pos.y == null;
    t.pos = { x: auto ? null : pos.x, y: auto ? null : pos.y, w, h };
    $('grilla-tablero').appendChild(t.el);
    grid.makeWidget(t.el, { id: uid, w, h, minW: MIN_W, minH: MIN_H, ...(auto ? { autoPosition: true } : { x: pos.x, y: pos.y }) });
    tarjetas.set(uid, t);
    sincronizarPosicion(t);
    observarTamano(t);
    if (montar && hayDatos()) montarTarjeta(t);
    if (persistir) guardar();
    actualizarVacio();
    return t;
  }

  function quitar(t, { persistir = true, enfocar = true } = {}) {
    const orden = [...tarjetas.values()];
    const i = orden.indexOf(t);
    desmontar(t);
    if (t.observador) t.observador.disconnect();
    grid.removeWidget(t.el, true);
    tarjetas.delete(t.uid);
    if (persistir) guardar();
    actualizarVacio();
    if (enfocar) {
      anunciar(`${t.def.nombre} quitado del tablero.`);
      const resto = [...tarjetas.values()];
      const siguiente = resto[Math.min(i, resto.length - 1)];
      (siguiente ? siguiente.contenido : $('btn-agregar-grafico')).focus({ preventScroll: true });
    }
  }

  function mover(t, dx, dy, dw, dh) {
    const n = t.el.gridstackNode;
    if (!n) return;
    const columnas = grid.getColumn();
    const w = clamp(n.w + dw, Math.min(MIN_W, columnas), columnas);
    const x = clamp(n.x + dx, 0, columnas - w);
    const y = Math.max(0, n.y + dy);
    const h = Math.max(MIN_H, n.h + dh);
    grid.update(t.el, { x, y, w, h });
    const m = t.el.gridstackNode;
    anunciar(`${t.def.nombre}: columna ${m.x + 1}, fila ${m.y + 1}, ancho ${m.w}, alto ${m.h}.`);
  }

  function cambiarAjuste(t, clave, valor) {
    t.ajustes = { ...t.ajustes, [clave]: valor };
    if (t.actualizarAjustes) t.actualizarAjustes();
    guardar();
    if (hayDatos()) montarTarjeta(t);
  }

  /* Redibuja el gráfico cuando cambia el tamaño de la tarjeta (arrastre, ventana,
     paso a 1 columna). Se agrupa por cuadro para no redibujar de más. */
  function observarTamano(t) {
    if (typeof ResizeObserver === 'undefined') return;
    let pendiente = false;
    t.observador = new ResizeObserver(() => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        if (t.instancia && t.instancia.redimensionar && t.cuerpo.clientWidth) t.instancia.redimensionar();
      });
    });
    t.observador.observe(t.cuerpo);
  }

  // ===== Montaje (datos → gráfico) =====

  function desmontar(t) {
    if (t.instancia && t.instancia.destruir) {
      try { t.instancia.destruir(); } catch (e) { console.error('[tablero]', e); }
    }
    t.instancia = null;
    t.cuerpo.innerHTML = '';
    t.regla.hidden = true;
    t.botonAmpliar.disabled = true;
  }

  async function montarTarjeta(t) {
    const version = state.version;
    const turno = ++t.montaje;   // descarta montajes viejos si cambian los ajustes rápido
    const f = fuenteDe(t.def, t.ajustes);
    let datos = null, error = null;
    try {
      datos = await puente.pedirPestana(f.pestana, f.rot, f.alt);
    } catch (e) {
      error = e;
    }
    if (turno !== t.montaje || version !== state.version || !tarjetas.has(t.uid)) return;
    desmontar(t);
    if (error) { mensajeTarjeta(t.cuerpo, mensajeComando(error)); return; }
    const seleccion = state.resumen && state.resumen.seleccion;
    if (t.def.necesitaB && !(seleccion && seleccion.b)) {
      mensajeTarjeta(t.cuerpo, 'Elegí una vuelta B en el panel lateral (bloque «Sesión»).');
      return;
    }
    try {
      t.instancia = t.def.uplot
        ? montarUplotTarjeta(t, t.def.uplot(datos, t.ajustes))
        : (t.def.montar(t.cuerpo, datos, t.ajustes, t) || {});
    } catch (e) {
      console.error(`[tablero] ${t.def.id}`, e);
      desmontar(t);
      mensajeTarjeta(t.cuerpo, 'No se pudo dibujar este gráfico.');
      return;
    }
    t.botonAmpliar.disabled = !t.instancia.ampliar;
    // Regla, capa en vivo o figura de carga en la posición actual del reproductor.
    if (t.instancia.alCursor) t.instancia.alCursor();
  }

  /* Monta todas las tarjetas si cambió la sesión (versión); si no, solo ajusta
     tamaños (volver a la pestaña con la grilla ya montada). */
  async function render() {
    if (!hayDatos()) return;
    if (versionMontada === state.version) {
      for (const t of tarjetas.values()) if (t.instancia && t.instancia.redimensionar) t.instancia.redimensionar();
      return;
    }
    versionMontada = state.version;
    await Promise.all([...tarjetas.values()].map(montarTarjeta));
    // Lecturas del panel lateral y cursores de los gráficos recién montados.
    actualizarPorIdx({ moverCursor: true });
  }

  function desmontarTodo() {
    for (const t of tarjetas.values()) desmontar(t);
    versionMontada = -1;
  }

  /* El reproductor avisa a cada gráfico (reglas, mapas y carga en vivo). */
  function alCursor() {
    for (const t of tarjetas.values()) {
      if (t.instancia && t.instancia.alCursor) t.instancia.alCursor();
    }
  }

  // ===== Barra y arranque =====

  /* Desde el menú. Los gráficos `unaPorVuelta` (trazada por vuelta) agregan una
     tarjeta por cada vuelta visible, cada una con su posición en `orden`. */
  function agregarDesdeMenu(def) {
    if (!def.unaPorVuelta) {
      const t = agregar(def, {}, ajustesPorDefecto(def));
      anunciar(`${def.nombre} agregado al tablero.`);
      return t;
    }
    const visibles = (state.datosVuelta && state.datosVuelta.vueltas.length) || 1;
    const n = clamp(visibles, 1, def.maxPorVuelta || visibles);
    let ultima = null;
    grid.batchUpdate(true);
    for (let k = 1; k <= n; k++) {
      ultima = agregar(def, {}, { ...ajustesPorDefecto(def), orden: String(k) });
    }
    grid.batchUpdate(false);
    for (const t of tarjetas.values()) sincronizarPosicion(t);
    guardar();
    anunciar(n === 1 ? `${def.nombre} agregada al tablero.` : `${n} tarjetas de «${def.nombre}» agregadas, una por vuelta visible.`);
    return ultima;
  }

  function vaciar() {
    for (const t of [...tarjetas.values()]) quitar(t, { persistir: false, enfocar: false });
    guardar();
    anunciar('Tablero vacío.');
    $('btn-agregar-grafico').focus();
  }

  function iniciarBarra() {
    const abrirMenu = (ev) => menuGraficos.abrir(ev.currentTarget);
    $('btn-agregar-grafico').addEventListener('click', abrirMenu);
    $('btn-agregar-vacio').addEventListener('click', abrirMenu);
    // Vaciar pide confirmación en línea (sin diálogos del sistema).
    const confirmar = $('confirmar-vaciar');
    $('btn-vaciar-tablero').addEventListener('click', () => {
      confirmar.classList.remove('oculto');
      $('btn-vaciar-si').focus();
    });
    $('btn-vaciar-no').addEventListener('click', () => {
      confirmar.classList.add('oculto');
      $('btn-vaciar-tablero').focus();
    });
    $('btn-vaciar-si').addEventListener('click', () => {
      confirmar.classList.add('oculto');
      vaciar();
    });
  }

  function iniciar() {
    const sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    grid = GridStack.init({
      column: COLUMNAS,
      cellHeight: 60,
      margin: 8,
      float: false,
      animate: !sinMovimiento,
      handle: '.tarjeta-cab',
      resizable: { handles: 'se' },
      columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 640, c: 1 }] },
    }, '#grilla-tablero');
    grid.on('change', (ev, nodos) => {
      if (enUnaColumna()) return;
      for (const n of nodos || []) {
        const t = tarjetas.get(n.id);
        if (t) sincronizarPosicion(t);
      }
      guardar();
    });

    iniciarBarra();
    menuGraficos.iniciar(agregarDesdeMenu);

    const diseno = disenoTablero.leer();
    if (diseno.aviso) mostrarError(diseno.aviso);
    grid.batchUpdate(true);
    for (const g of diseno.tarjetas) {
      agregar(graficoPorId(g.id), g, g.ajustes, { montar: false, persistir: false });
    }
    grid.batchUpdate(false);
    actualizarVacio();
  }

  return { iniciar, render, desmontarTodo, alCursor };
})();
