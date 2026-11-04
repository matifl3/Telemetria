'use strict';

/* Helpers de canvas para dibujos propios (DPR + rectángulos + marcas). */

function prepararCanvas(cv, fallbackH) {
  if (!cv) return null;
  const w = cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth) || 600;
  const h = cv.clientHeight || fallbackH || 260;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { cv, ctx, w, h };
}

function prepCanvas(id, fallbackH) {
  return prepararCanvas($(id), fallbackH);
}

function redondeado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function marcaTriangulo(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.lineTo(x + s, y + s);
  ctx.closePath();
  ctx.fill();
}

function marcaCruz(ctx, x, y, s, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  ctx.stroke();
}

/* Leyenda de escala de color (min→max) dibujada dentro de un canvas. */
function dibujarEscalaColor(ctx, w, h, min, max) {
  const lw = 140, lx = 10, ly = h - 22;
  for (let i = 0; i < lw; i++) { ctx.fillStyle = colorMap(i / lw); ctx.fillRect(lx + i, ly, 1, 8); }
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  if (Number.isFinite(min)) ctx.fillText(Number(min).toFixed(0), lx, ly + 18);
  if (Number.isFinite(max)) ctx.fillText(Number(max).toFixed(0), lx + lw - 20, ly + 18);
}

/* Barras horizontales con etiqueta a la izquierda (tiempos, velocidades, fuel). */
function dibujarBarrasHorizontales(ctx, w, h, datos, formatoValor) {
  if (!datos.length) return false;
  const maxValor = Math.max(1e-6, ...datos.map((d) => d.valor));
  const pad = 8, izq = 150, filaH = Math.min(30, (h - pad * 2) / datos.length), anchoMax = w - izq - 70;
  datos.forEach((d, i) => {
    const y = pad + i * filaH;
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText(d.etiqueta.slice(0, 24), 6, y + filaH * 0.62);
    const bw = (d.valor / maxValor) * anchoMax;
    ctx.fillStyle = hexA(d.color, 0.85); ctx.fillRect(izq, y + 3, bw, filaH - 8);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(formatoValor(d, izq + bw + 6, y + filaH * 0.62), izq + bw + 6, y + filaH * 0.62);
  });
  return true;
}
