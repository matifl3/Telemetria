'use strict';

/* Wrapper de uPlot: opciones comunes y gráfico de líneas con sincronía de cursor. */

const SYNC_KEY = 'ac-tele-lab-v2';

function serieX() {
  return { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') };
}

function opcionesGrafico(cont, height, yRango, yLabel) {
  const ancho = cont.clientWidth || (cont.parentElement && cont.parentElement.clientWidth) || 900;
  return {
    width: ancho,
    height,
    padding: [8, 14, 0, 8],
    cursor: { sync: { key: SYNC_KEY }, drag: { x: true, y: false, setScale: false }, focus: { prox: 40 } },
    legend: { show: true, live: true },
    scales: { x: { time: false }, y: yRango ? { range: yRango } : { auto: true } },
    axes: [
      {
        stroke: COLOR.apagado, grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif', label: 'Distancia de pista (m)', labelFont: '12px "Segoe UI", sans-serif',
        size: 42, values: (u, vals) => vals.map((v) => Math.round(v)),
      },
      {
        stroke: COLOR.apagado, grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif', label: yLabel || '', labelFont: '12px "Segoe UI", sans-serif',
        size: 52, labelSize: 26,
      },
    ],
    hooks: { setCursor: [alCursor] },
  };
}

/* Gráfico de líneas sobre la grilla común: la primera serie es el eje X. */
function lineChart(cont, height, yRango, yLabel, data, series) {
  if (!cont) return null;
  // El contenedor es del gráfico: descarta mensajes de "vacío" de un render anterior.
  cont.innerHTML = '';
  const o = opcionesGrafico(cont, height, yRango, yLabel);
  o.series = series;
  const u = new uPlot(o, data, cont);
  state.charts.lines.push({ u, cont, height });
  return u;
}

function graficoMinusculo(cont, height, yRango, yLabel, data, series) {
  const o = opcionesGrafico(cont, height, yRango, yLabel);
  o.series = series;
  const u = new uPlot(o, data, cont);
  state.charts.inputs.push(u);
  return u;
}

function destroyCharts() {
  for (const r of state.charts.lines) r.u.destroy();
  state.charts.lines = [];
  for (const u of state.charts.inputs) u.destroy();
  state.charts.inputs = [];
}

function alCursor(u) {
  const idx = u.cursor.idx;
  if (idx == null || idx < 0 || idx >= state.grilla.length) return;
  if (idx === state.idx) return; // cursor programático del play/scrub: no realimentar
  state.idx = idx;
  state.dis = state.grilla[idx];
  actualizarPorIdx({ moverCursor: false });
}

let _ultimoCursorPx = -1;
function moverCursor() {
  const u = state.charts.lines[0] && state.charts.lines[0].u;
  if (!u) return;
  const left = u.valToPos(state.dis, 'x');
  if (!Number.isFinite(left)) return;
  if (Math.abs(left - _ultimoCursorPx) < 1) return;
  _ultimoCursorPx = left;
  u.setCursor({ left, top: u.over.height / 2 });
}
