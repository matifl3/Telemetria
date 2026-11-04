'use strict';

/* Arranque y coordinación: pestañas, controles del mapa, readouts y dispatch. */

/* Envoltorio global: selector_vueltas llama `aplicarResumen` sin prefijo. */
function aplicarResumen(resumen) {
  return cargaArchivos.aplicarResumen(resumen);
}

/* Despachador de render: pedido por pestaña + render correspondiente (T100). */
async function renderPestanaActiva() {
  if (!state.resumen || !state.resumen.puede_analizar) return;
  ocultarError();
  try {
    switch (state.tab) {
      case 'vuelta': {
        const datos = await puente.pedirPestana('vuelta');
        state.datosVuelta = datos;
        state.grilla = datos.grilla;
        state.paso = datos.grilla.length > 1 ? (datos.grilla[1] - datos.grilla[0] || 1) : 1;
        state.longitudPista = datos.grilla.length ? datos.grilla[datos.grilla.length - 1] : 0;
        actualizarScrub();
        renderPestanaVuelta(datos);
        break;
      }
      case 'mapa': await renderPestanaMapa(); break;
      case 'conjunto': await renderPestanaConjunto(); break;
      case 'comparacion': await renderPestanaComparacion(); break;
      case 'curvas': await renderPestanaCurvas(); break;
      default: break;
    }
  } catch (error) {
    mostrarError(mensajeComando(error));
  }
}

/* Pestañas: tab activa + panel visible. */
function cambiarTab(nombre) {
  state.tab = nombre;
  document.querySelectorAll('.tab').forEach((t) => {
    const activo = t.dataset.tab === nombre;
    t.classList.toggle('activo', activo);
    t.setAttribute('aria-selected', String(activo));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('activo', p.id === `panel-${nombre}`);
  });
  cerrarZoomTeorico();
  renderPestanaActiva();
}

function iniciarTabs() {
  document.querySelectorAll('.tab[data-tab]').forEach((t) => {
    t.addEventListener('click', () => cambiarTab(t.dataset.tab));
  });
}

/* Readouts de la vuelta REF (se llenan desde reproductor.actualizarPorIdx). */
function crearReadouts() {
  const cont = $('readouts');
  if (!cont || cont.children.length) return;
  const defs = [
    ['ro-vel', 'Velocidad'],
    ['ro-dist', 'Dist'],
    ['ro-gas', 'Gas'],
    ['ro-freno', 'Freno'],
    ['ro-marcha', 'Marcha'],
    ['ro-tiempo', 'T vuelta'],
  ];
  for (const [id, etiqueta] of defs) {
    const caja = document.createElement('div');
    caja.className = 'ro';
    caja.innerHTML = `<span class="ro-label">${etiqueta}</span><span class="ro-valor mono" id="${id}">–</span>`;
    cont.appendChild(caja);
  }
}

/* Controles de la pestaña Mapa (visual, canal, marcas, 3D, encuadre). */
function iniciarControlesMapa() {
  const selVisual = $('mapa-visual');
  const selCanal = $('mapa-canal');
  const chkBordes = $('mapa-bordes'), chkFren = $('mapa-frenada');
  const chkCamb = $('mapa-cambios'), chk3D = $('mapa-3d');
  const controles3D = $('mapa-3d-controles');
  const rot = $('mapa-rot'), alt = $('mapa-alt');

  if (selVisual) selVisual.addEventListener('change', () => {
    state.mapa.visual = selVisual.value;
    state.mapa.resetView = true;
    const esCanal = state.mapa.visual !== 'trazada';
    $('mapa-canvas').style.display = esCanal ? '' : 'none';
    $('mapa-trazadas').style.display = esCanal ? 'none' : '';
    dibujarMapaPestana();
  });
  if (selCanal) selCanal.addEventListener('change', () => {
    state.mapa.canal = selCanal.value;
    dibujarMapaPestana();
  });
  if (chkBordes) chkBordes.addEventListener('change', () => { state.mapa.bordes = chkBordes.checked; dibujarMapaPestana(); });
  if (chkFren) chkFren.addEventListener('change', () => { state.mapa.frenada = chkFren.checked; dibujarMapaPestana(); });
  if (chkCamb) chkCamb.addEventListener('change', () => { state.mapa.cambios = chkCamb.checked; dibujarMapaPestana(); });
  if (chk3D) chk3D.addEventListener('change', () => {
    state.mapa.tresD = chk3D.checked;
    if (controles3D) controles3D.style.display = state.mapa.tresD ? '' : 'none';
    if (rot) rot.disabled = !state.mapa.tresD;
    if (alt) alt.disabled = !state.mapa.tresD;
    resetearVistas();
    renderPestanaMapa();
  });
  if (rot) rot.addEventListener('input', () => {
    state.mapa.rot = parseFloat(rot.value);
    renderPestanaMapa();
  });
  if (alt) alt.addEventListener('input', () => {
    state.mapa.alt = parseFloat(alt.value);
    renderPestanaMapa();
  });
  const reset = $('mapa-reset');
  if (reset) reset.addEventListener('click', () => {
    state.mapa.rot = 0; state.mapa.alt = 3;
    if (rot) rot.value = '0';
    if (alt) alt.value = '3';
    if (chk3D) chk3D.checked = false;
    state.mapa.tresD = false;
    if (controles3D) controles3D.style.display = 'none';
    if (rot) rot.disabled = true;
    if (alt) alt.disabled = true;
    resetearVistas();
    renderPestanaMapa();
  });
  if (rot) rot.disabled = true;
  if (alt) alt.disabled = true;
}

/* Deshabilitar el botón Limpiar cuando no hay sesión, y reflejar avisos iniciales. */
function refrescarBotones() {
  $('btn-limpiar').disabled = !state.resumen || (!state.resumen.autos.length && !state.resumen.pista);
}

function refrescarVsB() {
  selectorVueltas.poblarSelB();
  document.querySelectorAll('#sel-lap-b').forEach((sel) => {
    sel.disabled = !(state.resumen && state.resumen.vueltas && state.resumen.vueltas.some((v) => v.visible));
  });
}

function init() {
  crearReadouts();
  cargaArchivos.iniciar();
  iniciarReproductor();
  iniciarTabs();
  iniciarControlesMapa();
  iniciarControlesVsB();
  refrescarVsB();
  refrescarBotones();
}

function iniciarControlesVsB() {
  const selB = $('sel-lap-b');
  if (selB) selB.addEventListener('change', (e) => selectorVueltas.fijarBDesdeSelect(e.target));
  const selBCurvas = $('sel-lap-b-curvas');
  if (selBCurvas) selBCurvas.addEventListener('change', (e) => selectorVueltas.fijarBDesdeSelect(e.target, () => renderPestanaCurvas()));
}

document.addEventListener('DOMContentLoaded', init);
