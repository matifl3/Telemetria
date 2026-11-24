'use strict';

/* Gráficos de una vuelta (canales sobre la distancia de pista) y la regla de
   curvas que acompaña a cada gráfico uPlot del tablero. */

// ===== Regla de curvas =====

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

/* Franja alineada con el eje X del uPlot `u`: cada curva es un tramo del color
   que tiene en el mapa de Curvas; la del cursor se resalta. Con zoom (Ver en
   grande) solo se ve el tramo visible. */
function dibujarReglaCurvas(cv, u) {
  const c = prepararCanvas(cv, 34);
  if (!c) return;
  const { ctx, h } = c;
  const curvas = state.datosVuelta ? state.datosVuelta.curvas || [] : [];
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
      .filter(([x1, x2]) => Number.isFinite(x1) && Number.isFinite(x2))
      // Con zoom, solo la parte visible: así el nombre se centra en lo que se ve.
      .map(([x1, x2]) => [Math.max(x1, izq), Math.min(x2, der)])
      .filter(([x1, x2]) => x2 >= x1);
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

// ===== Gráficos =====

function serieVuelta(v, extra = {}) {
  return { label: etiquetaCorta(v.etiqueta), stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true, ...extra };
}

/* Un canal de cada vuelta visible sobre la grilla común. */
function plotPorCanal(canal, yLabel, yRango = null, extra = {}) {
  return (datos) => {
    if (!datos || !datos.grilla.length || !datos.vueltas.length) return { vacio: 'No hay vueltas visibles.' };
    return {
      plots: [{
        data: [datos.grilla, ...datos.vueltas.map((v) => v[canal])],
        series: [serieX(), ...datos.vueltas.map((v) => serieVuelta(v, extra))],
        yRango,
        yLabel,
      }],
    };
  };
}

const UNA_VUELTA = { categoria: 'una-vuelta', fuente: 'vuelta', tamano: { w: 6, h: 6 } };

registrarGrafico({
  ...UNA_VUELTA, id: 'velocidad', nombre: 'Velocidad', unidad: 'km/h', tamano: { w: 12, h: 6 },
  descripcion: 'Velocidad de cada vuelta visible a lo largo de la pista.',
  uplot: plotPorCanal('velocidad_kmh', 'km/h'),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'rpm', nombre: 'RPM', unidad: 'revoluciones',
  descripcion: 'Régimen del motor.',
  uplot: plotPorCanal('rpm', 'rpm'),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'marcha', nombre: 'Marcha', unidad: 'por distancia de pista',
  descripcion: 'Escalones de cada cambio de marcha.',
  uplot: plotPorCanal('marcha', 'marcha', null, { paths: uPlot.paths.stepped({ align: 1 }) }),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'volante', nombre: 'Volante', unidad: 'rad',
  descripcion: 'Ángulo de dirección: correcciones y entrada a curva.',
  uplot: plotPorCanal('volante', 'volante (rad)'),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'aceleracion', nombre: 'Aceleración total', unidad: 'g',
  descripcion: 'Módulo de la aceleración: frenadas y salidas.',
  uplot: plotPorCanal('acc_total_g', 'g', [0, null]),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'rumbo', nombre: 'Rumbo', unidad: 'grados',
  descripcion: 'Giro real del auto (yaw) a lo largo de la vuelta.',
  uplot: plotPorCanal('rumbo_grados', 'rumbo (°)'),
});
registrarGrafico({
  ...UNA_VUELTA, id: 'carga-ruedas', nombre: 'Carga por rueda', unidad: 'N · vuelta REF',
  descripcion: 'Fuerza vertical sobre cada neumático de la vuelta REF.',
  uplot: (datos) => {
    const ref = datos && datos.referencia && datos.vueltas.find((v) => mismaId(v.id, datos.referencia.id));
    if (!ref) return { vacio: 'Sin vuelta REF: no hay carga por rueda para mostrar.' };
    const c = ref.carga;
    const rueda = (label, stroke) => ({ label, stroke, width: 2, points: { show: false }, spanGaps: true });
    return {
      plots: [{
        data: [datos.grilla, c.delantera_izquierda, c.delantera_derecha, c.trasera_izquierda, c.trasera_derecha],
        series: [serieX(), rueda('FL', '#38bdf8'), rueda('FR', '#f472b6'), rueda('RL', '#4ade80'), rueda('RR', '#facc15')],
        yRango: [0, null],
        yLabel: 'carga (N)',
      }],
    };
  },
});
registrarGrafico({
  ...UNA_VUELTA, id: 'pedales', nombre: 'Acelerador / Freno por vuelta', unidad: '0–1',
  descripcion: 'Un mini-gráfico de gas y freno por cada vuelta visible.',
  tamano: { w: 6, h: 8 },
  uplot: (datos) => {
    if (!datos || !datos.grilla.length || !datos.vueltas.length) return { vacio: 'No hay vueltas visibles.' };
    return {
      plots: datos.vueltas.map((v) => ({
        titulo: v.etiqueta,
        color: colorDeVuelta(v.id),
        data: [datos.grilla, v.acelerador, v.freno],
        series: [
          serieX(),
          { label: 'gas', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
          { label: 'freno', stroke: COLOR.freno, width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
        ],
        yRango: [0, 1.05],
        yLabel: '0–1',
      })),
    };
  },
});
