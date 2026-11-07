'use strict';

/* Pestaña Mapa (RF-011): banda + trazadas, canales, marcadores, 3D, auto en vivo. */

async function renderPestanaMapa(version = state.version) {
  const rot = state.mapa.tresD ? state.mapa.rot : 0;
  const alt = state.mapa.tresD ? state.mapa.alt : 3;
  const datos = await puente.pedirPestana('mapa', rot, alt);
  const rotActual = state.mapa.tresD ? state.mapa.rot : 0;
  const altActual = state.mapa.tresD ? state.mapa.alt : 3;
  if (version !== state.version || state.tab !== 'mapa' || rot !== rotActual || alt !== altActual) return;
  state.mapaDatos = datos;
  state.pistasCurvas = datos.curvas || [];
  destruirTrazadasObsoletas();
  dibujarMapaPestana();
  dibujarAutoCarga(state.idx);
}

/* Si la selección cambió, rehacer la grilla de mini-mapas. */
function destruirTrazadasObsoletas() {
  const cont = $('mapa-trazadas');
  if (!cont || !state.mapaDatos) return;
  const key = state.mapaDatos.trazas.map((t) => idVuelta(t.id)).join(',');
  if (cont.dataset.key !== key) { cont.innerHTML = ''; cont.dataset.key = ''; }
}

function dibujarMapaPestana(opts = {}) {
  const datos = state.mapaDatos;
  if (!datos || !datos.trazas.length || !dadosBoundsValidos(datos)) return;
  const cv = $('mapa');
  if (!cv) return;
  if (opts.soloVivo) { dibujarAutoCarga(state.idx); return; }
  const trazada = state.mapa.visual === 'trazada';
  const cajaMapa = $('mapa-canvas');
  const cajaTrazadas = $('mapa-trazadas');
  if (cajaMapa) { cajaMapa.classList.toggle('oculto', trazada); cajaMapa.style.display = ''; }
  if (cajaTrazadas) cajaTrazadas.classList.toggle('oculto', !trazada);
  if (trazada) { dibujarMapaTrazadas(datos); return; }
  dibujarMapaCanal(datos);
  dibujarAutoCarga(state.idx);
}

function dadosBoundsValidos(datos) {
  const b = datos.bounds;
  return b && b.min_x != null && b.max_x != null && b.min_y != null && b.max_y != null;
}

/* Vista única heatmap coloreada por el canal elegido. */
function dibujarMapaCanal(datos) {
  const cv = $('mapa');
  const pcv = prepararMapa(cv);
  if (!pcv) return;
  const { ctx, w, h } = pcv;
  const bounds = datos.bounds;
  dibujarGrillaFondo(ctx, w, h);
  const ref = trazaReferencia(datos.trazas);
  const canal = state.mapa.canal;
  const rango = rangoCanalDeTrazas(datos.trazas, canal);
  dibujarBandaPista(ctx, construirVistaMapa(cv, bounds).tf, state.mapa.bordes ? datos.pista : null);
  const vista = construirVistaMapa(cv, datos.bounds);
  for (const traza of datos.trazas) {
    dibujarTrazaCanalizada(ctx, vista.tf, traza, canal, rango, ref && mismaId(traza.id, ref.id));
  }
  dibujarMarcadoresRef(ctx, vista.tf, ref, { frenada: state.mapa.frenada, cambios: state.mapa.cambios });
  dibujarNumeralesCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarLeyendaCanal(ctx, w, h, rango.min, rango.max, canal);
  if (!state.mapa.interaccion) {
    state.mapa.interaccion = true;
    adjuntarInteraccionMapa(cv, () => dibujarMapaCanal(state.mapaDatos));
  }
}

/* Mini-mapa por vuelta: banda + trazada fina por vuelta. */
function dibujarMapaTrazadas(datos) {
  const cont = $('mapa-trazadas');
  if (!cont) return;
  cont.style.display = 'flex';
  const trazas = datos.trazas;
  const key = trazas.map((t) => idVuelta(t.id)).join(',') + '|' + (state.mapa.bordes ? 'b' : 'n');
  if (cont.dataset.key !== key) {
    cont.innerHTML = '';
    cont.dataset.key = key;
    for (const traza of trazas) {
      const item = document.createElement('div');
      item.className = 'trazada-item';
      const nombre = trazaReferencia(trazas) && mismaId(traza.id, trazaReferencia(trazas).id) ? traza.etiqueta + ' (REF)' : traza.etiqueta;
      item.innerHTML =
        `<div class="trazada-titulo"><span class="trazada-dot" style="background:${colorDeVuelta(traza.id)}"></span>` +
        `<span class="trazada-nombre">${nombre}</span></div>`;
      const cv = document.createElement('canvas');
      cv.className = 'trazada-canvas';
      item.appendChild(cv);
      adjuntarInteraccionMapa(cv, () => dibujarMapaTrazadas(state.mapaDatos));
      cont.appendChild(item);
    }
  }
  const canvases = cont.querySelectorAll('.trazada-canvas');
  for (let i = 0; i < trazas.length; i++) {
    const cv = canvases[i];
    if (!cv) continue;
    const pcv = prepararCanvas(cv, 300);
    if (!pcv) continue;
    dibujarGrillaFondo(pcv.ctx, pcv.w, pcv.h);
    const vista = construirVistaMapa(cv, datos.bounds);
    dibujarBandaPista(pcv.ctx, vista.tf, state.mapa.bordes ? datos.pista : null);
    dibujarTrazada(pcv.ctx, vista.tf, trazas[i], colorDeVuelta(trazas[i].id), 3);
    dibujarMarcadoresRef(pcv.ctx, vista.tf, trazas[i], { frenada: state.mapa.frenada, cambios: state.mapa.cambios });
    dibujarNumeralesCurvas(pcv.ctx, vista.tf, trazas[i], datos.curvas);
  }
}

/* Etiqueta del canal + escala. */
function dibujarLeyendaCanal(ctx, w, h, min, max, canal) {
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  ctx.fillText(canal, 10, h - 32);
  dibujarEscalaColor(ctx, w, h, min, max);
}

/* Carga por rueda en vivo (vuelta REF) — usa la vista base (datosVuelta). */
function dibujarAutoCarga(i) {
  const c = prepCanvas('chart-carga-vivo', 240);
  if (!c || !state.datosVuelta) return;
  const ref = vueltaReferencia();
  if (!ref) { c.ctx.fillStyle = '#8b97a8'; c.ctx.fillText('Sin vuelta de referencia.', 12, 20); return; }
  const { ctx, w, h } = c;
  const carga = ref.carga;
  const series = [
    { clave: 'delantera_izquierda', etiqueta: 'FL', color: '#38bdf8', u: [-1, -1] },
    { clave: 'delantera_derecha', etiqueta: 'FR', color: '#f472b6', u: [1, -1] },
    { clave: 'trasera_izquierda', etiqueta: 'RL', color: '#4ade80', u: [-1, 1] },
    { clave: 'trasera_derecha', etiqueta: 'RR', color: '#facc15', u: [1, 1] },
  ];
  let maxC = 0;
  for (const s of series) for (const v of carga[s.clave]) if (v != null && v > maxC) maxC = v;
  maxC = maxC || 1;
  const ancho = Math.min(w * 0.56, 240), alto = Math.min(h * 0.5, 130);
  const cx = w / 2, cy = h / 2 + 6;
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('Carga por rueda · ' + ref.etiqueta, 8, 16);
  ctx.textAlign = 'center';
  ctx.fillText('▲ adelante', cx, cy - alto / 2 - 14);
  ctx.textAlign = 'left';
  const rw = Math.min(ancho * 0.16, 34), rh = Math.min(alto * 0.22, 20);
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  redondeado(ctx, cx - ancho / 2, cy - alto / 2, ancho, alto, ancho * 0.18); ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  redondeado(ctx, cx - ancho * 0.36, cy - alto / 2 + 2, ancho * 0.72, alto * 0.18, 8); ctx.fill();
  for (const s of series) {
    const rx = cx + (s.u[0] * ancho) / 2 - rw / 2;
    const ry = cy + (s.u[1] * alto) / 2 - rh / 2;
    const v = valorSerie(carga[s.clave], i);
    const frac = v == null ? 0 : clamp(v / maxC, 0, 1);
    ctx.fillStyle = '#1c2430';
    redondeado(ctx, rx - 2, ry - 2, rw + 4, rh + 4, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    if (v != null && frac > 0.02) {
      const offY = Math.round((1 - frac) * (rh - 2));
      ctx.fillStyle = colorMap(frac);
      redondeado(ctx, rx, ry + offY, rw, Math.max(2, Math.round((rh - 2) * frac)), 4); ctx.fill();
    } else if (v != null) {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      redondeado(ctx, rx, ry, rw, Math.max(2, Math.round(rh * 0.06)), 2); ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = s.color; ctx.font = 'bold 13px "Segoe UI"';
    ctx.fillText(s.etiqueta, rx + rw / 2, ry + rh + 16);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(v == null ? '–' : Math.round(v).toLocaleString(), rx + rw / 2, ry + rh + 30);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  ctx.fillText('0', 10, h - 6);
  ctx.fillText(maxC.toLocaleString() + ' N (máx)', w - 92, h - 6);
  for (let k2 = 0; k2 < w - 102 - 10 - 4; k2++) { ctx.fillStyle = colorMap(k2 / Math.max(w - 102 - 10 - 4, 1)); ctx.fillRect(10 + k2, h - 12, 1, 3); }
}
