'use strict';

/* Gráficos de Conjunto: agregados de todas las vueltas válidas del auto de la
   REF (fuente `conjunto`). Incluye el overlay de zoom de la trazada teórica,
   que también usa el círculo de tracción de Curvas. */

const SIN_CONJUNTO = 'Sin vueltas válidas del auto de la REF para calcular el conjunto.';
const hayConjunto = (datos) => datos && datos.tiempos && datos.tiempos.length > 0;

/* Envoltorio: si no hay conjunto, la tarjeta muestra el aviso. */
function siHayConjunto(montar) {
  return (cuerpo, datos, aj, t) => {
    if (!hayConjunto(datos)) { mensajeTarjeta(cuerpo, SIN_CONJUNTO); return {}; }
    return montar(cuerpo, datos, aj, t);
  };
}

const CONJUNTO = { categoria: 'conjunto', fuente: 'conjunto', tamano: { w: 6, h: 6 } };

registrarGrafico({
  ...CONJUNTO, id: 'tiempos-vuelta', nombre: 'Tiempos por vuelta', unidad: 'mejor al tope · σ = consistencia',
  descripcion: 'Barra por vuelta con su diferencia a la mejor y la consistencia (σ).',
  montar: siHayConjunto(graficoCanvas(dibujarBarrasTiempos)),
});
registrarGrafico({
  ...CONJUNTO, id: 'velocidad-media', nombre: 'Velocidad media / máx por vuelta', unidad: 'km/h',
  descripcion: 'Velocidad media y máxima de cada vuelta.',
  montar: siHayConjunto(graficoCanvas(dibujarVelMedia)),
});
registrarGrafico({
  ...CONJUNTO, id: 'envolvente', nombre: 'Envolvente de velocidad', unidad: 'mín / prom / máx',
  descripcion: 'Velocidad mínima, promedio y máxima entre vueltas a lo largo de la pista.',
  uplot: (datos) => {
    if (!hayConjunto(datos)) return { vacio: SIN_CONJUNTO };
    const env = datos.envolvente;
    if (!env.s.length) return { vacio: 'Sin datos de envolvente.' };
    return {
      plots: [{
        data: [env.s, env.minimo, env.promedio, env.maximo],
        series: [
          serieX(),
          { label: 'mín', stroke: COLOR.freno, width: 1.5, points: { show: false }, spanGaps: true },
          { label: 'promedio', stroke: COLOR.acento, width: 2, points: { show: false }, spanGaps: true },
          { label: 'máx', stroke: COLOR.gas, width: 1.5, points: { show: false }, spanGaps: true },
        ],
        yLabel: 'km/h',
      }],
    };
  },
});
registrarGrafico({
  ...CONJUNTO, id: 'histograma-velocidad', nombre: 'Histograma de velocidad', unidad: 'km/h',
  descripcion: 'Cuánto tiempo se pasa en cada rango de velocidad.',
  montar: siHayConjunto(graficoCanvas(dibujarHistVel)),
});
registrarGrafico({
  ...CONJUNTO, id: 'uso-marchas', nombre: 'Uso de marchas', unidad: 'frecuencia',
  descripcion: 'Frecuencia de uso de cada marcha.',
  montar: siHayConjunto(graficoCanvas(dibujarHistMarchas)),
});
registrarGrafico({
  ...CONJUNTO, id: 'combustible', nombre: 'Combustible usado por vuelta', unidad: 'unidades crudas',
  descripcion: 'Consumo de combustible de cada vuelta.',
  montar: siHayConjunto(graficoCanvas(dibujarFuel)),
});
registrarGrafico({
  ...CONJUNTO, id: 'desvio-lateral', nombre: 'Desvío lateral vs vuelta REF', unidad: 'm',
  descripcion: 'Distancia de cada trazada a la de la REF a lo largo de la pista.',
  uplot: (datos) => {
    if (!hayConjunto(datos)) return { vacio: SIN_CONJUNTO };
    if (!datos.desvios.length) return { vacio: 'Sin desvíos para comparar.' };
    return {
      plots: [{
        data: [datos.grilla, ...datos.desvios.map((d) => d.valores)],
        series: [
          serieX(),
          ...datos.desvios.map((d) => ({ label: etiquetaCorta(d.etiqueta), stroke: colorDeVuelta(d.id), width: 2, points: { show: false }, spanGaps: true })),
        ],
        yRango: [0, null],
        yLabel: 'desvío (m)',
      }],
    };
  },
});
registrarGrafico({
  ...CONJUNTO, id: 'tiempo-sector', nombre: 'Tiempo por sector', unidad: '3 sectores de igual distancia',
  descripcion: 'Barras por sector y vuelta, con la mejor marca de cada sector.',
  montar: siHayConjunto(graficoCanvas(dibujarSectores, { tooltip: true })),
});
registrarGrafico({
  ...CONJUNTO, id: 'mapa-sectores', nombre: 'Mapa por sectores', unidad: 'vuelta REF · 3 sectores',
  descripcion: 'Trazada de la REF partida en 3 sectores de igual distancia.',
  montar: siHayConjunto(graficoCanvas(dibujarMapaSectores)),
});
registrarGrafico({
  ...CONJUNTO, id: 'trazada-teorica', nombre: 'Trazada de mejores sectores', unidad: 'mejor sector de cada vuelta',
  descripcion: 'El mejor sector de cada vuelta unido en una sola trazada; se puede ver en grande con zoom.',
  montar: siHayConjunto(graficoCanvas(dibujarMapaTeorico, { ampliar: (datos) => abrirZoomTeorico(datos) })),
});
registrarGrafico({
  ...CONJUNTO, id: 'consistencia-curva', nombre: 'Consistencia por curva', unidad: 'de la más irregular a la más repetible',
  descripcion: 'Qué varía más entre vueltas en cada curva.',
  tamano: { w: 12, h: 7 },
  montar: siHayConjunto(graficoHTML(renderConsistencia)),
});
registrarGrafico({
  ...CONJUNTO, id: 'dispersion-velocidad', nombre: 'Dispersión de velocidad', unidad: 'desvío estándar entre vueltas · km/h',
  descripcion: 'Dónde la velocidad cambia más de una vuelta a otra.',
  uplot: (datos) => {
    if (!hayConjunto(datos)) return { vacio: SIN_CONJUNTO };
    const c = datos.consistencia;
    if (!c || c.aviso) return { vacio: (c && c.aviso) || 'Sin datos de dispersión.' };
    return {
      plots: [{
        data: [datos.grilla, c.desvio_velocidad],
        series: [
          serieX(),
          { label: 'σ velocidad', stroke: COLOR.amarillo, width: 1.5, fill: 'rgba(250,204,21,0.12)', points: { show: false }, spanGaps: false },
        ],
        yLabel: 'σ km/h',
      }],
    };
  },
});
registrarGrafico({
  ...CONJUNTO, id: 'resumen-vueltas', nombre: 'Resumen por vuelta', unidad: '',
  descripcion: 'Tabla con tiempo, velocidades, pedales, g lateral, RPM y combustible de cada vuelta.',
  tamano: { w: 12, h: 6 },
  montar: siHayConjunto(graficoHTML(renderTablaResumen)),
});
registrarGrafico({
  ...CONJUNTO, id: 'vuelta-teorica', nombre: 'Vuelta teórica', unidad: 'mejor sector de cada vuelta',
  descripcion: 'Suma de los mejores sectores frente a la mejor vuelta real.',
  tamano: { w: 4, h: 4 },
  montar: siHayConjunto(graficoHTML(renderTeorica)),
});

// ===== Dibujo =====

/* Tiempos por vuelta (barra más corta = mejor, backend entrega orden ascendente). */
function dibujarBarrasTiempos(cv, datos) {
  const c = prepararCanvas(cv, 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.tiempos
    .filter((f) => f.tiempo_s != null && f.tiempo_s > 0)
    .map((f) => ({ etiqueta: f.etiqueta, valor: f.tiempo_s, delta: f.delta_s, color: colorDeVuelta(f.id) }));
  if (!filas.length) { ctx.fillStyle = COLOR.apagado; ctx.fillText('sin tiempos', 12, 20); return; }
  if (dibujarBarrasHorizontales(ctx, w, h, filas, (d) => fmtTiempo(d.valor) + ' ' + deltaTexto(d.delta))) {
    const valores = filas.map((d) => d.valor);
    const media = valores.reduce((a, v) => a + v, 0) / valores.length;
    const sd = Math.sqrt(valores.reduce((a, v) => a + (v - media) ** 2, 0) / valores.length);
    ctx.fillStyle = COLOR.apagado; ctx.font = '12px "Segoe UI"';
    ctx.fillText(`consistencia (σ) = ${sd.toFixed(3)} s   ·   promedio ${fmtTiempo(media)}`, 6, h - 4);
  }
}

function deltaTexto(delta) {
  if (delta == null) return '';
  if (delta <= 0.004) return 'MEJOR';
  return `( +${delta.toFixed(2)} )`;
}

function dibujarVelMedia(cv, datos) {
  const c = prepararCanvas(cv, 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.velocidades.map((f) => ({
    etiqueta: f.etiqueta, valor: f.media_kmh || 0, max: f.maxima_kmh, color: colorDeVuelta(f.id),
  }));
  if (!dibujarBarrasHorizontales(ctx, w, h, filas, (d) => `${(d.valor || 0).toFixed(1)} km/h  máx ${(d.max || 0).toFixed(0)}`)) {
    ctx.fillStyle = COLOR.apagado; ctx.fillText('sin datos', 12, 20);
  }
}

function dibujarHistVel(cv, datos) {
  const c = prepararCanvas(cv, 200);
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
  ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
  ctx.fillText('0', pad, h - 8);
  ctx.fillText(`${maxKmh.toFixed(0)} km/h`, w - pad - 50, h - 8);
}

function dibujarHistMarchas(cv, datos) {
  const c = prepararCanvas(cv, 200);
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
  ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
  for (let i = 0; i < conteo.length; i++) {
    ctx.textAlign = 'center';
    ctx.fillText(String(i + minima), pad + i * bw + bw / 2, h - 8);
  }
  ctx.textAlign = 'left';
  ctx.fillText('marcha', 4, 14);
}

function dibujarFuel(cv, datos) {
  const c = prepararCanvas(cv, 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const filas = datos.consumos
    .filter((f) => f.consumo != null)
    .map((f) => ({ etiqueta: f.etiqueta, valor: f.consumo, color: colorDeVuelta(f.id) }));
  if (!dibujarBarrasHorizontales(ctx, w, h, filas, (d) => `${d.valor.toFixed(1)} u`)) {
    ctx.fillStyle = COLOR.apagado; ctx.fillText('sin datos de combustible', 12, 20);
  }
}

/* Barras agrupadas por sector con tooltip; la mejor marca abajo. */
function dibujarSectores(cv, datos, { tooltip }) {
  const c = prepararCanvas(cv, 260);
  if (!c) return;
  const { ctx, w, h } = c;
  const mat = datos.sectores.map((s) => ({ id: s.id, etiqueta: s.etiqueta, valores: s.sectores.map((x) => x.tiempo_s) }));
  const todos = mat.flatMap((m) => m.valores).filter((v) => v != null && v > 0);
  if (!todos.length) { ctx.fillStyle = COLOR.apagado; ctx.fillText('sin tiempos de sector', 12, 20); return; }
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
      ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Consolas", monospace';
      ctx.fillText(fmtTiempo(Math.min(...mejores)), cx, h - 3);
    }
    ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
    ctx.fillText('S' + (s + 1), cx, h - 16);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
  ctx.fillText('tiempo por sector (s)', 4, 14);
  cv._rects = rects;
  cv.onmousemove = (ev) => moverTooltipRects(ev, cv, tooltip, (r) => `S${r.sector + 1} · ${r.etiqueta}: ${fmtTiempo(r.v)}`);
  cv.onmouseleave = () => ocultarTooltip(tooltip);
}

/* Globo sobre la barra bajo el mouse; posición relativa al cuerpo de la tarjeta. */
function moverTooltipRects(ev, cv, tt, texto) {
  if (!tt || !cv._rects) return;
  const caja = tt.parentElement;
  const rCaja = caja ? caja.getBoundingClientRect() : { left: 0, top: 0 };
  const r = cv._rects.find((q) => ev.offsetX >= q.x && ev.offsetX <= q.x + q.w && ev.offsetY >= q.y && ev.offsetY <= q.y + q.h);
  if (!r) { tt.hidden = true; return; }
  tt.textContent = texto(r);
  tt.style.left = `${ev.clientX - rCaja.left + (caja ? caja.scrollLeft : 0) + 14}px`;
  tt.style.top = `${ev.clientY - rCaja.top + (caja ? caja.scrollTop : 0) + 12}px`;
  tt.hidden = false;
}

function ocultarTooltip(tt) {
  if (tt) tt.hidden = true;
}

/* Mapa de la REF partido en 3 sectores de igual distancia. */
function dibujarMapaSectores(cv, datos) {
  const mapaData = datos.mapa;
  if (!dadosBoundsValidos(mapaData)) return;
  const c = prepararCanvas(cv, 260);
  if (!c) return;
  const { ctx, w, h } = c;
  const ref = mapaData.trazas.find((t) => datos.vuelta_referencia && mismaId(t.id, datos.vuelta_referencia)) || mapaData.trazas[0];
  if (!ref) return;
  const vista = construirVistaFija(cv, mapaData.bounds);
  dibujarGrillaFondo(ctx, w, h);
  dibujarBandaPista(ctx, vista.tf, mapaData.pista);
  const longitud = longitudPistaDe(datos);
  const corte = longitud > 0 ? longitud / N_SECTORES : 0;
  const segmentos = segmentosDeTraza(ref, vista.tf, corte);
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

function segmentosDeTraza(traza, tf, corte) {
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
  ctx.fillStyle = COLOR.blanco; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Segoe UI"'; ctx.fillText('S/F', mx + 8, my - 6);
}

function leyendaSectorial(ctx, w, h) {
  ctx.font = '10px "Segoe UI"'; ctx.fillStyle = COLOR.apagado;
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

/* Trazada compuesta: el mejor sector de cada vuelta en una sola línea.
   Clic = verla en grande con zoom. */
function dibujarMapaTeorico(cv, datos) {
  const mapaData = datos.mapa;
  if (!dadosBoundsValidos(mapaData)) return;
  const c = prepararCanvas(cv, 260);
  if (!c) return;
  const { ctx, w, h } = c;
  const vista = construirVistaFija(cv, mapaData.bounds);
  dibujarGrillaFondo(ctx, w, h);
  pintarTrazadaTeorica(ctx, vista, mapaData, datos, w, h);
  cv.style.cursor = 'zoom-in';
  cv.onclick = () => abrirZoomTeorico(datos);
}

function pintarTrazadaTeorica(ctx, vista, mapaData, datos, w, h) {
  const corte = longitudPistaDe(datos) / N_SECTORES;
  const tramos = construirTrazadaTeorica(datos).tramos;
  dibujarBandaPista(ctx, vista.tf, mapaData.pista);
  dibujarCentroPista(ctx, vista.tf, mapaData.pista);
  if (!tramos.length) {
    ctx.fillStyle = COLOR.apagado;
    ctx.fillText('sin sectores medibles', 8, 20);
    return;
  }
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
    ctx.font = '10px "Segoe UI"'; ctx.fillStyle = COLOR.apagado;
    ctx.fillText(`fast_lane.ai · ${resumen}`.slice(0, 90), 8, 14);
    leyendaSectorial(ctx, w, h);
  }
}

function dibujarCentroPista(ctx, tf, pista) {
  if (!pista || !pista.centro) return;
  ctx.strokeStyle = 'rgba(226,232,240,0.72)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let tramo = false;
  for (const punto of pista.centro) {
    if (!punto) {
      tramo = false;
      continue;
    }
    const [x, y] = tf(punto[0], punto[1]);
    if (tramo) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      tramo = true;
    }
  }
  ctx.stroke();
}

/* Tabla resumen por vuelta (DTO.tabla). */
function renderTablaResumen(cont, datos) {
  cont.classList.add('tabla-resumen');
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

function renderTeorica(cont, datos) {
  cont.classList.add('teorica');
  const teo = datos.teorica;
  if (teo.total_s == null) { cont.innerHTML = '<em>Faltan tiempos para calcular la vuelta teórica.</em>'; return; }
  cont.innerHTML =
    `<div class="teorica-fila"><span>Vuelta teórica (mejor sector de cada vuelta)</span><strong class="mono">${fmtTiempo(teo.total_s)}</strong></div>` +
    `<div class="teorica-fila"><span>Mejor vuelta real</span><strong class="mono">${fmtTiempo(teo.mejor_real_s)}</strong></div>` +
    `<div class="teorica-fila"><span>Potencial a ganar</span><strong class="mono">${teo.potencial_s == null ? '–' : '-' + teo.potencial_s.toFixed(3) + ' s'}</strong></div>`;
}

/* Consistencia entre vueltas del auto de la REF (ING46). */
function renderConsistencia(cont, datos) {
  const c = datos.consistencia;
  if (!c) { cont.innerHTML = '<em class="vacio">Sin datos de consistencia.</em>'; return; }
  if (c.aviso) { cont.innerHTML = `<em class="vacio">${c.aviso}</em>`; return; }
  const excluidas = c.vueltas_excluidas
    ? ` Se dejaron afuera ${c.vueltas_excluidas} vuelta(s) más lentas que el 107 % de la mejor.`
    : '';
  const num = (v, dec, u) => (v == null ? '–' : v.toFixed(dec) + u);
  const filas = c.curvas.map((f) => `<tr>
      <td>${f.nombre}</td>
      <td class="mono">${num(f.desvio_t_curva_s, 3, ' s')}</td>
      <td class="mono">${num(f.rango_inicio_frenada_m, 0, ' m')}</td>
      <td class="mono">${num(f.rango_v_min_kmh, 1, ' km/h')}</td>
      <td class="mono">${num(f.rango_gas_fondo_m, 0, ' m')}</td>
      <td>${f.explicacion}</td>
    </tr>`).join('');
  cont.innerHTML = `<table class="tabla-delta">
    <thead><tr><th>Curva</th>
      <th title="Desvío estándar del tiempo dentro del arco de la curva">σ tiempo</th>
      <th title="Diferencia entre la frenada más temprana y la más tardía">Rango frenada</th>
      <th title="Diferencia entre la velocidad mínima más alta y la más baja">Rango v mín</th>
      <th title="Diferencia entre el gas a fondo más temprano y el más tardío">Rango gas</th>
      <th>Qué varía más</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <p class="delta-leyenda">${c.vueltas_usadas} vueltas usadas.${excluidas}</p>`;
}

// ===== Zoom de la trazada teórica y del círculo de tracción (overlay) =====

const zoomTeorico = { modo: 'teorica', activo: false, zoom: 1, panX: 0, panY: 0, datos: null, listo: false, arrastrando: false, lx: 0, ly: 0 };

function abrirZoomTeorico(datos) {
  zoomTeorico.datos = datos;
  zoomTeorico.modo = 'teorica';
  zoomTeorico.zoom = 1; zoomTeorico.panX = 0; zoomTeorico.panY = 0;
  // El overlay es compartido con la tracción por curva: restaurar su título.
  $('zoom-titulo').textContent = 'Trazada de mejores sectores';
  mostrarOverlayZoom();
  dibujarZoomTeorico();
  if (!zoomTeorico.listo) { zoomTeorico.listo = true; configurarZoomTeorico(); }
}

/* Muestra el overlay (modal): guarda el foco previo y lo lleva a "Cerrar". */
function mostrarOverlayZoom() {
  const ov = $('zoom-teorico');
  if (!zoomTeorico.activo) zoomTeorico.focoPrevio = document.activeElement;
  ov.classList.remove('oculto');
  ov.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sin-scroll');
  zoomTeorico.activo = true;
  $('zoom-cerrar').focus();
}

function cerrarZoomTeorico() {
  const ov = $('zoom-teorico');
  if (!ov || !zoomTeorico.activo) return;
  ov.classList.add('oculto');
  ov.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sin-scroll');
  zoomTeorico.activo = false;
  zoomTeorico.arrastrando = false;
  const previo = zoomTeorico.focoPrevio;
  zoomTeorico.focoPrevio = null;
  if (previo && previo.isConnected) previo.focus({ preventScroll: true });
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
  // Escape cierra y Tab queda dentro del overlay mientras está abierto.
  document.addEventListener('keydown', (ev) => {
    if (!zoomTeorico.activo) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarZoomTeorico(); return; }
    if (ev.key !== 'Tab') return;
    const enfocables = [...ov.querySelectorAll('button:not(:disabled)')];
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    const actual = document.activeElement;
    if (!ov.contains(actual)) { ev.preventDefault(); primero.focus(); }
    else if (ev.shiftKey && actual === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && actual === ultimo) { ev.preventDefault(); primero.focus(); }
  });
  const cv = $('ch-mapa-zoom');
  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomTeorico.zoom = clamp(zoomTeorico.zoom * (ev.deltaY < 0 ? 1.1 : 0.9), 1, 8);
    dibujarZoomTeorico();
  }, { passive: false });
  // Pointer events: el arrastre funciona igual con mouse, lápiz o dedo.
  cv.addEventListener('pointerdown', (ev) => {
    zoomTeorico.arrastrando = true;
    zoomTeorico.lx = ev.clientX; zoomTeorico.ly = ev.clientY;
    cv.setPointerCapture(ev.pointerId);
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!zoomTeorico.arrastrando) return;
    zoomTeorico.panX -= ev.clientX - zoomTeorico.lx;
    zoomTeorico.panY -= ev.clientY - zoomTeorico.ly;
    zoomTeorico.lx = ev.clientX; zoomTeorico.ly = ev.clientY;
    dibujarZoomTeorico();
  });
  const soltar = () => { zoomTeorico.arrastrando = false; };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('lostpointercapture', soltar);
}
