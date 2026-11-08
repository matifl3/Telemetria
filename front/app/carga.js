'use strict';

/* Carga de archivos (RF-008): diálogo nativo, drag & drop y estado de sesión. */

const cargaArchivos = (() => {
  let cargando = false;

  function botonesCarga() {
    return [$('btn-abrir-replay'), $('btn-abrir-pista')];
  }

  function ponerCargando(btn) {
    cargando = true;
    botonesCarga().forEach((boton) => { boton.disabled = true; });
    if (btn) btn.classList.add('cargando');
  }

  function quitarCargando(btn) {
    cargando = false;
    if (btn) btn.classList.remove('cargando');
    botonesCarga().forEach((boton) => { boton.disabled = false; });
  }

  async function cargarDesdeRutas(rutas) {
    if (!rutas || !rutas.length || cargando) return;
    ponerCargando(null);
    try {
      const resumen = await puente.cargarArchivos(rutas);
      await aplicarResumen(resumen);
    } catch (error) {
      // El backend descarta el lote inválido y conserva la sesión anterior (D-08).
      mostrarError(mensajeComando(error));
    } finally {
      quitarCargando(null);
    }
  }

  async function abrirConDialogo(tipo, btn) {
    if (cargando) return;
    ponerCargando(btn);
    try {
      const ruta = await puente.abrirDialogo(tipo);
      if (!ruta) return;
      const resumen = tipo === 'replay'
        ? await puente.cargarArchivos([ruta])
        : await puente.cargarPista(ruta);
      await aplicarResumen(resumen);
    } catch (error) {
      mostrarError(mensajeComando(error));
    } finally {
      quitarCargando(btn);
    }
  }

  function sesionVacia() {
    return !state.resumen || (!state.resumen.autos.length && !state.resumen.pista);
  }

  async function limpiar() {
    try {
      const resumen = await puente.limpiarSesion();
      aplicarResumen(resumen);
    } catch (error) {
      mostrarError(mensajeComando(error));
    }
  }

  /* Aplica un DtoResumen nuevo: invalida cachés y refresca la vista completa. */
  async function aplicarResumen(resumen) {
    state.resumen = resumen;
    state.version++;
    state.cacheDatos.clear();
    state.colorPorId.clear();
    selectorVueltas.render();
    actualizarEstadoArchivos(resumen);

    $('btn-limpiar').disabled = sesionVacia();

    if (resumen.puede_analizar) {
      entrarDashboard();
    } else {
      state.datosVuelta = null;
      state.grilla = [];
      state.longitudPista = 0;
      state.idx = 0;
      state.dis = 0;
      detenerReproduccion();
      destroyCharts();
      const dash2 = $('dashboard');
      if (dash2) dash2.classList.add('oculto');
      const z2 = $('zona-carga');
      if (z2) z2.classList.remove('oculto');
      if (resumen.falta_pista) mostrarError('Falta cargar la pista (fast_lane.ai) para entrar al análisis.');
      else if (!resumen.autos.length && !resumen.avisos.length) ocultarError();
    }
    calcularAvisos(resumen);

    if (resumen.puede_analizar) {
      await prepararSesionBase();
      renderPestanaActiva();
    }
  }

  function actualizarEstadoArchivos(resumen) {
    const tieneReplay = !!(resumen && (
      resumen.autos.length || resumen.falta_pista || resumen.puede_analizar
    ));
    const tienePista = !!(resumen && resumen.pista);
    const replay = $('estado-replay');
    const pista = $('estado-pista');

    if (replay) {
      replay.textContent = tieneReplay ? 'Replay: cargado' : 'Replay: pendiente';
      replay.classList.toggle('cargado', tieneReplay);
    }
    if (pista) {
      pista.textContent = tienePista ? 'Pista: cargada' : 'Pista: pendiente';
      pista.classList.toggle('cargado', tienePista);
    }
  }

  function detenerReproduccion() {
    state.playing = false;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    fijarIconoPlay();
  }

  /* Descarga/caché de la vista base (pestaña Vuelta): grilla + canales. */
  async function prepararSesionBase() {
    const datos = await puente.pedirPestana('vuelta');
    state.datosVuelta = datos;
    state.grilla = datos.grilla;
    state.paso = datos.grilla.length > 1 ? (datos.grilla[1] - datos.grilla[0] || 1) : 1;
    state.longitudPista = datos.grilla.length ? datos.grilla[datos.grilla.length - 1] : 0;
    if (state.idx >= state.grilla.length) { state.idx = 0; state.dis = 0; }
    actualizarScrub();
  }

  function entrarDashboard() {
    ocultarError();
    const dash = $('dashboard');
    if (dash) dash.classList.remove('oculto');
    const zona = $('zona-carga');
    if (zona) zona.classList.add('oculto');
  }

  function iniciar() {
    $('btn-abrir-replay').addEventListener('click', (event) => abrirConDialogo('replay', event.currentTarget));
    $('btn-abrir-pista').addEventListener('click', (event) => abrirConDialogo('pista', event.currentTarget));
    $('btn-limpiar').addEventListener('click', limpiar);
    actualizarEstadoArchivos(state.resumen);

    const webview = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
    webview.onDragDropEvent((event) => {
      if (event.payload.type === 'drop') cargarDesdeRutas(event.payload.paths);
    });
  }

  return { iniciar, cargarDesdeRutas, limpiar, aplicarResumen };
})();
