'use strict';

/* Pestaña Vuelta (RF-011): 7 gráficos sincronizados + pedales por vuelta. */

function renderPestanaVuelta(datos) {
  destroyCharts();
  state.pistasCurvas = (datos && datos.curvas) || [];
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
        { label: 'gas', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
        { label: 'freno', stroke: '#f87171', width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
      ]);
  });

  if (state.grilla.length) { state.idx = state.datosVuelta && state.idx >= state.grilla.length ? state.grilla.length - 1 : state.idx; }
  actualizarPorIdx({ moverCursor: true });
}
