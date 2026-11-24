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
      recordarRutas(rutas);
      reiniciarGraficosTelemetria();
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
      recordarRutas([ruta]);
      reiniciarGraficosTelemetria();
      await aplicarResumen(resumen);
    } catch (error) {
      mostrarError(mensajeComando(error));
    } finally {
      quitarCargando(btn);
    }
  }

  /* Guarda las rutas que el backend aceptó, solo para mostrarlas en "Sesión". */
  function recordarRutas(rutas) {
    for (const ruta of rutas) {
      const minuscula = ruta.toLowerCase();
      if (minuscula.endsWith('.acreplay')) state.archivos.replay = ruta;
      else if (minuscula.endsWith('.ai')) state.archivos.pista = ruta;
    }
  }

  function sesionVacia() {
    return !state.resumen || (!state.resumen.autos.length && !state.resumen.pista);
  }

  async function limpiar() {
    try {
      const resumen = await puente.limpiarSesion();
      state.archivos = { replay: null, pista: null };
      limpiarAvisosSesion();
      reiniciarGraficosTelemetria();
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
    renderSesion();

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
      cerrarGraficoAmpliado();
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

  function nombreArchivo(ruta) {
    return ruta ? ruta.split(/[\\/]/).pop() : '';
  }

  /* Pista legible: carpeta de `content/tracks/<pista>/<config>/ai/`, si la ruta
     la tiene; si no, el nombre del archivo. */
  function nombrePista(ruta) {
    if (!ruta) return '';
    const m = ruta.match(/tracks[\\/]([^\\/]+)[\\/](?:([^\\/]+)[\\/])?ai[\\/][^\\/]+$/i);
    if (!m) return nombreArchivo(ruta);
    return m[2] ? `${m[1]} · ${m[2]}` : m[1];
  }

  function filaSesion(etiqueta, texto, opciones = {}) {
    const fila = document.createElement('div');
    fila.className = 'sesion-fila';
    const et = document.createElement('span');
    et.className = 'sesion-etiqueta';
    et.textContent = etiqueta;
    const valor = document.createElement('div');
    valor.className = 'sesion-valor';
    if (opciones.color) {
      const punto = document.createElement('span');
      punto.className = 'sesion-color';
      punto.style.background = opciones.color;
      valor.appendChild(punto);
    }
    const t = document.createElement('span');
    t.className = 'sesion-texto';
    t.textContent = texto;
    t.title = opciones.titulo || texto;
    valor.appendChild(t);
    if (opciones.tiempo) {
      const tiempo = document.createElement('span');
      tiempo.className = 'sesion-tiempo mono';
      tiempo.textContent = opciones.tiempo;
      valor.appendChild(tiempo);
    }
    fila.append(et, valor);
    if (opciones.detalle) {
      const detalle = document.createElement('span');
      detalle.className = 'sesion-detalle';
      detalle.textContent = opciones.detalle;
      fila.appendChild(detalle);
    }
    return fila;
  }

  function filaVuelta(etiqueta, dtoId) {
    const vuelta = dtoId && state.resumen.vueltas.find((v) => mismaId(v.id, dtoId));
    if (!vuelta) return filaSesion(etiqueta, 'sin elegir');
    // `piloto · auto · Vn`: el número de vuelta va primero para que no se corte.
    const partes = vuelta.etiqueta.split(' · ');
    const numero = partes.length > 1 ? partes.pop() : '';
    const texto = numero ? `${numero} · ${partes.join(' · ')}` : vuelta.etiqueta;
    return filaSesion(etiqueta, texto, {
      titulo: vuelta.etiqueta,
      color: colorDeVuelta(vuelta.id),
      tiempo: fmtTiempo(vuelta.tiempo_s) || 'sin tiempo',
    });
  }

  /* Bloque "Sesión" del panel lateral: archivos, pista, REF y B. */
  function renderSesion() {
    const cont = $('sesion-info');
    if (!cont) return;
    cont.innerHTML = '';
    const resumen = state.resumen;
    if (!resumen || !resumen.puede_analizar) return;

    const { replay, pista } = state.archivos;
    if (replay) cont.appendChild(filaSesion('Replay', nombreArchivo(replay), { titulo: replay }));
    const datosPista = resumen.pista;
    const detallePista = datosPista
      ? `${Math.round(datosPista.longitud_m || 0).toLocaleString()} m · ${datosPista.curvas} curvas`
      : '';
    cont.appendChild(filaSesion('Pista', pista ? nombrePista(pista) : 'fast_lane.ai', {
      titulo: pista || '', detalle: detallePista,
    }));
    const seleccion = resumen.seleccion || {};
    cont.appendChild(filaVuelta('REF', seleccion.referencia));
    cont.appendChild(filaVuelta('B', seleccion.b));

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn fantasma';
    boton.textContent = 'Elegir vueltas';
    boton.addEventListener('click', () => cambiarTab('vueltas'));
    cont.appendChild(boton);
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
    iniciarAvisos();
    $('btn-abrir-replay').addEventListener('click', (event) => abrirConDialogo('replay', event.currentTarget));
    $('btn-abrir-pista').addEventListener('click', (event) => abrirConDialogo('pista', event.currentTarget));
    $('btn-limpiar').addEventListener('click', limpiar);
    actualizarEstadoArchivos(state.resumen);

    const webview = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
    const zonaCarga = $('zona-carga');
    webview.onDragDropEvent((event) => {
      const tipo = event.payload.type;
      // Resalta la zona mientras hay archivos arrastrándose sobre la ventana.
      if (zonaCarga) zonaCarga.classList.toggle('encima', tipo === 'enter' || tipo === 'over');
      if (tipo === 'drop') cargarDesdeRutas(event.payload.paths);
    });
  }

  return { iniciar, cargarDesdeRutas, limpiar, aplicarResumen };
})();
