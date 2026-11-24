'use strict';

/* Gráficos de Comparación A − B (RF-013): A es la REF y B la vuelta elegida en
   el detalle del reproductor. Fuente `comparacion`. */

const SIN_B = 'Sin vuelta B: elegila en «Sesión» (expandí el reproductor con ⌄).';
const hayComparacion = (d) => d && d.a && d.b && d.grilla && d.grilla.length > 0;

const COMPARACION = { categoria: 'comparacion', fuente: 'comparacion', necesitaB: true, tamano: { w: 6, h: 6 } };

/* Un gráfico de líneas A − B sobre la grilla común. */
function plotComparacion(armar) {
  return (d) => (hayComparacion(d) ? { plots: [armar(d)] } : { vacio: SIN_B });
}

registrarGrafico({
  ...COMPARACION, id: 'delta-tiempo', nombre: 'Delta A − B', unidad: 's (positivo = A más lento)',
  descripcion: 'Tiempo que A gana o pierde frente a B a lo largo de la vuelta.',
  uplot: plotComparacion((d) => ({
    data: [d.grilla, d.delta_tiempo],
    series: [serieX(), { label: 'Δ t', stroke: COLOR.acento, width: 2, points: { show: false }, spanGaps: true }],
    yLabel: 'Δ t (s)',
  })),
});
registrarGrafico({
  ...COMPARACION, id: 'pendiente-delta', nombre: 'Pendiente del delta', unidad: 's cada 100 m · sombreado = zonas del ranking',
  descripcion: 'Dónde se gana o pierde tiempo más rápido; sombreadas, las zonas del ranking.',
  uplot: (d) => {
    if (!hayComparacion(d)) return { vacio: SIN_B };
    const pend = d.pendiente_delta || [];
    if (!pend.length) return { vacio: 'Sin datos de pendiente.' };
    const zonas = (d.ranking && d.ranking.perdidas) || [];
    const enZona = (s) => zonas.some((z) => (z.s_ini <= z.s_fin ? s >= z.s_ini && s <= z.s_fin : s >= z.s_ini || s <= z.s_fin));
    const sombreado = d.grilla.map((s, i) => (enZona(s) ? pend[i] : null));
    return {
      plots: [{
        data: [d.grilla, pend, sombreado],
        series: [
          serieX(),
          { label: 'pendiente', stroke: COLOR.acento, width: 1.5, points: { show: false }, spanGaps: false },
          { label: 'zona del ranking', stroke: COLOR.freno, width: 2, fill: 'rgba(248,113,113,0.22)', points: { show: false }, spanGaps: false },
        ],
        yLabel: 's / 100 m',
      }],
    };
  },
});
registrarGrafico({
  ...COMPARACION, id: 'ranking-perdidas', nombre: 'Dónde pierde tiempo A', unidad: 'frente a B · tocá una fila para ir a la zona',
  descripcion: 'Zonas de pérdida y ganancia con su causa probable.',
  tamano: { w: 12, h: 7 },
  montar: graficoHTML(renderRanking),
});
registrarGrafico({
  ...COMPARACION, id: 'diferencia-velocidad', nombre: 'Diferencia de velocidad', unidad: 'km/h',
  descripcion: 'Velocidad de A menos la de B.',
  uplot: plotComparacion((d) => ({
    data: [d.grilla, d.delta_velocidad_kmh],
    series: [serieX(), { label: 'Δ v', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true }],
    yLabel: 'Δ velocidad (km/h)',
  })),
});
registrarGrafico({
  ...COMPARACION, id: 'diferencia-pedales', nombre: 'Diferencia pedales', unidad: 'Δ 0–1',
  descripcion: 'Gas y freno de A menos los de B.',
  uplot: plotComparacion((d) => ({
    data: [d.grilla, d.delta_pedales.gas, d.delta_pedales.freno],
    series: [
      serieX(),
      { label: 'Δ gas', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
      { label: 'Δ freno', stroke: COLOR.freno, width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
    ],
    yRango: [-1.05, 1.05],
    yLabel: 'Δ gas / freno',
  })),
});
registrarGrafico({
  ...COMPARACION, id: 'delta-sector', nombre: 'Delta por sector', unidad: 'rojo = A pierde · verde = A gana',
  descripcion: 'Diferencia A − B en cada uno de los 3 sectores y el delta final.',
  montar: (cuerpo, d, aj, t) => {
    if (!hayComparacion(d)) { mensajeTarjeta(cuerpo, SIN_B); return {}; }
    return graficoCanvas(dibujarMiniDeltaSectores)(cuerpo, d, aj, t);
  },
});

/* Tabla de zonas de pérdida y ganancia con su causa probable (ING42). */
function renderRanking(cont, d) {
  cont.classList.add('tabla-delta-wrap');
  const r = hayComparacion(d) && d.ranking;
  if (!r) { cont.innerHTML = `<em class="vacio">${SIN_B}</em>`; return; }
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

/* Delta por sector como barras (paridad v1: rojo arriba = A pierde) + delta final. */
function dibujarMiniDeltaSectores(cv, d) {
  const c = prepararCanvas(cv, 240);
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
    ctx.textAlign = 'right';
    ctx.fillText(deltaATexto(fin), w - 14, 18);
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
