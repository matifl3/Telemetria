'use strict';

/* Capa común de mapas: transform de bounds, banda de pista, trazas coloreadas
   por canal, marcadores de la REF y numerales de curvas (RF-011).
   Los puntos ya llegan proyectados desde el backend (DtoMapa). */

const vistasPorCv = { m: new WeakMap() };

/* Descarta vistas de zoom/pan guardadas por canvas (cambio de proyección). */
function resetearVistas() {
  vistasPorCv.m = new WeakMap();
}

function prepararMapa(cv) {
  return prepararCanvas(cv, 460);
}

/* Transform del canvas según bounds + zoom/pan guardados por canvas. */
function construirVistaMapa(cv, bounds) {
  const { w, h } = { w: cv.clientWidth || 400, h: cv.clientHeight || 300 };
  const vista = stateVista(cv);
  if (vista.resetView) {
    vista.zoom = 1; vista.panX = 0; vista.panY = 0; vista.resetView = false;
  }
  const pad = 34;
  const sx = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const sy = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  if (vista.s0 == null || vista.cvW !== w || vista.cvH !== h) {
    vista.s0 = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
    vista.cx = (bounds.min_x + bounds.max_x) / 2;
    vista.cy = (bounds.min_y + bounds.max_y) / 2;
    vista.cvW = w; vista.cvH = h;
  }
  const s = vista.zoom * vista.s0;
  return { tf: (px, py) => [w / 2 + vista.panX + (px - vista.cx) * s, h / 2 + vista.panY + (py - vista.cy) * s], w, h, vista };
}

/* Transform local (sin zoom/pan global): para mini-mapas fijos. */
function construirVistaFija(cv, bounds) {
  const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
  const pad = 30;
  const sx = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const sy = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  const s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
  const cx = (bounds.min_x + bounds.max_x) / 2;
  const cy = (bounds.min_y + bounds.max_y) / 2;
  return { tf: (px, py) => [w / 2 + (px - cx) * s, h / 2 + (py - cy) * s], w, h };
}

function stateVista(cv) {
  let vista = vistasPorCv.m.get(cv);
  if (!vista) {
    vista = { zoom: 1, panX: 0, panY: 0, resetView: true };
    vistasPorCv.m.set(cv, vista);
  }
  return vista;
}

/* Zoom/pan con rueda y arrastre; dblclick reinicia. `redibujar` repinta. */
function adjuntarInteraccionMapa(cv, redibujar) {
  if (!cv) return;
  cv.style.cursor = 'grab';
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomMapaVista(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - cv.getBoundingClientRect().left, e.clientY - cv.getBoundingClientRect().top, cv, redibujar);
  }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    const vista = stateVista(cv);
    drag = { x: e.clientX, y: e.clientY, px: vista.panX, py: vista.panY };
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const vista = stateVista(cv);
    vista.panX = drag.px + (e.clientX - drag.x);
    vista.panY = drag.py + (e.clientY - drag.y);
    redibujar();
  });
  const soltar = () => { if (drag) { drag = null; cv.style.cursor = 'grab'; } };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('dblclick', () => { const vista = stateVista(cv); vista.zoom = 1; vista.panX = 0; vista.panY = 0; cv.style.cursor = 'grab'; redibujar(); });
}

function zoomMapaVista(factor, mx, my, cv, redibujar) {
  const vista = stateVista(cv);
  const baseS = vista.s0 || 1;
  const oldS = baseS * vista.zoom;
  const nz = clamp(vista.zoom * factor, 0.6, 80);
  const r = (baseS * nz) / oldS;
  vista.zoom = nz;
  vista.panX = (mx - cv.clientWidth / 2) * (1 - r) + vista.panX * r;
  vista.panY = (my - cv.clientHeight / 2) * (1 - r) + vista.panY * r;
  redibujar();
}

function dibujarGrillaFondo(ctx, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let gx = 0; gx <= w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
  for (let gy = 0; gy <= h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
}

/* Banda (relleno + bordes) desde DtoPistaMapa (izquierda/derecha). */
function dibujarBandaPista(ctx, tf, pista) {
  if (!pista) return;
  const n = pista.izquierda.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const li = pista.izquierda[i], ri = pista.derecha[i];
    if (li) L.push(tf(li[0], li[1])); else L.push(null);
    if (ri) R.push(tf(ri[0], ri[1])); else R.push(null);
  }
  ctx.beginPath();
  let abierto = false;
  for (let i = 0; i < n; i++) {
    if (L[i] && R[i]) {
      const [lx, ly] = L[i];
      if (!abierto) { ctx.moveTo(lx, ly); abierto = true; } else ctx.lineTo(lx, ly);
    } else if (abierto) {
      for (let j = i - 1; j >= 0; j--) {
        if (R[j]) { const [rx, ry] = R[j]; ctx.lineTo(rx, ry); } else break;
      }
      ctx.closePath();
      abierto = false;
    }
  }
  if (abierto) {
    for (let j = n - 1; j >= 0; j--) {
      if (R[j]) { const [rx, ry] = R[j]; ctx.lineTo(rx, ry); } else break;
    }
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  ctx.fill();
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(148,163,184,0.6)';
  for (const lado of [L, R]) {
    let tramo = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = lado[i];
      if (!p) { tramo = false; continue; }
      if (!tramo) { ctx.moveTo(p[0], p[1]); tramo = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }
}

/* Objeto con la serie de un canal dentro de la traza. */
function canalDeTraza(traza, canal) {
  switch (canal) {
    case 'velocidad_kmh': return traza.velocidad_kmh;
    case 'acelerador': return traza.acelerador;
    case 'freno': return traza.freno;
    case 'marcha': return traza.marcha;
    case 'altura': return traza.altura;
    case 'acc_lat_g': return traza.acc_lat_g;
    default: return null;
  }
}

function rangoCanalDeTrazas(trazas, canal) {
  let min = Infinity, max = -Infinity;
  for (const traza of trazas) {
    const serie = canalDeTraza(traza, canal) || [];
    for (const v of serie) {
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return { min, max: max === min ? min + 1 : max };
}

/* Heatmap: cada segmento de cada traza se pinta según el valor del canal. */
function dibujarTrazaCanalizada(ctx, tf, traza, canal, rango, esRef) {
  const serie = canalDeTraza(traza, canal) || [];
  const rangoReal = Math.max(rango.max - rango.min, 1e-6);
  const pts = traza.puntos;
  ctx.lineCap = 'round';
  ctx.lineWidth = esRef ? 4 : 3;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!a || !b) continue;
    const v = serie[i];
    const [x0, y0] = tf(a[0], a[1]);
    const [x1, y1] = tf(b[0], b[1]);
    ctx.strokeStyle = v == null ? '#555' : colorMap((v - rango.min) / rangoReal);
    ctx.globalAlpha = esRef ? 1 : 0.7;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* Línea fina de una traza (mini-mapa de trazada). */
function dibujarTrazada(ctx, tf, traza, color, ancho) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.lineWidth = ancho || 3;
  ctx.beginPath();
  let tramo = false;
  for (const p of traza.puntos) {
    if (!p) { tramo = false; continue; }
    const [x, y] = tf(p[0], p[1]);
    if (!tramo) { ctx.moveTo(x, y); tramo = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function trazaReferencia(trazas) {
  const refer = state.resumen && state.resumen.seleccion && state.resumen.seleccion.referencia;
  if (refer) {
    const ref = trazas.find((t) => mismaId(t.id, refer));
    if (ref) return ref;
  }
  return trazas[0] || null;
}

/* Marcadores de la REF: frenadas (freno > 0.45), cambios de marcha y S/F. */
function dibujarMarcadoresRef(ctx, tf, traza, opts) {
  if (!traza) return;
  if (opts.frenada) {
    const freno = traza.freno;
    let prev = 0;
    for (let i = 0; i < freno.length; i++) {
      const v = freno[i] == null ? 0 : freno[i];
      if (v > 0.45 && prev <= 0.45) {
        const p = traza.puntos[i];
        if (!p) continue;
        const [px, py] = tf(p[0], p[1]);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      }
      prev = v;
    }
  }
  if (opts.cambios) {
    const marcha = traza.marcha;
    for (let i = 1; i < marcha.length; i++) {
      const a = marcha[i - 1], b = marcha[i];
      if (a == null || b == null || a === b) continue;
      const p = traza.puntos[i];
      if (!p) continue;
      const [px, py] = tf(p[0], p[1]);
      ctx.font = '12px "Segoe UI"';
      ctx.fillStyle = b > a ? '#4ade80' : '#facc15';
      ctx.fillText(b > a ? '↑' : '↓', px - 4, py - 4);
    }
  }
  const p0 = (traza.puntos || []).find((p) => p);
  if (p0) {
    const [mx, my] = tf(p0[0], p0[1]);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '11px "Segoe UI"'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText('S/F', mx + 8, my - 6);
  }
}

/* Posición del punto con s más cercano dentro de una traza. */
function indiceDeS(traza, sApex) {
  if (sApex == null) return -1;
  const serie = traza.s;
  let mejor = -1, difMin = Infinity;
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i];
    if (v == null) continue;
    const dif = Math.abs(v - sApex);
    if (dif < difMin && traza.puntos[i]) { difMin = dif; mejor = i; }
  }
  return mejor;
}

/* Numerales C1..Cn sobre el eje del apex (sobre una traza de referencia). */
function dibujarNumeralesCurvas(ctx, tf, traza, curvas) {
  if (!curvas || !curvas.length || !traza) return;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  for (const c of curvas) {
    const i = indiceDeS(traza, c.s_apex == null ? c.s_ini : c.s_apex);
    if (i < 0) continue;
    const [px, py] = tf(traza.puntos[i][0], traza.puntos[i][1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(13,18,26,0.78)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(226,232,240,0.85)'; ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.fillText(c.nombre, px, py + 0.5);
  }
  ctx.restore();
}

/* Arcos de curva coloreados con su etiqueta (pestaña Curvas). */
function dibujarArcosCurvas(ctx, tf, traza, curvas) {
  if (!traza || !curvas.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  curvas.forEach((c, k) => {
    const col = PALETA[k % PALETA.length];
    ctx.strokeStyle = col; ctx.lineWidth = 3.5;
    ctx.beginPath();
    let primero = true;
    let apex = null;
    for (let i = 0; i < traza.s.length; i++) {
      const v = traza.s[i], p = traza.puntos[i];
      if (v == null || !p) continue;
      const dentro = c.s_ini != null && c.s_fin != null && v >= c.s_ini && v <= c.s_fin;
      if (!dentro) continue;
      const [x, y] = tf(p[0], p[1]);
      if (primero) { ctx.moveTo(x, y); primero = false; } else ctx.lineTo(x, y);
      const apexS = c.s_apex == null ? c.s_ini : c.s_apex;
      if (apex == null && v >= apexS) apex = [x, y];
    }
    ctx.stroke();
    if (apex) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(apex[0], apex[1], 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e7edf5'; ctx.font = '10px "Segoe UI"'; ctx.textAlign = 'center';
      ctx.fillText(c.nombre, apex[0], apex[1] - 7);
      ctx.textAlign = 'left';
    }
  });
}
