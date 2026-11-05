'use strict';

/* Pestaña Conjunto (RF-011): agrégados del auto de la REF (12 paneles). */

async function renderPestanaConjunto() {
  destroyCharts();
  const datos = await puente.pedirPestana('conjunto');
  if (!datos || !datos.tiempos.length) {
    state.pistasCurvas = [];
    vaciarConjuntos();
    return;
  }
  state.pistasCurvas = datos.mapa.curvas || [];
  state.ultimoConjunto = datos;
  dibujarBarrasTiempos(datos);
  dibujarVelMedia(datos);
  dibujarEnvolvente(datos);
  dibujarHistVel(datos);
  dibujarHistMarchas(datos);
  dibujarFuel(datos);
  dibujarDesvioLateral(datos);
  dibujarSectores(datos);
  dibujarMapaSectores(datos);
  dibujarMapaTeorico(datos);
  renderTablaResumen(datos);
  renderTeorica(datos);
}

function vaciarConjuntos() {
  for (const id of ['ch-barras-tiempos', 'ch-velmedia', 'ch-histvel', 'ch-histgear', 'ch-fuel', 'ch-sectores', 'ch-mapa-sectores', 'ch-mapa-teorico']) {
    const cv = $(id);
    if (cv) { const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); }
  }
  $('tabla-resumen').innerHTML = '';
  $('teorica').innerHTML = '';
}

/* Tiempos por vuelta (barra más corta = mejor, backend entrega orden ascendente). */
function dibujarBarrasTiempos(datos) {
  const c = prepCanvas('ch-barras-tiempos', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.tiempos
    .filter((f) => f.tiempo_s != null && f.tiempo_s > 0)
    .map((f) => ({ etiqueta: f.etiqueta, valor: f.tiempo_s, delta: f.delta_s, color: colorDeVuelta(f.id) }));
  if (!filas.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos', 12, 20); return; }
  if (dibujarBarrasHorizontales(ctx, w, h, filas, (d) => fmtTiempo(d.valor) + ' ' + deltaTexto(d.delta))) {
    const valores = filas.map((d) => d.valor);
    const media = valores.reduce((a, v) => a + v, 0) / valores.length;
    const sd = Math.sqrt(valores.reduce((a, v) => a + (v - media) ** 2, 0) / valores.length);
    ctx.fillStyle = '#8b97a8'; ctx.font = '12px "Segoe UI"';
    ctx.fillText(`consistencia (σ) = ${sd.toFixed(3)} s   ·   promedio ${fmtTiempo(media)}`, 6, h - 4);
  }
}

function deltaTexto(delta) {
  if (delta == null) return '';
  if (delta <= 0.004) return 'MEJOR';
  return `( +${delta.toFixed(2)} )`;
}

function dibujarVelMedia(datos) {
  const c = prepCanvas('ch-velmedia', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.velocidades.map((f) => ({
    etiqueta: f.etiqueta, valor: f.media_kmh || 0, max: f.maxima_kmh, color: colorDeVuelta(f.id),
  }));
  if (!dibujarBarrasHorizontales(ctx, w, h, filas, (d) => `${(d.valor || 0).toFixed(1)} km/h  máx ${(d.max || 0).toFixed(0)}`)) {
    ctx.fillStyle = '#8b97a8'; ctx.fillText('sin datos', 12, 20);
  }
}

function dibujarEnvolvente(datos) {
  const cont = $('chart-env');
  if (!cont) return;
  const env = datos.envolvente;
  if (!env.s.length) return;
  lineChart(cont, 200, null, 'km/h',
    [env.s, env.minimo, env.promedio, env.maximo],
    [
      serieX(),
      { label: 'mín', stroke: '#f87171', width: 1.5, points: { show: false }, spanGaps: true },
      { label: 'promedio', stroke: '#22d3ee', width: 2, points: { show: false }, spanGaps: true },
      { label: 'máx', stroke: '#4ade80', width: 1.5, points: { show: false }, spanGaps: true },
    ]);
}

function dibujarHistVel(datos) {
  const c = prepCanvas('ch-histvel', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const conteo = datos.histograma_velocidad.conteos;
  if (!conteo.length) return;
  const cmax = Math.max(1, ...conteo);
  const maxKmh = datos.histograma_velocidad.maxima_kmh || 0;
  const pad = 24, bw = (w - pad * 2) / conteo.length;
  for (let i = 0; i < conteo.length; i++) {
    const bh = (conteo[i] / cmax) * (h - pad * 2);
    ctx.fillStyle = colorMap(i / (conteo.length - 1));
    ctx.fillRect(pad + i * bw, h - pad - bh, bw - 1, bh);
  }
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('0', pad, h - 8);
  ctx.fillText(`${maxKmh.toFixed(0)} km/h`, w - pad - 50, h - 8);
}

function dibujarHistMarchas(datos) {
  const c = prepCanvas('ch-histgear', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const conteo = datos.histograma_marchas.conteos;
  if (!conteo.length) return;
  const minima = datos.histograma_marchas.minima || 0;
  const cmax = Math.max(1, ...conteo);
  const pad = 24, bw = (w - pad * 2) / conteo.length;
  for (let i = 0; i < conteo.length; i++) {
    const bh = (conteo[i] / cmax) * (h - pad * 2);
    ctx.fillStyle = colorMap(i / (conteo.length - 1));
    ctx.fillRect(pad + i * bw + 2, h - pad - bh, bw - 4, bh);
  }
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  for (let i = 0; i < conteo.length; i++) {
    ctx.textAlign = 'center';
    ctx.fillText(String(i + minima), pad + i * bw + bw / 2, h - 8);
  }
  ctx.textAlign = 'left';
  ctx.fillText('marcha', 4, 14);
}

function dibujarFuel(datos) {
  const c = prepCanvas('ch-fuel', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.consumos
    .filter((f) => f.consumo != null)
    .map((f) => ({ etiqueta: f.etiqueta, valor: f.consumo, color: colorDeVuelta(f.id) }));
  if (!dibujarBarrasHorizontales(ctx, w, h, filas, (d) => `${d.valor.toFixed(1)} u`)) {
    ctx.fillStyle = '#8b97a8'; ctx.fillText('sin datos de combustible', 12, 20);
  }
}

function dibujarDesvioLateral(datos) {
  const cont = $('chart-lat');
  if (!cont || !datos.desvios.length) return;
  lineChart(cont, 200, [0, null], 'desvío (m)',
    [datos.grilla, ...datos.desvios.map((d) => d.valores)],
    [
      serieX(),
      ...datos.desvios.map((d) => ({ label: d.etiqueta, stroke: colorDeVuelta(d.id), width: 2, points: { show: false }, spanGaps: true })),
    ]);
}

/* Barras agrupadas por sector con tooltip; la mejor marca abajo. */
function dibujarSectores(datos) {
  const c = prepCanvas('ch-sectores', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const mat = datos.sectores.map((s) => ({ id: s.id, etiqueta: s.etiqueta, valores: s.sectores.map((x) => x.tiempo_s) }));
  const todos = mat.flatMap((m) => m.valores).filter((v) => v != null && v > 0);
  if (!todos.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos de sector', 12, 20); return; }
  const maxS = Math.max(...todos);
  const pad = 28, groupW = (w - pad * 2) / N_SECTORES;
  const barW = groupW / (mat.length + 1);
  const rects = [];
  mat.forEach((m, li) => m.valores.forEach((v, si) => {
    if (v == null || v <= 0) return;
    const x = pad + si * groupW + li * barW + 2;
    const bh = (v / maxS) * (h - pad * 2 - 12);
    ctx.fillStyle = hexA(colorDeVuelta(m.id), 0.9);
    ctx.fillRect(x, h - pad - bh, Math.max(barW - 2, 2), bh);
    rects.push({ x, y: h - pad - bh, w: Math.max(barW - 2, 2), h: bh, v, etiqueta: m.etiqueta, sector: si });
  }));
  ctx.textAlign = 'center';
  for (let s = 0; s < N_SECTORES; s++) {
    const cx = pad + s * groupW + groupW / 2;
    const mejores = mat.map((m) => m.valores[s]).filter((v) => v != null && v > 0);
    if (mejores.length) {
      ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Consolas", monospace';
      ctx.fillText(fmtTiempo(Math.min(...mejores)), cx, h - 3);
    }
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText('S' + (s + 1), cx, h - 16);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('tiempo por sector (s)', 4, 14);
  cv._rects = rects;
  cv.onmousemove = (ev) => moverTooltipRects(ev, cv, $('tt-sectores'), (r) => `S${r.sector + 1} · ${r.etiqueta}: ${fmtTiempo(r.v)}`);
  cv.onmouseleave = () => ocultarTooltip($('tt-sectores'));
}

function moverTooltipRects(ev, cv, tt, texto) {
  if (!tt || !cv._rects) return;
  const card = cv.closest('.grafico-card');
  const rCard = card ? card.getBoundingClientRect() : { left: 0, top: 0 };
  const r = cv._rects.find((q) => ev.offsetX >= q.x && ev.offsetX <= q.x + q.w && ev.offsetY >= q.y && ev.offsetY <= q.y + q.h);
  if (!r) { tt.hidden = true; return; }
  tt.textContent = texto(r);
  tt.style.left = `${ev.clientX - rCard.left + 14}px`;
  tt.style.top = `${ev.clientY - rCard.top + 12}px`;
  tt.hidden = false;
}

function ocultarTooltip(tt) {
  if (tt) tt.hidden = true;
}

/* Mapa de la REF partido en 3 sectores de igual distancia. */
function dibujarMapaSectores(datos) {
  const mapaData = datos.mapa;
  if (!dadosBoundsValidos(mapaData)) return;
  const c = prepCanvas('ch-mapa-sectores', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const ref = mapaData.trazas.find((t) => datos.vuelta_referencia && mismaId(t.id, datos.vuelta_referencia)) || mapaData.trazas[0];
  if (!ref) return;
  const vista = construirVistaFija(cv, mapaData.bounds);
  dibujarGrillaFondo(ctx, w, h);
  dibujarBandaPista(ctx, vista.tf, mapaData.pista);
  const longitud = longitudPistaDe(datos);
  const corte = longitud > 0 ? longitud / N_SECTORES : 0;
  const segmentos = SegmentosDeTraza(ref, vista.tf, corte);
  for (let s = 0; s < N_SECTORES; s++) {
    const pts = segmentos[s];
    if (!pts.length) continue;
    ctx.strokeStyle = colorMap(s / (N_SECTORES - 1));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  marcarCortes(ctx, vista, ref, corte, (s) => 'S' + (s + 1));
  marcarLineaMeta(ctx, vista, ref);
  dibujarNumeralesCurvas(ctx, vista.tf, ref, mapaData.curvas);
  leyendaSectorial(ctx, w, h);
}

function longitudPistaDe(datos) {
  if (datos.mapa.pista && datos.mapa.pista.longitud_m) return datos.mapa.pista.longitud_m;
  const g = datos.grilla || datos.mapa.trazas[0] && datos.mapa.trazas[0].s || [];
  return g.length ? g[g.length - 1] : 0;
}

function SegmentosDeTraza(traza, tf, corte) {
  const segmentos = new Array(N_SECTORES).fill(null).map(() => []);
  for (let i = 0; i < traza.s.length; i++) {
    const s = traza.s[i], p = traza.puntos[i];
    if (s == null || !p) continue;
    const si = corte > 0 ? Math.min(Math.floor(s / corte), N_SECTORES - 1) : 0;
    segmentos[si].push(tf(p[0], p[1]));
  }
  return segmentos;
}

/* Marcadores de corte de sector sobre una traza. */
function marcarCortes(ctx, vista, traza, corte, nombre) {
  if (corte <= 0) return;
  for (let s = 1; s < N_SECTORES; s++) {
    const i = indiceDeS(traza, s * corte);
    if (i < 0 || !traza.puntos[i]) continue;
    const [px, py] = vista.tf(traza.puntos[i][0], traza.puntos[i][1]);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '10px "Segoe UI"'; ctx.textAlign = 'center';
    ctx.fillText(nombre(s), px, py - 8);
    ctx.textAlign = 'left';
  }
}

function marcarLineaMeta(ctx, vista, traza) {
  const p0 = traza.puntos.find((p) => p);
  if (!p0) return;
  const [mx, my] = vista.tf(p0[0], p0[1]);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"'; ctx.fillText('S/F', mx + 8, my - 6);
}

function leyendaSectorial(ctx, w, h) {
  ctx.font = '10px "Segoe UI"'; ctx.fillStyle = '#8b97a8';
  ctx.fillText('S1', 8, h - 8);
  ctx.fillText('S' + N_SECTORES, w - 30, h - 8);
  const lw = w - 58;
  if (lw > 0) for (let k = 0; k < lw; k++) { ctx.fillStyle = colorMap(k / lw); ctx.fillRect(24 + k, h - 14, 1, 4); }
}

/* Mejor vuelta de cada sector. */
function construirTrazadaTeorica(datos) {
  const mapaData = datos.mapa;
  const corte = longitudPistaDe(datos) / N_SECTORES;
  const tramos = [];
  if (corte > 0) {
    for (let s = 0; s < N_SECTORES; s++) {
      let mejor = null;
      for (const sv of datos.sectores) {
        const sec = sv.sectores[s];
        if (sec && sec.tiempo_s != null && sec.tiempo_s > 0 && (!mejor || sec.tiempo_s < mejor.tiempo_s)) mejor = sv;
      }
      if (!mejor) continue;
      const traza = mapaData.trazas.find((t) => mismaId(t.id, mejor.id));
      if (traza) tramos.push({ s, vuelta: mejor.etiqueta, traza });
    }
  }
  return { tramos, corte };
}

/* Trazada compuesta: el mejor sector de cada vuelta en una sola línea. */
function dibujarMapaTeorico(datos) {
  const mapaData = datos.mapa;
  if (!dadosBoundsValidos(mapaData)) return;
  const c = prepCanvas('ch-mapa-teorico', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const vista = construirVistaFija(cv, mapaData.bounds);
  dibujarGrillaFondo(ctx, w, h);
  pintarTrazadaTeorica(ctx, vista, mapaData, datos, w, h);
  cv.onclick = () => abrirZoomTeorico(datos);
}

function pintarTrazadaTeorica(ctx, vista, mapaData, datos, w, h) {
  const corte = longitudPistaDe(datos) / N_SECTORES;
  const tramos = construirTrazadaTeorica(datos).tramos;
  if (!tramos.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin sectores medibles', 8, 20); return; }
  for (const traza of mapaData.trazas) dibujarTrazada(ctx, vista.tf, traza, 'rgba(148,163,184,0.12)', 2);
  dibujarBandaPista(ctx, vista.tf, mapaData.pista);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5;
  for (const tramo of tramos) {
    ctx.strokeStyle = colorMap(tramo.s / (N_SECTORES - 1));
    ctx.beginPath();
    let primero = true;
    for (let i = 0; i < tramo.traza.s.length; i++) {
      const s = tramo.traza.s[i], p = tramo.traza.puntos[i];
      if (s == null || !p || s < tramo.s * corte || s > (tramo.s + 1) * corte) continue;
      const [x, y] = vista.tf(p[0], p[1]);
      if (primero) { ctx.moveTo(x, y); primero = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  marcarCortes(ctx, vista, tramos[0].traza, corte, (s) => 'S' + (s + 1));
  marcarLineaMeta(ctx, vista, tramos[0].traza);
  const usadas = [...new Set(tramos.map((t) => t.vuelta))];
  const resumen = usadas.length === 1 ? `mejor vuelta: ${usadas[0]}` : `mejores sectores de: ${usadas.join(', ')}`;
  if (w != null) {
    ctx.font = '10px "Segoe UI"'; ctx.fillStyle = '#8b97a8';
    ctx.fillText(resumen.slice(0, 90), 8, 14);
    leyendaSectorial(ctx, w, h);
  }
}

/* Tabla resumen por vuelta (DTO.tabla). */
function renderTablaResumen(datos) {
  const cont = $('tabla-resumen');
  if (!cont) return;
  const filas = datos.tabla.map((f) => {
    const delta = f.delta_mejor_s;
    const extra = tiempoConDelta(f.tiempo_s, delta);
    return `<tr><td>${f.etiqueta}</td><td class="mono">${extra}</td>` +
      `<td>${(f.velocidad_media_kmh || 0).toFixed(1)}</td><td>${(f.velocidad_maxima_kmh || 0).toFixed(0)}</td>` +
      `<td>${((f.acelerador_medio || 0) * 100).toFixed(0)}</td><td>${((f.freno_medio || 0) * 100).toFixed(0)}</td>` +
      `<td>${(f.g_lat_max || 0).toFixed(2)}</td><td>${(f.rpm_medio || 0).toFixed(0)}</td>` +
      `<td>${f.combustible_usado == null ? '–' : f.combustible_usado.toFixed(1)}</td></tr>`;
  }).join('');
  cont.innerHTML =
    '<table><thead><tr><th>Vuelta</th><th>Tiempo</th><th>Vel.media</th><th>Vel.máx</th><th>Gas%</th><th>Freno%</th><th>g lat</th><th>RPM</th><th>Fuel</th></tr></thead><tbody>' +
    filas + '</tbody></table>';
}

function tiempoConDelta(t, delta) {
  if (t == null) return '–';
  let txt = fmtTiempo(t);
  if (delta != null && delta > 0.004) txt += ` <span class="delta">+${delta.toFixed(2)}</span>`;
  return txt;
}

function renderTeorica(datos) {
  const cont = $('teorica');
  if (!cont) return;
  const teo = datos.teorica;
  if (teo.total_s == null) { cont.innerHTML = '<em>Faltan tiempos para calcular la vuelta teórica.</em>'; return; }
  cont.innerHTML =
    `<div class="teorica-fila"><span>Vuelta teórica (mejor sector de cada vuelta)</span><strong class="mono">${fmtTiempo(teo.total_s)}</strong></div>` +
    `<div class="teorica-fila"><span>Mejor vuelta real</span><strong class="mono">${fmtTiempo(teo.mejor_real_s)}</strong></div>` +
    `<div class="teorica-fila"><span>Potencial a ganar</span><strong class="mono">${teo.potencial_s == null ? '–' : '-' + teo.potencial_s.toFixed(3) + ' s'}</strong></div>`;
}

// ===== Zoom de la trazada teórica (overlay) =====

const zoomTeorico = { modo: 'teorica', activo: false, zoom: 1, panX: 0, panY: 0, datos: null, listo: false, arrastrando: false, lx: 0, ly: 0 };

function abrirZoomTeorico(datos) {
  zoomTeorico.datos = datos;
  zoomTeorico.modo = 'teorica';
  zoomTeorico.activo = true;
  zoomTeorico.zoom = 1; zoomTeorico.panX = 0; zoomTeorico.panY = 0;
  const ov = $('zoom-teorico');
  ov.classList.remove('oculto');
  ov.setAttribute('aria-hidden', 'false');
  dibujarZoomTeorico();
  if (!zoomTeorico.listo) { zoomTeorico.listo = true; configurarZoomTeorico(); }
}

function cerrarZoomTeorico() {
  const ov = $('zoom-teorico');
  if (!ov) return;
  ov.classList.add('oculto');
  ov.setAttribute('aria-hidden', 'true');
  zoomTeorico.activo = false;
}

function actualizarNivelZoom() {
  const lbl = $('zoom-nivel');
  if (lbl) lbl.textContent = Math.round(zoomTeorico.zoom * 100) + '%';
}

function dibujarZoomTeorico() {
  if (!zoomTeorico.activo || !zoomTeorico.datos) return;
  const c = prepCanvas('ch-mapa-zoom', 560);
  if (!c) return;
  actualizarNivelZoom();
  const { ctx, w, h, cv } = c;
  if (zoomTeorico.modo === 'traccion') {
    pintarCirculoTraction(c, zoomTeorico.datos.pts, zoomTeorico.datos.maxG);
    return;
  }
  const base = construirVistaFija(cv, zoomTeorico.datos.mapa.bounds);
  const z = zoomTeorico.zoom, px = zoomTeorico.panX, py = zoomTeorico.panY;
  const tf = (x, y) => {
    const [X, Y] = base.tf(x, y);
    return [(X - w / 2) * z + w / 2 - px, (Y - h / 2) * z + h / 2 - py];
  };
  pintarTrazadaTeorica(ctx, { tf }, zoomTeorico.datos.mapa, zoomTeorico.datos, w, h);
}

function configurarZoomTeorico() {
  $('zoom-cerrar').onclick = cerrarZoomTeorico;
  $('zoom-in').onclick = () => { zoomTeorico.zoom = clamp(zoomTeorico.zoom * 1.25, 1, 8); dibujarZoomTeorico(); };
  $('zoom-out').onclick = () => { zoomTeorico.zoom = clamp(zoomTeorico.zoom / 1.25, 1, 8); dibujarZoomTeorico(); };
  $('zoom-reset').onclick = () => { zoomTeorico.zoom = 1; zoomTeorico.panX = 0; zoomTeorico.panY = 0; dibujarZoomTeorico(); };
  const ov = $('zoom-teorico');
  ov.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarZoomTeorico(); });
  const cv = $('ch-mapa-zoom');
  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomTeorico.zoom = clamp(zoomTeorico.zoom * (ev.deltaY < 0 ? 1.1 : 0.9), 1, 8);
    dibujarZoomTeorico();
  }, { passive: false });
  cv.addEventListener('mousedown', (ev) => { zoomTeorico.arrastrando = true; zoomTeorico.lx = ev.clientX; zoomTeorico.ly = ev.clientY; });
  window.addEventListener('mousemove', (ev) => {
    if (!zoomTeorico.arrastrando) return;
    zoomTeorico.panX -= ev.clientX - zoomTeorico.lx;
    zoomTeorico.panY -= ev.clientY - zoomTeorico.ly;
    zoomTeorico.lx = ev.clientX; zoomTeorico.ly = ev.clientY;
    dibujarZoomTeorico();
  });
  window.addEventListener('mouseup', () => { zoomTeorico.arrastrando = false; });
}
