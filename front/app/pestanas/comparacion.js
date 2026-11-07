'use strict';

/* Pestaña Comparación A − B (RF-013). */

async function renderPestanaComparacion(version = state.version) {
  destroyCharts();
  state.pistasCurvas = [];
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
      { label: 'Δ t', stroke: '#22d3ee', width: 2, points: { show: false }, spanGaps: true },
    ]);
  lineChart($('chart-dvel'), 180, null, 'Δ velocidad (km/h)',
    [d.grilla, d.delta_velocidad_kmh],
    [
      serieX(),
      { label: 'Δ v', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
    ]);
  lineChart($('chart-dped'), 180, [-1.05, 1.05], 'Δ gas / freno',
    [d.grilla, d.delta_pedales.gas, d.delta_pedales.freno],
    [
      serieX(),
      { label: 'Δ gas', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
      { label: 'Δ freno', stroke: '#f87171', width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
    ]);
  actualizarPorIdx({ moverCursor: true });
}

function vaciarComparacion(msg) {
  destroyCharts();
  for (const id of ['chart-delta', 'chart-dvel', 'chart-dped']) {
    const el = $(id);
    if (el) el.innerHTML = `<p class="hint" style="margin:6px">${msg}</p>`;
  }
  const c = prepCanvas('ch-mini-delta', 120);
  if (c) c.ctx.fillStyle = '#8b97a8';
  if (c) { c.ctx.font = '13px "Segoe UI"'; c.ctx.fillText(msg.slice(0, 70), 10, 24); }
}

/* Delta por sector + delta final como texto coloreado. */
function dibujarMiniDeltaSectores(d) {
  const c = prepCanvas('ch-mini-delta', 120);
  if (!c) return;
  const { ctx, w, h } = c;
  ctx.font = '15px "Consolas", monospace';
  let y = 24;
  d.delta_sectores.forEach((v, i) => {
    if (v == null) return;
    const texto = `S${i + 1}  ${deltaATexto(v)}`;
    ctx.fillStyle = colorDelta(v);
    ctx.fillText(texto, 14, y + i * 22);
  });
  const fin = ultimoValor(d.delta_tiempo);
  if (fin != null) {
    ctx.font = 'bold 18px "Consolas", monospace';
    ctx.fillStyle = colorDelta(fin);
    const txt = deltaATexto(fin);
    ctx.textAlign = 'right';
    ctx.fillText(txt, w - 14, 28);
    ctx.textAlign = 'left';
  }
}

function deltaATexto(v) {
  const s = Math.abs(v) < 0.005 ? '±0.000' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(3);
  return s + ' s';
}

function colorDelta(v) {
  return v > 0.005 ? '#f87171' : v < -0.005 ? '#4ade80' : '#8b97a8';
}

function ultimoValor(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}
