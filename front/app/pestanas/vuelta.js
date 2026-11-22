'use strict';

/* Pestaña Telemetría (id interno "vuelta", RF-011): regla de curvas, 7 gráficos
   sincronizados y pedales por vuelta. */

function renderPestanaVuelta(datos) {
  destroyCharts();
  if (!datos || !datos.grilla.length) return;
  const grilla = datos.grilla;
  const vueltas = datos.vueltas;

  const velocidadSeries = vueltas.map((v) => ({
    label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true,
  }));
  lineChart($('chart-speed'), 250, null, 'km/h',
    [grilla, ...vueltas.map((v) => v.velocidad_kmh)],
    [serieX(), ...velocidadSeries]);

  lineChart($('chart-rpm'), 170, null, 'rpm',
    [grilla, ...vueltas.map((v) => v.rpm)],
    [serieX(), ...vueltas.map((v) => ({ label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true }))]);

  lineChart($('chart-gear'), 140, null, 'marcha',
    [grilla, ...vueltas.map((v) => v.marcha)],
    [serieX(), ...vueltas.map((v) => ({
      label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, spanGaps: true,
      points: { show: false }, paths: uPlot.paths.stepped({ align: 1 }),
    }))]);

  lineChart($('chart-steer'), 150, null, 'volante (rad)',
    [grilla, ...vueltas.map((v) => v.volante)],
    [serieX(), ...vueltas.map((v) => ({ label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true }))]);

  lineChart($('chart-acc'), 150, [0, null], 'g',
    [grilla, ...vueltas.map((v) => v.acc_total_g)],
    [serieX(), ...vueltas.map((v) => ({ label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true }))]);

  lineChart($('chart-yaw'), 140, null, 'rumbo (°)',
    [grilla, ...vueltas.map((v) => v.rumbo_grados)],
    [serieX(), ...vueltas.map((v) => ({ label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true }))]);

  const referencia = datos.referencia;
  if (referencia) {
    const refVuelta = vueltas.find((v) => mismaId(v.id, referencia.id));
    if (refVuelta) {
      const carga = refVuelta.carga;
    lineChart($('chart-load'), 170, [0, null], 'carga (N)',
      [grilla, carga.delantera_izquierda, carga.delantera_derecha, carga.trasera_izquierda, carga.trasera_derecha],
      [
        serieX(),
        { label: 'FL', stroke: '#38bdf8', width: 2, points: { show: false }, spanGaps: true },
        { label: 'FR', stroke: '#f472b6', width: 2, points: { show: false }, spanGaps: true },
        { label: 'RL', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
        { label: 'RR', stroke: '#facc15', width: 2, points: { show: false }, spanGaps: true },
      ]);
    }
  }

  // Acelerador / Freno por vuelta (mini-gráfico por vuelta)
  const cIn = $('chart-inputs');
  cIn.innerHTML = '';
  vueltas.forEach((v) => {
    const color = colorDeVuelta(v.id);
    const caja = document.createElement('div');
    caja.className = 'mini-grafico';
    caja.innerHTML = `<div class="mini-titulo" style="color:${color}">${v.etiqueta}</div>`;
    const div = document.createElement('div');
    div.className = 'plot'; div.style.height = '140px';
    caja.appendChild(div); cIn.appendChild(caja);
    graficoMinusculo(div, 140, [0, 1.05], '0–1',
      [grilla, v.acelerador, v.freno],
      [
        serieX(),
        { label: 'gas', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
        { label: 'freno', stroke: COLOR.freno, width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
      ]);
  });

  // El primer gráfico se crea antes de que aparezca la barra de desplazamiento y
  // queda más ancho: se igualan todos al ancho final para que el eje X (y la
  // regla de curvas) coincidan en todos.
  for (const r of state.charts.lines) {
    const ancho = r.cont.clientWidth;
    if (ancho && ancho !== r.u.width) r.u.setSize({ width: ancho, height: r.height });
  }
  for (const u of state.charts.inputs) {
    const ancho = u.root.parentElement && u.root.parentElement.clientWidth;
    if (ancho && ancho !== u.width) u.setSize({ width: ancho, height: u.height });
  }

  if (state.grilla.length) { state.idx = state.datosVuelta && state.idx >= state.grilla.length ? state.grilla.length - 1 : state.idx; }
  actualizarPorIdx({ moverCursor: true });
  // uPlot aplica tamaño y escalas un instante después de crear/redimensionar:
  // dibujada ahora, la regla daría posiciones inválidas y quedaría vacía.
  requestAnimationFrame(() => { if (state.tab === 'vuelta') dibujarReglaCurvas(); });
}

/* La regla se dibuja cuando el canvas toma tamaño: al primer render el panel
   puede estar oculto (medidas en 0) y nada más la volvería a dibujar. */
function observarReglaCurvas() {
  const cv = $('ch-regla-curvas');
  if (!cv || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => {
    if (state.tab === 'vuelta') dibujarReglaCurvas();
  }).observe(cv);
}

/* Tramos [ini, fin] de una curva en distancia; si cruza la meta se parte en dos. */
function tramosDeCurva(c, largo) {
  if (c.s_ini == null || c.s_fin == null) return [];
  if (c.s_fin >= c.s_ini) return [[c.s_ini, c.s_fin]];
  return [[c.s_ini, largo], [0, c.s_fin]];
}

/* Curva que contiene la distancia `s`, o null si es recta. */
function curvaEn(curvas, s) {
  if (s == null || !curvas || !curvas.length) return null;
  const largo = state.longitudPista || Infinity;
  return curvas.find((c) => tramosDeCurva(c, largo).some(([a, b]) => s >= a && s <= b)) || null;
}

/* Regla de curvas: una franja alineada con el eje X de los gráficos. Cada curva
   es un tramo del color que tiene en el mapa de Curvas; la del cursor se resalta. */
function dibujarReglaCurvas() {
  const c = prepCanvas('ch-regla-curvas', 34);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const curvas = state.datosVuelta ? state.datosVuelta.curvas || [] : [];
  const u = state.charts.lines[0] && state.charts.lines[0].u;
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  if (!u || !curvas.length) {
    ctx.fillStyle = COLOR.apagado;
    ctx.fillText(u ? 'sin curvas detectadas en la pista' : '', 12, h / 2);
    return;
  }

  // Alineación con el área de dibujo de uPlot (no con el borde del gráfico).
  const over = u.over.getBoundingClientRect();
  const desfase = over.left - cv.getBoundingClientRect().left;
  const izq = desfase, der = desfase + over.width;
  const xDe = (s) => desfase + u.valToPos(s, 'x');
  const largo = state.longitudPista || state.grilla[state.grilla.length - 1] || 0;
  const actual = curvaEn(curvas, state.grilla[state.idx] ?? state.dis);
  const yBarra = h - 12, altoBarra = 7;

  ctx.save();
  ctx.beginPath(); ctx.rect(izq, 0, der - izq, h); ctx.clip();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(izq, yBarra + altoBarra / 2); ctx.lineTo(der, yBarra + altoBarra / 2); ctx.stroke();

  let finEtiqueta = -Infinity;
  curvas.forEach((curva, k) => {
    const color = PALETA[k % PALETA.length];
    const esActual = curva === actual;
    const tramos = tramosDeCurva(curva, largo)
      .map(([a, b]) => [xDe(a), xDe(b)])
      .filter(([x1, x2]) => Number.isFinite(x1) && Number.isFinite(x2));
    if (!tramos.length) return;

    ctx.globalAlpha = actual && !esActual ? 0.55 : 1;
    ctx.fillStyle = color;
    for (const [x1, x2] of tramos) {
      redondeado(ctx, x1, yBarra, Math.max(x2 - x1, 2), altoBarra, 3);
      ctx.fill();
    }

    // Nombre centrado en el tramo más largo; se omite si pisa al anterior.
    const [x1, x2] = tramos.reduce((m, t) => (t[1] - t[0] > m[1] - m[0] ? t : m));
    ctx.font = (esActual ? 'bold ' : '') + '11px "Segoe UI", sans-serif';
    const ancho = ctx.measureText(curva.nombre).width;
    const centro = (x1 + x2) / 2;
    const inicio = centro - ancho / 2;
    if (esActual || inicio > finEtiqueta + 4) {
      ctx.fillStyle = esActual ? COLOR.blanco : color;
      ctx.textAlign = 'center';
      ctx.fillText(curva.nombre, centro, 10);
      finEtiqueta = Math.max(finEtiqueta, inicio + ancho);
    }
  });
  ctx.globalAlpha = 1;

  // Cursor sincronizado con los gráficos.
  const xc = xDe(state.grilla[state.idx] ?? state.dis);
  if (Number.isFinite(xc)) {
    ctx.strokeStyle = 'rgba(34,211,238,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xc, 0); ctx.lineTo(xc, h); ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = 'left';
}
