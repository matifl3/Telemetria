'use strict';

/* Pestaña Telemetría (id interno "vuelta", RF-011): chips de canales, regla de
   curvas, gráficos sincronizados y pedales por vuelta. */

/* Gráficos de la pestaña. La misma definición la usan el render, los chips y
   "Ver en grande". `alto` es el alto mínimo (el de siempre con los 8 visibles). */
const GRAFICOS_TELEMETRIA = [
  { clave: 'velocidad', chip: 'Velocidad', contenedor: 'chart-speed', alto: 250, yLabel: 'km/h', canal: 'velocidad_kmh' },
  { clave: 'rpm', chip: 'RPM', contenedor: 'chart-rpm', alto: 170, yLabel: 'rpm', canal: 'rpm' },
  { clave: 'marcha', chip: 'Marcha', contenedor: 'chart-gear', alto: 140, yLabel: 'marcha', canal: 'marcha', escalonado: true },
  { clave: 'volante', chip: 'Volante', contenedor: 'chart-steer', alto: 150, yLabel: 'volante (rad)', canal: 'volante' },
  { clave: 'acel', chip: 'Acel.', contenedor: 'chart-acc', alto: 150, yRango: [0, null], yLabel: 'g', canal: 'acc_total_g' },
  { clave: 'rumbo', chip: 'Rumbo', contenedor: 'chart-yaw', alto: 140, yLabel: 'rumbo (°)', canal: 'rumbo_grados' },
  { clave: 'carga', chip: 'Carga', contenedor: 'chart-load', alto: 170, yRango: [0, null], yLabel: 'carga (N)' },
  { clave: 'pedales', chip: 'Pedales', contenedor: 'chart-inputs', alto: 140, yRango: [0, 1.05], yLabel: '0–1' },
];

const ALTO_MAX_GRAFICO = 520;    // tope por gráfico al repartir el alto
const EXTRA_TARJETA = 92;        // título + leyenda + márgenes de cada tarjeta (px)
const EXTRA_MINI = 85;           // título, leyenda, relleno y separación de cada mini-gráfico (px)

const definicionGrafico = (clave) => GRAFICOS_TELEMETRIA.find((g) => g.clave === clave) || null;
const tarjetaGrafico = (clave) => document.querySelector(`.grafico-card[data-grafico="${clave}"]`);

function serieVuelta(v, extra = {}) {
  return { label: v.etiqueta, stroke: colorDeVuelta(v.id), width: 2, points: { show: false }, spanGaps: true, ...extra };
}

/* Datos y series uPlot de un gráfico de líneas, o null si no hay qué dibujar
   (Carga sin vuelta REF). */
function datosGrafico(def, datos) {
  const { grilla, vueltas } = datos;
  if (def.clave === 'carga') {
    const ref = datos.referencia && vueltas.find((v) => mismaId(v.id, datos.referencia.id));
    if (!ref) return null;
    const c = ref.carga;
    const rueda = (label, stroke) => ({ label, stroke, width: 2, points: { show: false }, spanGaps: true });
    return {
      data: [grilla, c.delantera_izquierda, c.delantera_derecha, c.trasera_izquierda, c.trasera_derecha],
      series: [serieX(), rueda('FL', '#38bdf8'), rueda('FR', '#f472b6'), rueda('RL', '#4ade80'), rueda('RR', '#facc15')],
    };
  }
  const extra = def.escalonado ? { paths: uPlot.paths.stepped({ align: 1 }) } : {};
  return {
    data: [grilla, ...vueltas.map((v) => v[def.canal])],
    series: [serieX(), ...vueltas.map((v) => serieVuelta(v, extra))],
  };
}

/* Pedales: un mini-gráfico por vuelta. Crea las cajas en `cont` y devuelve, por
   vuelta, el div del gráfico con sus datos y series. */
function cajasPedales(cont, datos, altoMini) {
  cont.innerHTML = '';
  return datos.vueltas.map((v) => {
    const color = colorDeVuelta(v.id);
    const caja = document.createElement('div');
    caja.className = 'mini-grafico';
    caja.innerHTML = `<div class="mini-titulo" style="color:${color}">${v.etiqueta}</div>`;
    const div = document.createElement('div');
    div.className = 'plot'; div.style.height = `${altoMini}px`;
    caja.appendChild(div); cont.appendChild(caja);
    return {
      div,
      data: [datos.grilla, v.acelerador, v.freno],
      series: [
        serieX(),
        { label: 'gas', stroke: COLOR.gas, width: 2, points: { show: false }, spanGaps: true },
        { label: 'freno', stroke: COLOR.freno, width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
      ],
    };
  });
}

/* Alto de cada mini-gráfico de pedales cuando la tarjeta dispone de `total` px. */
function altoMiniPedales(total, nVueltas) {
  const n = Math.max(1, nVueltas);
  return Math.max(140, Math.min(ALTO_MAX_GRAFICO, Math.floor(total / n) - EXTRA_MINI));
}

/* Reparte el alto de la ventana entre los gráficos visibles: con pocos, cada uno
   crece (hasta ALTO_MAX_GRAFICO); con todos, quedan en su alto mínimo. */
function altosRepartidos(activos) {
  const css = getComputedStyle(document.documentElement);
  const fijo = (parseFloat(css.getPropertyValue('--alto-topbar')) || 70)
    + (parseFloat(css.getPropertyValue('--alto-tabs')) || 0)
    + ($('chips-graficos') ? $('chips-graficos').offsetHeight : 0)
    + (document.querySelector('.regla-curvas') ? document.querySelector('.regla-curvas').offsetHeight : 40)
    + 40;
  const porTarjeta = (window.innerHeight - fijo) / Math.max(1, activos.length) - EXTRA_TARJETA;
  const altos = new Map();
  for (const def of activos) altos.set(def.clave, Math.max(def.alto, Math.min(ALTO_MAX_GRAFICO, Math.floor(porTarjeta))));
  return altos;
}

function renderPestanaVuelta(datos) {
  destroyCharts();
  actualizarChipsGraficos();
  if (!datos || !datos.grilla.length) return;
  const activos = GRAFICOS_TELEMETRIA.filter((g) => !state.graficosOcultos.has(g.clave));
  const altos = altosRepartidos(activos);

  for (const def of GRAFICOS_TELEMETRIA) {
    const tarjeta = tarjetaGrafico(def.clave);
    const cont = $(def.contenedor);
    const activo = activos.includes(def);
    if (tarjeta) tarjeta.hidden = !activo;
    if (!cont) continue;
    cont.innerHTML = '';
    if (!activo) continue;
    const boton = tarjeta && tarjeta.querySelector('[data-ampliar]');

    if (def.clave === 'pedales') {
      // El alto asignado a la tarjeta se reparte entre los mini-gráficos.
      const total = Math.max(def.alto * datos.vueltas.length, altos.get(def.clave) + EXTRA_TARJETA);
      const altoMini = altoMiniPedales(total, datos.vueltas.length);
      for (const p of cajasPedales(cont, datos, altoMini)) {
        graficoMinusculo(p.div, altoMini, def.yRango, def.yLabel, p.data, p.series);
      }
      if (boton) boton.disabled = !datos.vueltas.length;
      continue;
    }

    const d = datosGrafico(def, datos);
    if (boton) boton.disabled = !d;
    if (!d) { cont.innerHTML = '<p class="hint vacio">Sin vuelta REF: no hay carga por rueda para mostrar.</p>'; continue; }
    lineChart(cont, altos.get(def.clave), def.yRango, def.yLabel, d.data, d.series);
  }

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

// ===== Chips de canales =====

/* Crea los chips una sola vez; después solo se actualiza su estado (así el foco
   no se pierde al volver a dibujar la pestaña). */
function iniciarChipsGraficos() {
  const lista = $('chips-lista');
  if (!lista) return;
  for (const def of GRAFICOS_TELEMETRIA) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-grafico';
    chip.dataset.grafico = def.clave;
    chip.textContent = def.chip;
    chip.addEventListener('click', () => alternarGrafico(def.clave));
    lista.appendChild(chip);
  }
  $('chips-todos').addEventListener('click', () => {
    state.graficosOcultos.clear();
    renderPestanaVuelta(state.datosVuelta);
  });
  // Un solo listener para los ⤢ de todas las tarjetas.
  $('panel-vuelta').addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-ampliar]');
    if (boton && !boton.disabled) abrirGraficoAmpliado(boton.dataset.ampliar, boton);
  });
  actualizarChipsGraficos();
}

function alternarGrafico(clave) {
  const ocultos = state.graficosOcultos;
  if (ocultos.has(clave)) ocultos.delete(clave);
  else if (ocultos.size < GRAFICOS_TELEMETRIA.length - 1) ocultos.add(clave);
  else return; // debe quedar al menos un gráfico visible
  renderPestanaVuelta(state.datosVuelta);
}

function actualizarChipsGraficos() {
  const ocultos = state.graficosOcultos;
  const ultimo = ocultos.size === GRAFICOS_TELEMETRIA.length - 1;
  document.querySelectorAll('.chip-grafico').forEach((chip) => {
    const activo = !ocultos.has(chip.dataset.grafico);
    chip.setAttribute('aria-pressed', String(activo));
    const bloqueado = activo && ultimo;
    chip.setAttribute('aria-disabled', String(bloqueado));
    chip.title = bloqueado ? 'Debe quedar al menos un gráfico visible' : '';
  });
  const todos = $('chips-todos');
  if (todos) todos.disabled = ocultos.size === 0;
}

/* Nueva sesión o "Limpiar": todos los gráficos visibles y sin overlay abierto. */
function reiniciarGraficosTelemetria() {
  state.graficosOcultos.clear();
  actualizarChipsGraficos();
  cerrarGraficoAmpliado();
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
function dibujarReglaCurvas(canvasId = 'ch-regla-curvas', u = graficoGuia()) {
  const c = prepCanvas(canvasId, 34);
  if (!c) return;
  const { ctx, w, h, cv } = c;
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
