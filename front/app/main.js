'use strict';

/* Arranque y coordinación: readouts, pestañas (Tablero y Vueltas) y dispatch. */

/* Envoltorio global: selector_vueltas llama `aplicarResumen` sin prefijo. */
function aplicarResumen(resumen) {
  return cargaArchivos.aplicarResumen(resumen);
}

/* Despachador de render (T100): el tablero pide sus fuentes; Vueltas usa el resumen. */
async function renderPestanaActiva() {
  if (!state.resumen || !state.resumen.puede_analizar) return;
  const tab = state.tab;
  const version = state.version;
  try {
    if (tab === 'tablero') await tablero.render();
    else if (tab === 'vueltas') selectorVueltas.render();
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
    t.tabIndex = activo ? 0 : -1;
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('activo', p.id === `panel-${nombre}`);
  });
  cerrarZoomTeorico();
  renderPestanaActiva();
}

function iniciarTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab[data-tab]'));
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => cambiarTab(t.dataset.tab));
    // Patrón de pestañas accesible: flechas, Inicio y Fin mueven y activan.
    t.addEventListener('keydown', (ev) => {
      let destino = null;
      if (ev.key === 'ArrowRight') destino = tabs[(i + 1) % tabs.length];
      else if (ev.key === 'ArrowLeft') destino = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (ev.key === 'Home') destino = tabs[0];
      else if (ev.key === 'End') destino = tabs[tabs.length - 1];
      if (!destino) return;
      ev.preventDefault();
      destino.focus();
      cambiarTab(destino.dataset.tab);
    });
  });
}

/* Readouts de la vuelta REF (los llena reproductor.actualizarPorIdx). */
function crearReadouts() {
  const cont = $('readouts');
  if (!cont || cont.children.length) return;
  const defs = [
    ['ro-vel', 'velocidad', 'km/h'],
    ['ro-dist', 'distancia', 'm'],
    ['ro-gas', 'gas', '%'],
    ['ro-freno', 'freno', '%'],
    ['ro-marcha', 'marcha', ''],
    ['ro-tiempo', 'tiempo', 's'],
    ['ro-curva', 'curva', '', 'ro-ancha'],
  ];
  for (const [id, etiqueta, unidad, clase] of defs) {
    const caja = document.createElement('div');
    caja.className = clase ? `ro ${clase}` : 'ro';
    caja.innerHTML = `<span class="ro-label">${etiqueta}</span>` +
      `<span class="ro-dato"><span class="ro-valor mono" id="${id}">–</span>` +
      (unidad ? `<span class="ro-unidad">${unidad}</span>` : '') + '</span>';
    cont.appendChild(caja);
  }
}

/* Altos reales de la barra superior y de las pestañas: las pestañas se fijan
   bajo la barra. Se miden con ResizeObserver porque las pestañas miden 0 hasta
   entrar al análisis y cambian de alto al pasar a dos filas. */
function medirBarras() {
  const raiz = document.documentElement.style;
  const barra = document.querySelector('.topbar');
  const tabs = document.querySelector('.tabs');
  if (barra) raiz.setProperty('--alto-topbar', `${barra.offsetHeight}px`);
  if (tabs) raiz.setProperty('--alto-tabs', `${tabs.offsetHeight}px`);
}

/* Las tarjetas del tablero se redibujan solas con su ResizeObserver; acá solo
   quedan las barras y los diálogos «Ver en grande». */
function iniciarResize() {
  let pendiente = null;
  medirBarras();
  if (typeof ResizeObserver !== 'undefined') {
    const obs = new ResizeObserver(medirBarras);
    for (const el of [document.querySelector('.topbar'), document.querySelector('.tabs')]) if (el) obs.observe(el);
  }
  window.addEventListener('resize', () => {
    medirBarras();
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      redimensionarAmpliado();
      dibujarZoomTeorico();
    }, 150);
  });
}

function init() {
  crearReadouts();
  cargaArchivos.iniciar();
  iniciarTabs();
  tablero.iniciar();
  iniciarGraficoAmpliado();
  iniciarReproductor();
  iniciarResize();
}

document.addEventListener('DOMContentLoaded', init);
