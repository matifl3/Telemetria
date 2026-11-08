'use strict';

/* Arranque y coordinación: readouts, pestañas, controles del mapa y dispatch. */

/* Envoltorio global: selector_vueltas llama `aplicarResumen` sin prefijo. */
function aplicarResumen(resumen) {
  return cargaArchivos.aplicarResumen(resumen);
}

/* Despachador de render (T100): pide el DTO de la pestaña activa y renderiza. */
async function renderPestanaActiva() {
  if (!state.resumen || !state.resumen.puede_analizar) return;
  const tab = state.tab;
  const version = state.version;
  try {
    switch (tab) {
      case 'vuelta': {
        const datos = await puente.pedirPestana('vuelta');
        if (version !== state.version || tab !== state.tab) return;
        state.datosVuelta = datos;
        actualizarScrub();
        renderPestanaVuelta(datos);
        break;
      }
      case 'vueltas':
        selectorVueltas.render();
        break;
      case 'mapa':
        await renderPestanaMapa(version);
        break;
      case 'conjunto':
        await renderPestanaConjunto(version);
        break;
      case 'comparacion':
        await renderPestanaComparacion(version);
        break;
      case 'curvas':
        await renderPestanaCurvas(version);
        break;
      default:
        break;
    }
  } catch (error) {
    if (version !== state.version || tab !== state.tab) return;
    mostrarError(mensajeComando(error));
  }
}

/* Cambio de pestaña: tabs + panels + render. */
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

/* Readouts de la vuelta REF (los llena reproductor.actualizarPorIdx). */
function crearReadouts() {
  const cont = $('readouts');
  if (!cont || cont.children.length) return;
  const defs = [
    ['ro-vel', 'velocidad'],
    ['ro-dist', 'distancia'],
    ['ro-gas', 'gas'],
    ['ro-freno', 'freno'],
    ['ro-marcha', 'marcha'],
    ['ro-tiempo', 'tiempo'],
  ];
  for (const [id, etiqueta] of defs) {
    const caja = document.createElement('div');
    caja.className = 'ro';
    caja.innerHTML = `<span class="ro-label">${etiqueta}</span><span class="ro-valor mono" id="${id}">–</span>`;
    cont.appendChild(caja);
  }
}

/* Controles de la pestaña Mapa: visual, canal, marcas y 3D. */
function iniciarControlesMapa() {
  const selVisual = $('mapa-visual');
  const selCanal = $('mapa-canal');
  const chkBordes = $('mapa-bordes');
  const chkFrenada = $('mapa-frenada');
  const chkCambios = $('mapa-cambios');
  const chk3D = $('mapa-3d');
  const rot = $('mapa-rot');
  const alt = $('mapa-alt');
  const controles3D = $('mapa-3d-controles');

  if (selVisual) selVisual.addEventListener('change', () => {
    state.mapa.visual = selVisual.value;
    state.mapa.resetView = true;
    const trazada = state.mapa.visual === 'trazada';
    $('mapa-canvas').classList.toggle('oculto', trazada);
    $('mapa-trazadas').classList.toggle('oculto', !trazada);
    dibujarMapaPestana();
  });
  if (selCanal) selCanal.addEventListener('change', () => {
    state.mapa.canal = selCanal.value;
    dibujarMapaPestana();
  });
  if (chkBordes) chkBordes.addEventListener('change', () => { state.mapa.bordes = chkBordes.checked; dibujarMapaPestana(); });
  if (chkFrenada) chkFrenada.addEventListener('change', () => { state.mapa.frenada = chkFrenada.checked; dibujarMapaPestana(); });
  if (chkCambios) chkCambios.addEventListener('change', () => { state.mapa.cambios = chkCambios.checked; dibujarMapaPestana(); });
  if (chk3D) chk3D.addEventListener('change', () => {
    state.mapa.tresD = chk3D.checked;
    if (controles3D) controles3D.classList.toggle('oculto', !state.mapa.tresD);
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
    state.mapa.zoom = 1; state.mapa.panX = 0; state.mapa.panY = 0; state.mapa.resetView = true;
    resetearVistas();
    dibujarMapaPestana();
  });
}

/* Botón "Ver en grande" de la trazada teórica (solo tiene efecto en Conjunto). */
function iniciarZoomTeorico() {
  const btn = $('btn-zoom-teorico');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (state.ultimoConjunto) abrirZoomTeorico(state.ultimoConjunto);
  });
}

function iniciarSelectoresB() {
  for (const idSel of ['sel-lap-b', 'sel-lap-b-curvas']) {
    const sel = $(idSel);
    if (!sel) continue;
    sel.addEventListener('change', () => selectorVueltas.fijarBDesdeSelect(sel));
  }
}

function iniciarResize() {
  let pendiente = null;
  window.addEventListener('resize', () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      if (state.resumen && state.resumen.puede_analizar) renderPestanaActiva();
    }, 150);
  });
}

function init() {
  crearReadouts();
  cargaArchivos.iniciar();
  iniciarTabs();
  iniciarControlesMapa();
  iniciarZoomTeorico();
  iniciarReproductor();
  iniciarSelectoresB();
  iniciarResize();
}

document.addEventListener('DOMContentLoaded', init);
