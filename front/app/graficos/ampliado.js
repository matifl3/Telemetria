'use strict';

/* "Ver en grande" de la pestaña Telemetría: un gráfico en un diálogo, con su
   regla de curvas y zoom en el eje X (arrastrar, doble clic, + / − y "Vuelta
   completa"). Comparte la clave de sincronía, así que el cursor sigue al
   reproductor y a los demás gráficos. El zoom no se propaga a la pestaña. */

const ZOOM_ANCHO_MIN = 50;   // m visibles como mínimo
const ZOOM_FACTOR = 1.5;     // cuánto acerca o aleja cada botón

// `rango`: tramo X visible. Se guarda aparte porque uPlot aplica setScale de
// forma diferida y varios clics seguidos leerían un rango viejo.
// `ajustando`: hay un cambio de zoom en curso. Al aplicar la escala, uPlot
// recalcula el cursor con el píxel viejo; esos eventos no deben mover el reproductor.
const ampliado = { clave: null, graficos: [], origen: null, rango: null, ajustando: false };

const ampliadoAbierto = () => ampliado.clave !== null;
const zoomAmpliadoEnCurso = () => ampliado.ajustando;

function abrirGraficoAmpliado(clave, origen) {
  const def = definicionGrafico(clave);
  const tarjeta = tarjetaGrafico(clave);
  if (!def || !state.datosVuelta) return;
  if (!ampliadoAbierto()) ampliado.origen = origen || document.activeElement;
  ampliado.clave = clave;
  const titulo = tarjeta && tarjeta.querySelector('.grafico-titulo-texto');
  $('ampliado-titulo').textContent = titulo ? titulo.textContent : def.nombre;
  const ov = $('grafico-ampliado');
  ov.classList.remove('oculto');
  ov.setAttribute('aria-hidden', 'false');
  // El foco va al gráfico: así Espacio y las flechas siguen manejando el reproductor.
  $('plot-ampliado').focus();
  // uPlot necesita el contenedor ya medido.
  requestAnimationFrame(() => construirAmpliado(null));
}

function cerrarGraficoAmpliado() {
  if (!ampliadoAbierto()) return;
  destruirAmpliado();
  ampliado.clave = null;
  const ov = $('grafico-ampliado');
  ov.classList.add('oculto');
  ov.setAttribute('aria-hidden', 'true');
  const origen = ampliado.origen;
  ampliado.origen = null;
  if (origen && origen.isConnected && !origen.closest('[hidden]')) origen.focus();
}

function destruirAmpliado() {
  for (const u of ampliado.graficos) u.destroy();
  ampliado.graficos = [];
  const cont = $('plot-ampliado');
  if (cont) cont.innerHTML = '';
}

/* Rango X visible del overlay, o null si no hay gráfico. */
function rangoAmpliado() {
  if (!ampliado.graficos.length) return null;
  if (ampliado.rango) return { ...ampliado.rango };
  const u = ampliado.graficos[0];
  return { min: u.scales.x.min, max: u.scales.x.max };
}

/* Tras cambiar el zoom: cursor y regla con la escala ya aplicada. */
function trasZoomAmpliado() {
  requestAnimationFrame(() => {
    ampliado.ajustando = false;
    moverCursorAmpliado();
    dibujarReglaAmpliada();
  });
}

/* Crea los uPlot del overlay. `rango` conserva el zoom al reconstruir (resize). */
function construirAmpliado(rango) {
  if (!ampliadoAbierto()) return;
  const def = definicionGrafico(ampliado.clave);
  const datos = state.datosVuelta;
  destruirAmpliado();
  ampliado.rango = null;
  const cont = $('plot-ampliado');
  if (!def || !datos || !datos.grilla.length || !cont) return;
  const alto = Math.max(240, cont.clientHeight - 48);

  if (def.clave === 'pedales') {
    const altoMini = altoMiniPedales(cont.clientHeight - 12, datos.vueltas.length);
    for (const p of cajasPedales(cont, datos, altoMini)) {
      ampliado.graficos.push(crearUplotAmpliado(p.div, altoMini, def, p.data, p.series));
    }
  } else {
    const d = datosGrafico(def, datos);
    if (!d) { cont.innerHTML = '<p class="hint vacio">Sin vuelta REF: no hay carga por rueda para mostrar.</p>'; return; }
    const div = document.createElement('div');
    cont.appendChild(div);
    ampliado.graficos.push(crearUplotAmpliado(div, alto, def, d.data, d.series));
  }

  if (rango) fijarRangoAmpliado(rango.min, rango.max);
  trasZoomAmpliado();
}

function crearUplotAmpliado(div, alto, def, data, series) {
  const o = opcionesGrafico(div, alto, def.yRango, def.yLabel, true);
  o.series = series;
  o.hooks.setScale = [(u, clave) => { if (clave === 'x') alCambiarZoom(u); }];
  return new uPlot(o, data, div);
}

/* Aplica el mínimo de ancho y replica el zoom en los demás gráficos del overlay
   (pedales: un mini-gráfico por vuelta, todos con el mismo tramo). */
function alCambiarZoom(u) {
  let { min, max } = u.scales.x;
  // Eco de un setScale propio (uPlot lo aplica de forma diferida): ya está guardado.
  const r = ampliado.rango;
  if (r && Math.abs(min - r.min) < 1e-6 && Math.abs(max - r.max) < 1e-6) { trasZoomAmpliado(); return; }
  if (max - min < ZOOM_ANCHO_MIN) {
    const centro = (min + max) / 2;
    min = centro - ZOOM_ANCHO_MIN / 2; max = centro + ZOOM_ANCHO_MIN / 2;
  }
  fijarRangoAmpliado(min, max);
  trasZoomAmpliado();
}

function fijarRangoAmpliado(min, max) {
  const g = state.grilla;
  if (!g.length) return;
  const ini = g[0], fin = g[g.length - 1];
  const ancho = clamp(max - min, Math.min(ZOOM_ANCHO_MIN, fin - ini), fin - ini);
  min = clamp(min, ini, fin - ancho);
  max = min + ancho;
  ampliado.rango = { min, max };
  ampliado.ajustando = true;
  for (const u of ampliado.graficos) u.setScale('x', { min, max });
}

/* + / −: acerca o aleja centrado en el cursor (o en el centro si no está visible). */
function zoomAmpliado(factor) {
  const r = rangoAmpliado();
  if (!r) return;
  const cursor = state.grilla[state.idx] ?? state.dis;
  const centro = cursor >= r.min && cursor <= r.max ? cursor : (r.min + r.max) / 2;
  const ancho = (r.max - r.min) * factor;
  const t = (centro - r.min) / (r.max - r.min); // conserva la posición relativa del centro
  fijarRangoAmpliado(centro - ancho * t, centro + ancho * (1 - t));
  trasZoomAmpliado();
}

function vueltaCompletaAmpliado() {
  const g = state.grilla;
  if (!g.length) return;
  fijarRangoAmpliado(g[0], g[g.length - 1]);
  trasZoomAmpliado();
}

function moverCursorAmpliado() {
  const u = ampliado.graficos[0];
  if (!u) return;
  const left = u.valToPos(state.grilla[state.idx] ?? state.dis, 'x');
  if (!Number.isFinite(left)) return;
  // Fuera del tramo visible se oculta: si no, uPlot lo pegaría al borde y movería
  // la posición del reproductor.
  if (left < 0 || left > u.over.clientWidth) u.setCursor({ left: -10, top: -10 });
  else u.setCursor({ left, top: u.over.clientHeight / 2 });
}

function dibujarReglaAmpliada() {
  if (!ampliadoAbierto()) return;
  dibujarReglaCurvas('ch-regla-ampliado', ampliado.graficos[0] || null);
}

/* Resize de ventana: mismo gráfico, mismo zoom, nuevo tamaño. */
function redimensionarAmpliado() {
  if (ampliadoAbierto()) construirAmpliado(rangoAmpliado());
}

function iniciarGraficoAmpliado() {
  const ov = $('grafico-ampliado');
  if (!ov) return;
  $('ampliado-cerrar').addEventListener('click', cerrarGraficoAmpliado);
  $('ampliado-acercar').addEventListener('click', () => zoomAmpliado(1 / ZOOM_FACTOR));
  $('ampliado-alejar').addEventListener('click', () => zoomAmpliado(ZOOM_FACTOR));
  $('ampliado-completa').addEventListener('click', vueltaCompletaAmpliado);
  // Escape cierra y Tab queda dentro del diálogo mientras está abierto.
  document.addEventListener('keydown', (ev) => {
    if (!ampliadoAbierto()) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarGraficoAmpliado(); return; }
    if (ev.key !== 'Tab') return;
    // En orden del DOM: botones de la cabecera y después el gráfico.
    const enfocables = [...ov.querySelectorAll('button:not(:disabled)'), $('plot-ampliado')];
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    const actual = document.activeElement;
    if (!ov.contains(actual)) { ev.preventDefault(); primero.focus(); }
    else if (ev.shiftKey && actual === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && actual === ultimo) { ev.preventDefault(); primero.focus(); }
  });
}
