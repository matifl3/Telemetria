'use strict';

/* Gráficos de Curvas (RF-011/T119-121): arcos en el mapa, tiempos, tracción por
   curva, métricas, delta A/B, fases, balance y slip. Fuente `curvas`; las
   métricas por curva vienen listas del backend. */

const SIN_CURVAS = 'Sin curvas detectadas. Cargá el fast_lane.ai.';
const SIN_AB_CURVAS = 'Elegí dos vueltas distintas (A vs B): B se elige en el panel lateral.';

/* Envoltorio: guarda el DTO (umbrales de slip y nombres de curva) y avisa si
   no hay curvas. */
function siHayCurvas(montar) {
  return (cuerpo, datos, aj, t) => {
    if (!datos || !datos.curvas || !datos.curvas.length) { mensajeTarjeta(cuerpo, SIN_CURVAS); return {}; }
    state.curvasDatos = datos;
    return montar(cuerpo, datos, aj, t);
  };
}

const CURVAS = { categoria: 'curvas', fuente: 'curvas', tamano: { w: 6, h: 6 } };

registrarGrafico({
  ...CURVAS, id: 'mapa-curvas', nombre: 'Mapa por curvas', unidad: 'vuelta REF · arcos coloreados',
  descripcion: 'Trazada de la REF con cada curva coloreada y numerada.',
  montar: siHayCurvas(graficoCanvas(dibujarMapaCurvas)),
});
registrarGrafico({
  ...CURVAS, id: 'tiempo-curva', nombre: 'Tiempo por curva', unidad: 'por vuelta',
  descripcion: 'Barras por curva y vuelta con el tiempo dentro de cada arco.',
  tamano: { w: 12, h: 5 },
  montar: siHayCurvas(graficoCanvas(dibujarTiemposCurvas, { tooltip: true })),
});
registrarGrafico({
  ...CURVAS, id: 'traccion-curva', nombre: 'Círculo de tracción por curva', unidad: 'acel/freno × lateral (g)',
  descripcion: 'Un círculo g-g por curva con bloqueos y patinamientos; clic para ampliar.',
  tamano: { w: 12, h: 8 },
  montar: siHayCurvas(montarTractionCurvas),
});
registrarGrafico({
  ...CURVAS, id: 'metricas-curva', nombre: 'Métricas por curva', unidad: 'una fila por vuelta',
  descripcion: 'Velocidad mínima y de ápex, tiempo, frenada y reaceleración por curva.',
  tamano: { w: 12, h: 8 },
  montar: siHayCurvas(graficoHTML(renderTablaCurvas)),
});
registrarGrafico({
  ...CURVAS, id: 'delta-curva', nombre: 'Delta por curva', unidad: 'A − B · ventana = arco',
  descripcion: 'Diferencia A − B de tiempo y métricas en cada curva.',
  necesitaB: true,
  tamano: { w: 12, h: 8 },
  montar: siHayCurvas(montarDeltaCurvas),
});
registrarGrafico({
  ...CURVAS, id: 'fases-curva', nombre: 'Fases de curva', unidad: 'frenada · trail braking · coasting · gas a fondo · A vs B',
  descripcion: 'Frenada, entrada, vértice y salida de A frente a B.',
  necesitaB: true,
  tamano: { w: 12, h: 7 },
  montar: siHayCurvas(graficoHTML(renderFasesCurvas)),
});
registrarGrafico({
  ...CURVAS, id: 'balance-slip', nombre: 'Balance y slip', unidad: 'sub/sobreviraje por fase · bloqueos y patinamiento',
  descripcion: 'Diagnóstico de sub/sobreviraje por fase y eventos de slip por curva.',
  tamano: { w: 12, h: 7 },
  montar: siHayCurvas(graficoHTML(renderBalanceSlip)),
});

/* Referencia para índices y trazas de las curvas (mapa incluido). */
function curvasRefTraza(datos) {
  return trazaReferencia(datos.mapa.trazas);
}

/* Mapa de la REF con cada arco coloreado PALETA y numerado. */
function dibujarMapaCurvas(cv, datos) {
  const ref = curvasRefTraza(datos);
  if (!ref) return;
  const c = prepararCanvas(cv, 260);
  if (!c) return;
  const { ctx, w, h } = c;
  const vista = construirVistaFija(cv, datos.mapa.bounds);
  dibujarGrillaFondo(ctx, w, h);
  dibujarTrazada(ctx, vista.tf, ref, 'rgba(148,163,184,0.28)', 2);
  // La etiqueta C1..Cn ya la pone dibujarArcosCurvas (paridad v1): no repetirla.
  dibujarArcosCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarMarcadoresRef(ctx, vista.tf, ref, { frenada: true, cambios: false });
}

/* Barras agrupadas por curva (una por vuelta) con tooltip. */
function dibujarTiemposCurvas(cv, datos, { tooltip }) {
  const c = prepararCanvas(cv, 260);
  if (!c) return;
  const { ctx, w, h } = c;
  const tab = datos.vueltas.map((v) => ({ v, valores: v.metricas.map((m) => m.t_curva) }));
  const todos = tab.flatMap((m) => m.valores).filter((v) => v != null && v > 0);
  if (!todos.length) { ctx.fillStyle = COLOR.apagado; ctx.fillText('sin tiempos de curva', 12, 20); return; }
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
  ctx.fillStyle = COLOR.apagado;
  ctx.font = (nC > 22 ? '9px' : '11px') + ' "Segoe UI"';
  for (let i = 0; i < nC; i++) ctx.fillText(datos.curvas[i].nombre, pad + i * groupW + groupW / 2, h - 15);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
  ctx.fillText('tiempo por curva (s)', 4, 14);
  cv._rects = rects;
  cv.onmousemove = (ev) => moverTooltipRects(ev, cv, tooltip, (r) => {
    const cx = datos.curvas[r.ci];
    return `${cx.nombre} (${cx.sentido}) · ${r.vuelta}: ${fmtTiempo(r.v)}`;
  });
  cv.onmouseleave = () => ocultarTooltip(tooltip);
}

/* Círculo de tracción por curva: g-g común, marcadores slip, clic = zoom. */
function montarTractionCurvas(cuerpo, datos) {
  const grilla = state.datosVuelta && state.datosVuelta.grilla;
  if (!grilla || !grilla.length) { mensajeTarjeta(cuerpo, 'Sin vueltas visibles.'); return {}; }
  const laps = vueltasBaseFront();
  const porCurva = datos.curvas.map((cx) => puntosDeCurva(laps, grilla, cx));
  let maxG = 1.5;
  for (const pts of porCurva) {
    const esc = pts.flatMap((p) => [Math.abs(p.lat), Math.abs(p.lon)]).sort((a, b) => a - b);
    if (esc.length) maxG = Math.max(maxG, Math.ceil(esc[Math.floor(esc.length * 0.99)] * 2) / 2);
  }
  const cont = document.createElement('div');
  cont.className = 'traction-grid';
  cuerpo.appendChild(cont);
  const lienzos = datos.curvas.map((cx, k) => {
    const card = document.createElement('div');
    card.className = 'traction-curva';
    // Tarjeta accionable también con teclado (Tab + Enter/Espacio).
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `Ampliar el círculo de tracción de ${cx.nombre}`);
    card.title = 'Clic para ampliar';
    const titulo = document.createElement('div');
    titulo.className = 'traction-titulo';
    titulo.innerHTML = `<span>${cx.nombre}</span><span class="unidad">${cx.sentido.slice(0, 3)} · R${(cx.radio_min || 0).toFixed(0)} m</span>`;
    const cv = document.createElement('canvas');
    cv.className = 'traction-canvas';
    card.append(titulo, cv);
    cont.appendChild(card);
    const abrir = () => abrirZoomTractionCurva(datos, k, porCurva[k], maxG);
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
    });
    return cv;
  });
  const redibujar = () => lienzos.forEach((cv, k) => { if (cv.clientWidth) pintarCirculoTraction(prepararCanvas(cv, 150), porCurva[k], maxG); });
  redibujar();
  return { redimensionar: redibujar };
}

/* Todas las vueltas visibles con sus canales (state.datosVuelta). */
function vueltasBaseFront() {
  return (state.datosVuelta && state.datosVuelta.vueltas) || [];
}

function vueltaBetaPorId(id) {
  return vueltasBaseFront().find((v) => mismaId(v.id, id)) || null;
}

function indicesDeS(grilla, sIni, sFin) {
  if (!grilla.length) return { i0: 0, i1: -1 };
  const i0 = sIni == null || !Number.isFinite(sIni) ? 0 : indiceMasCercanoEnGrilla(grilla, sIni);
  const i1 = sFin == null || !Number.isFinite(sFin)
    ? grilla.length - 1
    : indiceMasCercanoEnGrilla(grilla, sFin);
  return { i0: Math.max(i0, 0), i1: Math.min(i1, grilla.length - 1) };
}

function indiceMasCercanoEnGrilla(grilla, arco) {
  let inicio = 0;
  let fin = grilla.length;
  while (inicio < fin) {
    const medio = Math.floor((inicio + fin) / 2);
    if (grilla[medio] < arco) inicio = medio + 1;
    else fin = medio;
  }
  if (inicio === 0) return 0;
  if (inicio === grilla.length) return grilla.length - 1;
  return arco - grilla[inicio - 1] <= grilla[inicio] - arco ? inicio - 1 : inicio;
}

/* Puntos g-g (con marcadores de slip) de una curva, sobre la grilla común. */
function puntosDeCurva(laps, grilla, cx) {
  const { i0, i1 } = indicesDeS(grilla, cx.s_ini, cx.s_fin);
  const pts = [];
  for (const l of laps) {
    const al = l.acc_long_g || [], at = l.acc_lat_g || [];
    // Umbrales de core (ING18): bloqueo en cualquier rueda, patinamiento en cualquiera.
    const umbral = umbralesSlip();
    const ruedas = [l.slip_ratio_delantera_izquierda, l.slip_ratio_delantera_derecha,
      l.slip_ratio_trasera_izquierda, l.slip_ratio_trasera_derecha].map((r) => r || []);
    const vel = l.velocidad_kmh || [];
    const color = colorDeVuelta(l.id);
    for (let i = i0; i <= i1; i++) {
      if (!Number.isFinite(al[i]) || !Number.isFinite(at[i])) continue;
      let spin = false, lock = false;
      if (Number.isFinite(vel[i]) && vel[i] > umbral.velocidad_min_kmh) {
        const valores = ruedas.map((r) => (Number.isFinite(r[i]) ? clamp(r[i], -1, 1) : 0));
        if (Math.max(...valores) > umbral.patinamiento) spin = true;
        if (Math.min(...valores) < umbral.bloqueo) lock = true;
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
    if (p.spin) marcaTriangulo(ctx, X, Y, 5, COLOR.amarillo);
    if (p.lock) marcaCruz(ctx, X, Y, 5, COLOR.freno);
  }
  ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Segoe UI"';
  ctx.fillText(`±${maxG.toFixed(1)} g`, 8, 16);
}

/* Abre el overlay con la tracción de una curva en grande. */
function abrirZoomTractionCurva(datos, k, pts, maxG) {
  const cx = datos.curvas[k];
  if (!$('zoom-teorico')) return;
  zoomTeorico.modo = 'traccion';
  zoomTeorico.datos = { tipo: 'traccion', cx, pts, maxG, titulo: `Tracción · ${cx.nombre} (${cx.sentido}) · R ${(cx.radio_min || 0).toFixed(0)} m` };
  const titulo = $('zoom-titulo');
  if (titulo) titulo.textContent = zoomTeorico.datos.titulo;
  mostrarOverlayZoom();
  dibujarZoomTeorico();
  if (!zoomTeorico.listo) { zoomTeorico.listo = true; configurarZoomTeorico(); }
}

/* Bloques por curva: tarjeta de curva + fila de estadísticas por vuelta. */
function renderTablaCurvas(cont, datos) {
  cont.classList.add('curvas-grid');
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

/* Barras de Δ tiempo por curva + tabla de métricas A − B. */
function montarDeltaCurvas(cuerpo, datos) {
  const A = datos.delta ? vueltaBetaPorId(datos.delta.a.id) : null;
  const B = datos.delta ? vueltaBetaPorId(datos.delta.b.id) : null;
  if (!A || !B) { mensajeTarjeta(cuerpo, SIN_AB_CURVAS); return {}; }
  const cv = document.createElement('canvas');
  cv.className = 'lienzo-fijo';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Delta de tiempo por curva');
  const tabla = document.createElement('div');
  tabla.className = 'tabla-delta-wrap';
  tabla.innerHTML = tablaDeltaCurvasHTML(datos);
  cuerpo.append(cv, tabla);
  const redibujar = () => { if (cv.clientWidth) dibujarBarrasDeltaCurvas(cv, datos); };
  redibujar();
  return { redimensionar: redibujar };
}

function dibujarBarrasDeltaCurvas(cv, datos) {
  const c = prepararCanvas(cv, 220);
  if (!c) return;
  const { ctx, w, h } = c;
  ctx.font = '11px "Segoe UI"';
  const vals = datos.delta.curvas.map((d) => d.d_t).filter((v) => v != null);
  if (!vals.length) { ctx.fillStyle = COLOR.apagado; ctx.fillText('sin tiempos de curva', 12, 20); return; }
  const maxAbs = Math.max(0.001, ...vals.map(Math.abs));
  const pad = 30, n = datos.delta.curvas.length, groupW = (w - pad * 2) / n, cy = h / 2 + 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
  ctx.textAlign = 'center';
  datos.delta.curvas.forEach((d, i) => {
    if (d.d_t == null) return;
    const x = pad + i * groupW;
    const bh = (d.d_t / maxAbs) * (h / 2 - pad);
    ctx.fillStyle = d.d_t >= 0 ? COLOR.freno : COLOR.gas;
    ctx.fillRect(x + 3, d.d_t >= 0 ? cy - bh : cy, Math.max(groupW - 6, 1), Math.abs(bh));
    ctx.fillStyle = COLOR.apagado;
    ctx.fillText(d.nombre, x + groupW / 2, h - 8);
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.apagado;
  ctx.fillText(`Δ tiempo por curva (s)  ·  ${datos.delta.a.etiqueta} − ${datos.delta.b.etiqueta}  (rojo = A pierde)`, 4, 14);
}

function tablaDeltaCurvasHTML(datos) {
  const delta = datos.delta;
  const fmtD = (v, dec) => fmtDelta(v, '', dec);
  const filas = delta.curvas.map((d) => {
    const cx = datos.curvas[d.n - 1];
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

/* ---------- Análisis de ingeniero: fases, balance y slip ---------- */

function umbralesSlip() {
  const u = state.curvasDatos && state.curvasDatos.umbrales_slip;
  return u || { bloqueo: -0.3, patinamiento: 0.15, velocidad_min_kmh: 30 };
}

function analisisPorId(datos, id) {
  return (datos.analisis || []).find((a) => mismaId(a.id, id)) || null;
}

const metros = (v) => (v == null ? '–' : Math.round(v) + ' m');
const redondeo = (v) => Number(Number(v).toFixed(2));
const porciento = (v) => (v == null ? '–' : Math.round(v * 100) + ' %');

/* Fases de cada curva para A y B, con su delta (ING43). */
function renderFasesCurvas(cont, datos) {
  cont.classList.add('tabla-delta-wrap');
  if (!datos.delta) { cont.innerHTML = `<em class="vacio">${SIN_AB_CURVAS}</em>`; return; }
  const A = analisisPorId(datos, datos.delta.a.id);
  const B = analisisPorId(datos, datos.delta.b.id);
  if (!A || !B) { cont.innerHTML = '<em class="vacio">A y B tienen que estar visibles.</em>'; return; }
  const aviso = datos.delta.mismo_auto ? '' :
    '<p class="aviso-autos">A y B son autos distintos: freno, gas y volante no son del todo comparables.</p>';
  const celdaPar = (a, b, fmt) => `<td class="mono">${fmt(a)} <span class="unidad">/ ${fmt(b)}</span></td>`;
  const filas = datos.delta.fases.map((d) => {
    const fa = A.fases.find((f) => f.n === d.n);
    const fb = B.fases.find((f) => f.n === d.n);
    if (!fa || !fb) return '';
    const frenadaA = fa.con_frenada ? metros(fa.s_inicio_frenada) : 'sin frenar';
    const tFases = [d.d_t_frenada, d.d_t_entrada, d.d_t_vertice, d.d_t_salida]
      .map((v) => `<span class="${claseDelta(v, 'menor')}">${fmtDelta(v, '', 2)}</span>`).join(' / ');
    return `<tr>
      <td>${d.nombre}</td>
      <td class="mono">${frenadaA}</td>
      <td class="mono ${claseDelta(d.d_inicio_frenada_m, 'mayor')}">${fmtDelta(d.d_inicio_frenada_m, 'm', 0)}</td>
      ${celdaPar(fa.freno_max, fb.freno_max, porciento)}
      ${celdaPar(fa.trail_m, fb.trail_m, metros)}
      ${celdaPar(fa.coasting_m, fb.coasting_m, metros)}
      ${celdaPar(fa.vertice_a_gas_m, fb.vertice_a_gas_m, metros)}
      <td class="mono ${claseDelta(d.d_v_min, 'mayor')}">${fmtDelta(d.d_v_min, '', 1)}</td>
      <td class="mono">${tFases}</td>
    </tr>`;
  }).join('');
  cont.innerHTML = aviso + `<table class="tabla-delta">
    <thead><tr>
      <th>Curva</th>
      <th title="Dónde empieza a frenar A (m de pista)">Frenada A</th>
      <th title="Positivo = A frena más tarde que B">Δ frenada</th>
      <th title="Freno máximo A / B">Freno máx</th>
      <th title="Metros frenando con el volante girado, entre turn-in y vértice. A / B">Trail</th>
      <th title="Metros sin gas ni freno entre la frenada y el gas a fondo. A / B">Coasting</th>
      <th title="Metros desde el vértice hasta gas a fondo (98 %). A / B">Vértice→gas</th>
      <th title="Δ velocidad mínima (km/h). Positivo = A más rápido">Δv mín</th>
      <th title="Δ tiempo por fase: frenada / entrada / vértice / salida (s). Negativo = A más rápido">Δt fases</th>
    </tr></thead>
    <tbody>${filas}</tbody></table>
    <p class="delta-leyenda">Cada valor se muestra como A / B. La frenada se busca hasta 250 m antes de la curva y el gas a fondo hasta 300 m después.</p>`;
}

/* Balance sub/sobreviraje y eventos de slip por curva, para A y B (ING44, ING45). */
function renderBalanceSlip(cont, datos) {
  cont.classList.add('tabla-delta-wrap');
  const ids = datos.delta ? [datos.delta.a.id, datos.delta.b.id] : (datos.analisis || []).slice(0, 1).map((a) => a.id);
  const vueltas = ids.map((id) => analisisPorId(datos, id)).filter(Boolean);
  if (!vueltas.length) { cont.innerHTML = '<em class="vacio">Sin vueltas visibles.</em>'; return; }
  const chip = (diag) => diag ? `<span class="diag diag-${diag}">${diag}</span>` : '<span class="diag">–</span>';
  const slipTexto = (v, n) => {
    const r = v.resumen_slip.find((x) => x.n === n);
    if (!r) return '–';
    const partes = [];
    if (r.bloqueos) partes.push(`${r.bloqueos} bloq.`);
    if (r.patinamientos) partes.push(`${r.patinamientos} pat.`);
    return partes.join(' · ') + (r.rueda_principal ? ` (${r.rueda_principal})` : '');
  };
  const cabeceras = vueltas.map((v, k) => `<th colspan="3">${k === 0 && datos.delta ? 'A' : 'B'} · ${v.etiqueta}</th><th>Slip</th>`).join('');
  const filas = datos.curvas.map((cx) => {
    const celdas = vueltas.map((v) => {
      const b = v.balance.find((x) => x.n === cx.n);
      return b
        ? `<td>${chip(b.diagnostico_entrada)}</td><td>${chip(b.diagnostico_vertice)}</td><td>${chip(b.diagnostico_salida)}</td><td class="mono">${slipTexto(v, cx.n)}</td>`
        : '<td colspan="3">–</td><td>–</td>';
    }).join('');
    return `<tr><td>${cx.nombre}</td>${celdas}</tr>`;
  }).join('');
  const sinCalibrar = vueltas.some((v) => !v.calibracion_neutra)
    ? ' En alguna vuelta faltaron tramos lentos para calibrar el neutro: el balance es relativo al promedio de esa vuelta.'
    : '';
  cont.innerHTML = `<table class="tabla-delta">
    <thead>
      <tr><th></th>${cabeceras}</tr>
      <tr><th>Curva</th>${vueltas.map(() => '<th>Entrada</th><th>Vértice</th><th>Salida</th><th></th>').join('')}</tr>
    </thead>
    <tbody>${filas}</tbody></table>
    <p class="delta-leyenda">El balance compara el volante con la curvatura real de la trayectoria, calibrado en los tramos lentos de cada vuelta. Slip: bloqueo con slip_ratio &lt; ${redondeo(umbralesSlip().bloqueo)}, patinamiento con &gt; ${redondeo(umbralesSlip().patinamiento)}, por encima de ${redondeo(umbralesSlip().velocidad_min_kmh)} km/h. Signos a confirmar con un replay real.${sinCalibrar}</p>`;
}
