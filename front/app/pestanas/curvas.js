'use strict';

/* Pestaña Curvas (RF-011/T119-121): arcos en el mapa, tiempos, tracción
   por curva y delta A/B. Métricas por curva vienen listas del backend. */

async function renderPestanaCurvas() {
  destroyCharts();
  const datos = await puente.pedirPestana('curvas');
  if (!datos || !datos.curvas.length) {
    state.pistasCurvas = [];
    vaciarCurvas();
    return;
  }
  state.pistasCurvas = datos.curvas;
  state.curvasDatos = datos;
  dibujarMapaCurvas(datos);
  dibujarTiemposCurvas(datos);
  dibujarTractionCurvas(datos);
  renderTablaCurvas(datos);
  renderDeltaCurvas(datos);
  actualizarPorIdx({ moverCursor: true });
}

function vaciarCurvas() {
  const c = prepCanvas('ch-mapa-curvas', 260);
  if (c) { c.ctx.fillStyle = '#8b97a8'; c.ctx.fillText('sin curvas detectadas', 12, 20); }
  const t = $('tabla-curvas');
  if (t) t.innerHTML = '<em>Sin curvas detectadas. Cargá el fast_lane.ai.</em>';
  const tr = $('traction-curvas');
  if (tr) tr.innerHTML = '';
  const dc = prepCanvas('ch-delta-curvas', 220);
  if (dc) { dc.ctx.fillStyle = '#8b97a8'; dc.ctx.fillText('Elegí dos vueltas distintas (A vs B).', 12, 20); }
  const td = $('tabla-curva-delta');
  if (td) td.innerHTML = '<em>Elegí dos vueltas distintas (A vs B).</em>';
}

/* Referencia para índices y trazas de la pestaña curvas (mapa incluido). */
function curvasTrazas(datos) {
  return datos.mapa.trazas;
}

function curvasRefTraza(datos) {
  return trazaReferencia(curvasTrazas(datos));
}

/* Mapa de la REF con cada arco coloreado PALETA y numerado. */
function dibujarMapaCurvas(datos) {
  const ref = curvasRefTraza(datos);
  if (!ref) return;
  const c = prepCanvas('ch-mapa-curvas', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const vista = construirVistaFija(cv, datos.mapa.bounds);
  dibujarGrillaFondo(ctx, w, h);
  dibujarTrazada(ctx, vista.tf, ref, 'rgba(148,163,184,0.28)', 2);
  dibujarArcosCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarNumeralesCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarMarcadoresRef(ctx, vista.tf, ref, { frenada: true, cambios: false });
}

/* Barras agrupadas por curva (una por vuelta) con tooltip. */
function dibujarTiemposCurvas(datos) {
  const c = prepCanvas('ch-tiempos-curvas', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const tab = datos.vueltas.map((v) => ({ v, valores: v.metricas.map((m) => m.t_curva) }));
  const todos = tab.flatMap((m) => m.valores).filter((v) => v != null && v > 0);
  if (!todos.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos de curva', 12, 20); return; }
  const maxS = Math.max(...todos);
  const nC = datos.curvas.length;
  const pad = 28, groupW = (w - pad * 2) / nC;
  const barW = groupW / (tab.length + 1);
  const rects = [];
  tab.forEach((m, li) => m.valores.forEach((v, ci) => {
    if (v == null || v <= 0) return;
    const x = pad + ci * groupW + li * barW + 1;
    const bh = (v / maxS) * (h - pad * 2 - 12);
    ctx.fillStyle = hexA(colorDeVuelta(m.v.id), 0.9);
    ctx.fillRect(x, h - pad - bh, Math.max(barW - 2, 1), bh);
    rects.push({ x, y: h - pad - bh, w: Math.max(barW - 2, 1), h: bh, v, vuelta: m.v.etiqueta, ci });
  }));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b97a8';
  ctx.font = (nC > 22 ? '9px' : '11px') + ' "Segoe UI"';
  for (let i = 0; i < nC; i++) ctx.fillText(datos.curvas[i].nombre, pad + i * groupW + groupW / 2, h - 15);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('tiempo por curva (s)', 4, 14);
  cv._rects = rects;
  cv.onmousemove = (ev) => moverTooltipRects(ev, cv, $('tt-curvas'), (r) => {
    const cx = state.curvasDatos.curvas[r.ci];
    return `${cx.nombre} (${cx.sentido}) · ${r.vuelta}: ${fmtTiempo(r.v)}`;
  });
  cv.onmouseleave = () => ocultarTooltip($('tt-curvas'));
}

/* Círculo de tracción por curva: g-g común, marcadores slip, click = zoom. */
function dibujarTractionCurvas(datos) {
  const cont = $('traction-curvas');
  if (!cont) return;
  const lapsDeDatos = vueltasBaseFront();
  const refT = curvasRefTraza(datos);
  if (!refT) return;
  const porCurva = datos.curvas.map((cx) => puntosDeCurva(lapsDeDatos, refT, cx));
  let maxG = 1.5;
  for (const pts of porCurva) {
    const esc = pts.flatMap((p) => [Math.abs(p.lat), Math.abs(p.lon)]).sort((a, b) => a - b);
    if (esc.length) maxG = Math.max(maxG, Math.ceil(esc[Math.floor(esc.length * 0.99)] * 2) / 2);
  }
  cont.innerHTML = '';
  datos.curvas.forEach((cx, k) => {
    const card = document.createElement('div');
    card.className = 'traction-curva';
    card.style.cursor = 'pointer';
    card.title = 'Click para ampliar';
    const titulo = document.createElement('div');
    titulo.className = 'traction-titulo';
    titulo.innerHTML = `<span>${cx.nombre}</span><span class="unidad">${cx.sentido.slice(0, 3)} · R${(cx.radio_min || 0).toFixed(0)} m</span>`;
    const cv = document.createElement('canvas');
    cv.className = 'traction-canvas';
    card.appendChild(titulo);
    card.appendChild(cv);
    cont.appendChild(card);
    pintarCirculoTraction(prepararCanvas(cv, 150), porCurva[k], maxG);
    card.addEventListener('click', () => abrirZoomTractionCurva(datos, k, porCurva[k], maxG));
  });
}

/* Todas las vueltas visibles con sus canales (state.datosVuelta). */
function vueltasBaseFront() {
  return (state.datosVuelta && state.datosVuelta.vueltas) || [];
}

function vueltaBetaPorId(id) {
  return vueltasBaseFront().find((v) => mismaId(v.id, id)) || null;
}

function indicesDeS(traza, sIni, sFin) {
  const i0 = sIni == null ? 0 : indiceDeS(traza, sIni);
  const i1 = sFin == null ? traza.s.length - 1 : indiceDeS(traza, sFin);
  return { i0: Math.max(i0, 0), i1: Math.min(i1, traza.s.length) };
}

/* Puntos g-g (con marcadores de slip) de una curva, sobre la grilla común. */
function puntosDeCurva(laps, refTraza, cx) {
  const { i0, i1 } = indicesDeS(refTraza, cx.s_ini, cx.s_fin);
  const pts = [];
  for (const l of laps) {
    const al = l.acc_long_g || [], at = l.acc_lat_g || [];
    const sf = l.slip_ratio_delantera_izquierda || [], sr = l.slip_ratio_delantera_derecha || [];
    const vel = l.velocidad_kmh || [];
    const color = colorDeVuelta(l.id);
    for (let i = i0; i <= i1; i++) {
      if (!Number.isFinite(al[i]) || !Number.isFinite(at[i])) continue;
      let spin = false, lock = false;
      if (Number.isFinite(vel[i]) && vel[i] > SLIP_VEL_MIN) {
        const s1 = Number.isFinite(sf[i]) ? clamp(sf[i], -1, 1) : 0;
        const s2 = Number.isFinite(sr[i]) ? clamp(sr[i], -1, 1) : 0;
        if (Math.max(s1, s2) > SLIP_SPIN) spin = true;
        if (Math.min(s1, s2) < SLIP_LOCK) lock = true;
      }
      pts.push({ lat: at[i] / G, lon: al[i] / G, color, spin, lock });
    }
  }
  return pts;
}

function pintarCirculoTraction(c, pts, maxG) {
  if (!c) return;
  const { ctx, w, h } = c;
  const size = Math.min(w, h);
  const cx = w / 2, cy = h / 2, R = size / 2 - 20;
  const px = (lat) => cx + (lat / maxG) * R;
  const py = (lon) => cy - (lon / maxG) * R;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  for (const r of [0.5, 1]) { ctx.beginPath(); ctx.arc(cx, cy, r * R, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px "Segoe UI"'; ctx.textAlign = 'center';
  ctx.fillText('acel.', cx, cy - R - 6);
  ctx.fillText('frena', cx, cy + R + 14);
  ctx.textAlign = 'right'; ctx.fillText('der.', cx + R, cy - 5);
  ctx.textAlign = 'left'; ctx.fillText('izq.', cx - R, cy - 5);
  ctx.textAlign = 'left';
  for (const p of pts) {
    const X = px(p.lat), Y = py(p.lon);
    ctx.fillStyle = hexA(p.color, 0.35);
    ctx.fillRect(X - 1, Y - 1, 2, 2);
    if (p.spin) marcaTriangulo(ctx, X, Y, 5, '#facc15');
    if (p.lock) marcaCruz(ctx, X, Y, 5, '#f87171');
  }
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  ctx.fillText(`±${maxG.toFixed(1)} g`, 8, 16);
}

/* Abre el overlay con la tracción de una curva en grande. */
function abrirZoomTractionCurva(datos, k, pts, maxG) {
  const cx = datos.curvas[k];
  const ov = $('zoom-teorico');
  if (!ov) return;
  zoomTeorico.modo = 'traccion';
  zoomTeorico.datos = { tipo: 'traccion', cx, pts, maxG, titulo: `Tracción · ${cx.nombre} (${cx.sentido}) · R ${(cx.radio_min || 0).toFixed(0)} m` };
  const titulo = $('zoom-titulo');
  if (titulo) titulo.textContent = zoomTeorico.datos.titulo;
  ov.classList.remove('oculto');
  ov.setAttribute('aria-hidden', 'false');
  zoomTeorico.activo = true;
  dibujarZoomTeorico();
  if (!zoomTeorico.listo) { zoomTeorico.listo = true; configurarZoomTeorico(); }
}

/* Bloques por curva: tarjeta de curva + fila de estadísticas por vuelta. */
function renderTablaCurvas(datos) {
  const cont = $('tabla-curvas');
  if (!cont) return;
  const nC = datos.curvas.length;
  const mejores = new Array(nC).fill(Infinity);
  for (const v of datos.vueltas) v.metricas.forEach((m, i) => {
    if (m.t_curva != null && m.t_curva > 0 && m.t_curva < mejores[i]) mejores[i] = m.t_curva;
  });
  const multi = datos.vueltas.length > 1;
  cont.innerHTML = datos.curvas.map((cx, i) => {
    const filas = datos.vueltas.map((v) => ({ v, m: v.metricas[i] }));
    return `<div class="curva-bloque">
      <div class="curva-cab">
        <span class="curva-nombre">${cx.nombre}</span>
        <span class="curva-dato">${cx.sentido === 'izquierda' ? 'izq' : 'der'}</span>
        <span class="curva-dato">${(cx.largo || 0).toFixed(0)} m</span>
        <span class="curva-dato">R ${(cx.radio_min || 0).toFixed(0)} m</span>
      </div>
      <div class="curva-filas">` +
      filas.map((f) => {
        const t = f.m ? f.m.t_curva : null;
        const esMejor = multi && t != null && t > 0 && Math.abs(t - mejores[i]) < 1e-6;
        const stat = (valor, etiqueta) =>
          `<span class="stat"><b class="mono">${valor}</b><label>${etiqueta}</label></span>`;
        return `<div class="curva-fila">
          <span class="curva-vuelta"><i style="background:${colorDeVuelta(f.v.id)}"></i>${f.v.etiqueta}</span>
          <span class="curva-stats">` +
            stat(f.m && f.m.v_min != null ? f.m.v_min.toFixed(0) : '–', 'v mín') +
            stat(f.m && f.m.v_apex != null ? f.m.v_apex.toFixed(0) : '–', 'v apex') +
            stat(t != null && t > 0 ? fmtTiempo(t) : '–', 'T curva' + (esMejor ? ' · mejor' : '')) +
            stat(f.m && f.m.d_fren != null ? f.m.d_fren.toFixed(0) : '–', 'freno') +
            stat(f.m && f.m.d_acel != null ? f.m.d_acel.toFixed(0) : '–', 'reacel') +
          `</span>
        </div>`;
      }).join('') +
      '</div></div>';
  }).join('');
}

/* ---------- Delta A/B por curva ---------- */

async function renderDeltaCurvas(datos) {
  const versus_a = $('vs-a-curvas');
  const versus_b = $('sel-lap-b-curvas');
  if (!versus_b) return;
  const A = vueltaBetaPorId(datos.delta ? datos.delta.a.id : curvasRefTraza(datos)?.id);
  const B = datos.delta ? vueltaBetaPorId(datos.delta.b.id) : null;
  if (versus_a) versus_a.textContent = A ? A.etiqueta : '–';
  selectorVueltas.poblarSelB(versus_b);
  const hay = A && B;
  dibujarBarrasDeltaCurvas(A, B, datos, hay);
  const cont = $('tabla-curva-delta');
  if (cont) cont.innerHTML = hay ? tablaDeltaCurvasHTML(datos.delta) : '<em class="vacio">Elegí dos vueltas distintas (A vs B).</em>';
}

function dibujarBarrasDeltaCurvas(A, B, datos, hay) {
  const c = prepCanvas('ch-delta-curvas', 220);
  if (!c) return;
  const { ctx, w, h } = c;
  ctx.font = '11px "Segoe UI"';
  if (!hay) { ctx.fillStyle = '#8b97a8'; ctx.fillText('Elegí dos vueltas distintas (A vs B).', 12, 20); return; }
  const vals = datos.delta.curvas.map((d) => d.d_t).filter((v) => v != null);
  if (!vals.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos de curva', 12, 20); return; }
  const maxAbs = Math.max(0.001, ...vals.map(Math.abs));
  const pad = 30, n = datos.delta.curvas.length, groupW = (w - pad * 2) / n, cy = h / 2 + 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
  ctx.textAlign = 'center';
  datos.delta.curvas.forEach((d, i) => {
    if (d.d_t == null) return;
    const x = pad + i * groupW;
    const bh = (d.d_t / maxAbs) * (h / 2 - pad);
    ctx.fillStyle = d.d_t >= 0 ? '#f87171' : '#4ade80';
    ctx.fillRect(x + 3, d.d_t >= 0 ? cy - bh : cy, Math.max(groupW - 6, 1), Math.abs(bh));
    ctx.fillStyle = '#8b97a8';
    ctx.fillText(d.nombre, x + groupW / 2, h - 8);
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97a8';
  ctx.fillText(`Δ tiempo por curva (s)  ·  ${datos.delta.a.etiqueta} − ${datos.delta.b.etiqueta}  (rojo = A pierde)`, 4, 14);
}

function claseDelta(v, mejor) {
  if (v == null || Math.abs(v) < 0.001 || !mejor) return '';
  const gana = mejor === 'menor' ? v < 0 : v > 0;
  return gana ? 'delta-gana' : 'delta-pierde';
}

function tablaDeltaCurvasHTML(delta) {
  const fmtD = (v, dec) => fmtDelta(v, '', dec);
  const filas = delta.curvas.map((d) => {
    const cx = state.curvasDatos.curvas[d.n - 1];
    return `<tr><td>${d.nombre}</td><td>${cx ? cx.sentido.slice(0, 3) : '–'}</td>` +
      `<td class="mono ${claseDelta(d.d_t, 'menor')}">${fmtD(d.d_t, 2)}</td>` +
      `<td class="mono ${claseDelta(d.d_v_min, 'mayor')}">${fmtD(d.d_v_min, 1)}</td>` +
      `<td class="mono ${claseDelta(d.d_v_apex, 'mayor')}">${fmtD(d.d_v_apex, 1)}</td>` +
      `<td class="mono ${claseDelta(d.d_fren, 'mayor')}">${fmtD(d.d_fren, 1)}</td>` +
      `<td class="mono ${claseDelta(d.d_acel, 'menor')}">${fmtD(d.d_acel, 1)}</td></tr>`;
  }).join('');
  return `<table class="tabla-delta">
    <thead><tr>
      <th>Curva</th><th>Sentido</th>
      <th title="Δ tiempo en la curva (s). Negativo = A más rápido">ΔT</th>
      <th title="Δ velocidad mínima (km/h). Positivo = A más rápido en el punto lento">Δv mín</th>
      <th title="Δ velocidad en el ápex (km/h). Positivo = A más rápido">Δv ápex</th>
      <th title="Δ distancia del punto de frenada (m). Positivo = A frena más tarde">Δ frenada</th>
      <th title="Δ distancia de reaceleración (m). Negativo = A vuelve antes a fondo">Δ reaceleración</th>
    </tr></thead>
    <tbody>${filas}</tbody></table>
    <p class="delta-leyenda">Verde = A mejor en esa métrica · rojo = A peor (todo relativo a B).</p>`;
}
