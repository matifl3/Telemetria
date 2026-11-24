'use strict';

/* Wrapper de uPlot: opciones comunes y gráfico de líneas con sincronía de cursor. */

const SYNC_KEY = 'ac-tele-lab-v2';

function serieX() {
  return { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') };
}

/* `zoomX`: arrastrar sobre el gráfico acerca ese tramo (solo en "Ver en grande"). */
function opcionesGrafico(cont, height, yRango, yLabel, zoomX = false) {
  const ancho = cont.clientWidth || (cont.parentElement && cont.parentElement.clientWidth) || 900;
  return {
    width: ancho,
    height,
    padding: [8, 14, 0, 8],
    cursor: { sync: { key: SYNC_KEY }, drag: { x: true, y: false, setScale: zoomX }, focus: { prox: 40 } },
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

/* Hover sobre un gráfico: mueve el reproductor a esa distancia. Se convierte por
   valor (no por índice) porque no todos los gráficos usan la grilla de la vuelta
   (la envolvente de Conjunto tiene su propio eje). */
function alCursor(u) {
  const i = u.cursor.idx;
  if (i == null || i < 0 || !state.grilla.length) return;
  const s = u.data[0][i];
  if (s == null || !Number.isFinite(s)) return;
  const idx = clamp(Math.round((s - state.grilla[0]) / (state.paso || 1)), 0, state.grilla.length - 1);
  if (idx === state.idx) return; // cursor programático del play/scrub: no realimentar
  if (zoomAmpliadoEnCurso()) return; // reajuste interno de uPlot al cambiar el zoom
  state.idx = idx;
  state.dis = state.grilla[idx];
  actualizarPorIdx({ moverCursor: false });
}

/* Destruye un uPlot del tablero y lo saca de los registros de gráficos. */
function quitarUplot(u) {
  if (!u) return;
  state.charts.lines = state.charts.lines.filter((r) => r.u !== u);
  u.destroy();
}

/* Gráfico que guía el cursor: el primero registrado (uPlot sincroniza el resto). */
function graficoGuia() {
  return state.charts.lines.length ? state.charts.lines[0].u : null;
}

let _ultimoCursorPx = -1;
let _ultimaGuia = null;
function moverCursor() {
  const u = graficoGuia();
  if (!u) return;
  // Si cambió el gráfico guía (se quitó una tarjeta), su cursor todavía no está puesto.
  if (u !== _ultimaGuia) { _ultimaGuia = u; _ultimoCursorPx = -1; }
  const left = u.valToPos(state.dis, 'x');
  if (!Number.isFinite(left)) return;
  if (Math.abs(left - _ultimoCursorPx) < 1) return;
  _ultimoCursorPx = left;
  u.setCursor({ left, top: u.over.height / 2 });
}
