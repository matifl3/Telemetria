'use strict';

/* Utilidades comunes del front (v2). */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const idVuelta = (v) => `${v.auto}#${v.numero_local}`;
const mismaId = (a, b) => a && b && a.auto === b.auto && a.numero_local === b.numero_local;

function fmtTiempo(seg) {
  if (seg == null || !Number.isFinite(seg)) return '';
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function fmtDelta(v, unidad, dec) {
  if (!Number.isFinite(v)) return '–';
  return (v >= 0 ? '+' : '') + Number(v).toFixed(dec) + (unidad ? ' ' + unidad : '');
}

function claseDelta(v, mejor) {
  if (!Number.isFinite(v) || Math.abs(v) < 0.001 || !mejor) return '';
  const gana = mejor === 'menor' ? v < 0 : v > 0;
  return gana ? 'delta-gana' : 'delta-pierde';
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function colorMap(t) {
  t = clamp(t, 0, 1);
  const stops = [[0, [59, 130, 246]], [0.25, [34, 211, 238]], [0.5, [74, 222, 128]], [0.75, [250, 204, 21]], [1, [248, 113, 113]]];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      return `rgb(${Math.round(a[1][0] + (b[1][0] - a[1][0]) * k)},${Math.round(a[1][1] + (b[1][1] - a[1][1]) * k)},${Math.round(a[1][2] + (b[1][2] - a[1][2]) * k)})`;
    }
  }
  return 'rgb(248,113,113)';
}

/* Colores estables por vuelta: igualDTD que v1 (orden de las vueltas del resumen). */
function colorDeVuelta(dtoId) {
  const key = idVuelta(dtoId);
  if (!state.colorPorId.has(key)) {
    const vueltas = (state.resumen && state.resumen.vueltas) || [];
    const i = vueltas.findIndex((v) => idVuelta(v.id) === key);
    state.colorPorId.set(key, PALETA[(i >= 0 ? i : vueltas.length) % PALETA.length]);
  }
  return state.colorPorId.get(key);
}

/* Valor en el índice i de una serie que puede ser null/undefined. */
function valorSerie(serie, i) {
  if (!serie || !serie.length) return null;
  const v = serie[i];
  return v == null ? null : v;
}
