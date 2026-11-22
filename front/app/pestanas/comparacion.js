'use strict';

/* Pestaña Comparación A − B (RF-013). */

async function renderPestanaComparacion(version = state.version) {
  destroyCharts();
  selectorVueltas.poblarSelB();
  const d = await puente.pedirPestana('comparacion');
  if (version !== state.version || state.tab !== 'comparacion') return;
  if (!d || !d.a || !d.b || !d.grilla.length) {
    vaciarComparacion('Sin vuelta B seleccionada: elegila en el menú "vs B".');
    return;
  }
  const vs_a = $('vs-a');
  if (vs_a) vs_a.textContent = d.a.etiqueta;
  dibujarMiniDeltaSectores(d);
  lineChart($('chart-delta'), 220, null, 'Δ t (s)',
    [d.grilla, d.delta_tiempo],
    [
      serieX(),
      { label: 'Δ t', stroke: COLOR.acento, width: 2, points: { show: false }, spanGaps: true },
    ]);
  lineChart($('chart-dvel'), 180, null, 'Δ velocidad (km/h)',
    [d.grilla, d.delta_velocidad_kmh],
    [
      serieX(),
      { label: 'Δ v', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
    ]);
  lineChart($('chart-dped'), 180, [-1.05, 1.05], 'Δ gas / freno',
    [d.grilla, d.delta_pedales.gas, d.delta_pedales.freno],
    [
      serieX(),
      { label: 'Δ gas', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
      { label: 'Δ freno', stroke: COLOR.freno, width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
    ]);
  dibujarPendienteDelta(d);
  renderRanking(d);
  actualizarPorIdx({ moverCursor: true });
}

/* Pendiente del delta con las zonas de pérdida del ranking sombreadas (ING41). */
function dibujarPendienteDelta(d) {
  const cont = $('chart-pendiente');
  if (!cont) return;
  const pend = d.pendiente_delta || [];
  if (!pend.length) { cont.innerHTML = '<p class="hint" style="margin:6px">Sin datos de pendiente.</p>'; return; }
  const zonas = (d.ranking && d.ranking.perdidas) || [];
  const enZona = (s) => zonas.some((z) => (z.s_ini <= z.s_fin ? s >= z.s_ini && s <= z.s_fin : s >= z.s_ini || s <= z.s_fin));
  const sombreado = d.grilla.map((s, i) => (enZona(s) ? pend[i] : null));
  lineChart(cont, 160, null, 's / 100 m',
    [d.grilla, pend, sombreado],
    [
      serieX(),
      { label: 'pendiente', stroke: COLOR.acento, width: 1.5, points: { show: false }, spanGaps: false },
      { label: 'zona del ranking', stroke: COLOR.freno, width: 2, fill: 'rgba(248,113,113,0.22)', points: { show: false }, spanGaps: false },
    ]);
}

/* Tabla de zonas de pérdida y ganancia con su causa probable (ING42). */
function renderRanking(d) {
  const cont = $('ranking-perdidas');
  if (!cont) return;
  const r = d.ranking;
  if (!r) { cont.innerHTML = '<em class="vacio">Elegí una vuelta B para ver dónde se pierde tiempo.</em>'; return; }
  const aviso = d.mismo_auto === false
    ? '<p class="aviso-autos">A y B son autos distintos: las diferencias de pedal, volante y velocidad punta son orientativas.</p>'
    : '';
  const fila = (z, i, clase) => `<tr tabindex="0" data-s="${z.s_pendiente_max ?? z.s_ini ?? 0}" aria-label="Ir a ${z.nombre}">
      <td class="pos">${i + 1}</td>
      <td>${z.nombre}</td>
      <td class="mono ${clase}">${fmtDelta(z.perdida_s, 's', 3)}</td>
      <td class="mono">${z.porcentaje != null ? z.porcentaje.toFixed(0) + ' %' : '–'}</td>
      <td class="mono">${z.s_ini != null ? Math.round(z.s_ini) : '–'}–${z.s_fin != null ? Math.round(z.s_fin) : '–'} m</td>
      <td class="causas">${z.causas.length ? z.causas.join(' · ') : '–'}</td>
    </tr>`;
  const perdidas = r.perdidas.map((z, i) => fila(z, i, 'delta-pierde')).join('');
  const ganancias = r.ganancias.map((z, i) => fila(z, i, 'delta-gana')).join('');
  const total = r.delta_total_s != null ? fmtDelta(r.delta_total_s, 's', 3) : '–';
  cont.innerHTML = aviso + `<table class="tabla-delta tabla-ranking">
    <thead><tr><th>#</th><th>Zona</th><th title="Tiempo que pierde A en la zona">Pérdida</th>
      <th title="Parte de la suma de todas las pérdidas">% pérdidas</th><th>Tramo</th><th>Causa probable</th></tr></thead>
    <tbody>
      ${perdidas || '<tr><td colspan="6"><em>A no pierde tiempo en ninguna zona.</em></td></tr>'}
      ${ganancias ? '<tr class="sub-titulo"><td colspan="6">Donde A gana</td></tr>' + ganancias : ''}
    </tbody></table>
    <p class="delta-leyenda">Delta de la vuelta: ${total}. La suma de todas las zonas da ese delta. Las causas salen de reglas sobre frenada, pedales, balance y slip; son una pista, no una certeza.</p>`;
  cont.querySelectorAll('tbody tr[data-s]').forEach((tr) => {
    const ir = () => irA(Number(tr.dataset.s));
    tr.addEventListener('click', ir);
    tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); } });
  });
}

function vaciarComparacion(msg) {
  destroyCharts();
  for (const id of ['chart-delta', 'chart-dvel', 'chart-dped', 'chart-pendiente', 'ranking-perdidas']) {
    const el = $(id);
    if (el) el.innerHTML = `<p class="hint" style="margin:6px">${msg}</p>`;
  }
  const c = prepCanvas('ch-mini-delta', 120);
  if (c) c.ctx.fillStyle = COLOR.apagado;
  if (c) { c.ctx.font = '13px "Segoe UI"'; c.ctx.fillText(msg.slice(0, 70), 10, 24); }
}

/* Delta por sector como barras (paridad v1: rojo arriba = A pierde) + delta final. */
function dibujarMiniDeltaSectores(d) {
  const c = prepCanvas('ch-mini-delta', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const difs = d.delta_sectores;
  const maxAbs = Math.max(...difs.filter((v) => v != null).map((v) => Math.abs(v)), 0.001);
  const pad = 28;
  const anchoGrupo = (w - pad * 2) / Math.max(difs.length, 1);
  const cy = h / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
  difs.forEach((v, i) => {
    if (v == null) return;
    const bh = (v / maxAbs) * (h / 2 - pad);
    ctx.fillStyle = v >= 0 ? COLOR.freno : COLOR.gas;
    ctx.fillRect(pad + i * anchoGrupo + 3, v >= 0 ? cy - bh : cy, anchoGrupo - 6, Math.abs(bh));
    ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
    ctx.fillText('S' + (i + 1), pad + i * anchoGrupo + 3, h - 8);
  });
  ctx.fillStyle = COLOR.apagado; ctx.font = '11px "Segoe UI"';
  ctx.fillText(`${d.a.etiqueta} − ${d.b.etiqueta}  (rojo = A pierde)`, 4, 14);
  const fin = ultimoValor(d.delta_tiempo);
  if (fin != null) {
    // En la franja superior, para no pisar las barras (empiezan en y = pad).
    ctx.font = 'bold 15px "Consolas", monospace';
    ctx.fillStyle = colorDelta(fin);
    const txt = deltaATexto(fin);
    ctx.textAlign = 'right';
    ctx.fillText(txt, w - 14, 18);
    ctx.textAlign = 'left';
  }
}

function deltaATexto(v) {
  const s = Math.abs(v) < 0.005 ? '±0.000' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(3);
  return s + ' s';
}

function colorDelta(v) {
  return v > 0.005 ? COLOR.freno : v < -0.005 ? COLOR.gas : COLOR.apagado;
}

function ultimoValor(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}
