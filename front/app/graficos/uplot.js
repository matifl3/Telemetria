'use strict';

/* Wrapper de uPlot: opciones comunes, gráfico de líneas con sincronía de cursor
   y marcas verticales de curvas (C1..Cn). */

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
        stroke: '#8b97a8', grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif', label: 'Distancia de pista (m)', labelFont: '12px "Segoe UI", sans-serif',
        size: 42, values: (u, vals) => vals.map((v) => Math.round(v)),
      },
      {
        stroke: '#8b97a8', grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif', label: yLabel || '', labelFont: '12px "Segoe UI", sans-serif',
        size: 52, labelSize: 26,
      },
    ],
    hooks: { setCursor: [alCursor], draw: [dibujarMarcasCurvas] },
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

/* Marcas verticales con el nombre de curva (C1..Cn) sobre el plot. */
function dibujarMarcasCurvas(u) {
  const curvas = state.pistasCurvas;
  if (!curvas || !curvas.length || !u || !u.ctx || !u.bbox) return;
  const ctx = u.ctx, b = u.bbox;
  ctx.save();
  ctx.beginPath(); ctx.rect(b.left, b.top, b.width, b.height); ctx.clip();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '10px "Segoe UI", sans-serif';
  for (const c of curvas) {
    const sApex = c.s_apex == null ? c.s_ini : c.s_apex;
    if (sApex == null) continue;
    const x = u.valToPos(sApex, 'x');
    if (!Number.isFinite(x) || x < b.left - 1 || x > b.left + b.width + 1) continue;
    ctx.strokeStyle = 'rgba(148,163,184,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, b.top); ctx.lineTo(x, b.top + b.height); ctx.stroke();
    ctx.fillStyle = 'rgba(203,213,225,0.6)';
    ctx.fillText(c.nombre, x, b.top + 1);
  }
  ctx.restore();
}
