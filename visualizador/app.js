'use strict';

/* ============================================================
   AC Telemetry Lab
   Carga CSV de vueltas, gráficos sincronizados (uPlot) y mapa
   de pista en canvas con marcador y reproductor.
   ============================================================ */

const SYNC_KEY = 'ac-tele-lab';
const PALETA = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171'];

const ALIAS = {
  distance: ['distance', 'dist', 'distancia', 'lap_distance', 'distance_m', 'lapdist', 'dist_m'],
  time: ['timestamp', 'time', 't', 'tiempo', 'tiempo_s', 'time_s', 'tiempo_vuelta_s'],
  speed: ['speed', 'velocidad_kmh', 'velocidad', 'speed_kmh', 'vel', 'velocity_kmh', 'vkmh'],
  throttle: ['throttle', 'gas', 'acelerador', 'throttle_pct', 'gas_pct', 'acelerador_pct'],
  brake: ['brake', 'freno', 'brake_pct', 'freno_pct', 'frenado_pct'],
  gear: ['gear', 'marcha', 'ngear', 'gear_number'],
  x: ['x', 'pos_x', 'position_x', 'world_x', 'posx', 'positionx', 'pos_x_m', 'x_m'],
  z: ['z', 'pos_z', 'position_z', 'world_z', 'posz', 'positionz', 'pos_z_m', 'z_m'],
};

const state = {
  laps: [],
  refId: null,
  grid: [],
  gridStep: 1,
  maxDist: 0,
  idx: 0,
  dist: 0,
  playing: false,
  speedMult: 1,
  loop: true,
  charts: { speed: null, inputs: [] },
  raf: null,
  lastTs: 0,
  colorIdx: 0,
};

const $ = (id) => document.getElementById(id);

/* ---------- utilidades numéricas ---------- */

function aNumero(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normCol(name) {
  return String(name).replace(/^\uFEFF/, '').trim().toLowerCase();
}

function columnasDe(fields) {
  const mapa = {};
  const bajas = (fields || []).map((f) => ({ orig: f, low: normCol(f) }));
  for (const [clave, opciones] of Object.entries(ALIAS)) {
    const encontrado = bajas.find((f) => opciones.includes(f.low));
    if (encontrado) mapa[clave] = encontrado.orig;
  }
  // heurística de posición: eje x/z si no vino por alias exacto
  // (evita confundirse con acc_x, rot_z, vel_x de los ejes del auto).
  if (mapa.x === undefined) {
    const e = bajas.find((f) => /^(pos|position|world|car|coche)[_\s]?x(_?m)?$/.test(f.low) || f.low === 'x');
    if (e) mapa.x = e.orig;
  }
  if (mapa.z === undefined) {
    const e = bajas.find((f) => /^(pos|position|world|car|coche)[_\s]?z(_?m)?$/.test(f.low) || f.low === 'z');
    if (e) mapa.z = e.orig;
  }
  return mapa;
}

function normalizarPedal(valores) {
  let max = 0;
  for (const v of valores) if (Number.isFinite(v) && v > max) max = v;
  if (max <= 1.001) return { valores, escala: 1 };
  if (max <= 100.5) return { valores: valores.map((v) => v / 100), escala: 100 };
  return { valores: valores.map((v) => v / 255), escala: 255 };
}

function distanciaAcumulada(xs, zs) {
  const d = new Array(xs.length);
  d[0] = 0;
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1];
    const dz = zs[i] - zs[i - 1];
    d[i] = d[i - 1] + Math.hypot(dx, dz);
  }
  return d;
}

function resampleLineal(srcX, srcY, grid) {
  const out = new Array(grid.length);
  let j = 0;
  const n = srcX.length;
  for (let i = 0; i < grid.length; i++) {
    const gx = grid[i];
    if (gx <= srcX[0]) { out[i] = srcY[0]; continue; }
    if (gx >= srcX[n - 1]) { out[i] = srcY[n - 1]; continue; }
    while (j < n - 1 && srcX[j + 1] < gx) j++;
    const x0 = srcX[j], x1 = srcX[j + 1];
    const t = x1 === x0 ? 0 : (gx - x0) / (x1 - x0);
    out[i] = srcY[j] + (srcY[j + 1] - srcY[j]) * t;
  }
  return out;
}

function resampleCercano(srcX, srcY, grid) {
  const out = new Array(grid.length);
  let j = 0;
  const n = srcX.length;
  for (let i = 0; i < grid.length; i++) {
    const gx = grid[i];
    while (j < n - 1 && Math.abs(srcX[j + 1] - gx) <= Math.abs(srcX[j] - gx)) j++;
    out[i] = srcY[j];
  }
  return out;
}

/* ---------- carga ---------- */

function parsearArchivoCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
      complete: (res) => resolve({ file, rows: res.data, fields: res.meta.fields || [] }),
      error: (err) => reject(err),
    });
  });
}

/** Construye una "vuelta" común (lo que graficamos) a partir de series. */
function crearLap(name, series) {
  const n = series.x.length;
  if (n < 2) throw new Error(`"${name}": muy pocas filas válidas.`);
  const dist = series.dist ? series.dist.slice() : distanciaAcumulada(series.x, series.z);
  const gasR = normalizarPedal(series.throttle);
  const frenoR = normalizarPedal(series.brake);
  const time = series.time || dist.map(() => NaN);
  const t0 = Number.isFinite(time[0]) ? time[0] : 0;
  return {
    id: name + '#' + Math.random().toString(36).slice(2, 7),
    name,
    color: PALETA[state.colorIdx++ % PALETA.length],
    visible: true,
    raw: {
      x: series.x, z: series.z, dist,
      speed: series.speed,
      throttle: gasR.valores, brake: frenoR.valores,
      gear: series.gear,
      time: time.map((v) => (Number.isFinite(v) ? v - t0 : NaN)),
    },
    grid: null,
  };
}

function construirVueltaCSV({ file, rows, fields }) {
  const cols = columnasDe(fields);
  if (cols.x === undefined || cols.z === undefined) {
    const nombres = (fields || []).slice(0, 14).join(', ');
    throw new Error(
      `"${file.name}": faltan columnas de posición (busco x/z o pos_x/pos_z). ` +
      `Columnas detectadas: ${nombres}${(fields || []).length > 14 ? '…' : ''}`
    );
  }
  const col = (clave) => (cols[clave] === undefined ? rows.map(() => NaN) : rows.map((r) => aNumero(r[cols[clave]])));
  const series = {
    x: col('x'), z: col('z'),
    speed: col('speed'), time: col('time'), gear: col('gear'),
    throttle: col('throttle'), brake: col('brake'),
  };
  if (cols.distance !== undefined) series.dist = col('distance');
  return crearLap(file.name.replace(/\.csv$/i, ''), series);
}

/* ---------- parser .acreplay v16 (en el navegador) ---------- */

const decodUtf8 = new TextDecoder('utf-8');

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7C00) >> 10;
  const f = h & 0x03FF;
  if (e === 0) return f === 0 ? (s ? -0 : 0) : (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

/**
 * Convierte un .acreplay v16 en vueltas (offsets según doc/FormatoTelemetria.md §2.4).
 * Lee solo el auto del jugador (current_recording_index) y saltea el resto.
 */
async function parsearReplay(file) {
  const buf = await file.arrayBuffer();
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let pos = 0;

  const u32 = () => { const v = dv.getUint32(pos, true); pos += 4; return v; };
  const f64 = () => { const v = dv.getFloat64(pos, true); pos += 8; return v; };
  const cadena = () => {
    const largo = u32();
    if (largo < 0 || largo > 1_000_000 || pos + largo > buf.byteLength) return '';
    const s = decodUtf8.decode(u8.subarray(pos, pos + largo));
    pos += largo;
    return s;
  };

  const version = u32();
  if (version !== 16) throw new Error(`${file.name}: .acreplay de versión ${version}; solo se soporta la 16.`);
  f64();                    // recording_interval (no lo usamos)
  cadena(); cadena(); cadena();  // weather, track, track_config
  const numCars = u32();
  u32();                          // current_recording_index (no se usa: el jugador es el auto 0)
  const numFrames = u32();
  const numTrackObjects = u32();
  pos += (4 + 12 * numTrackObjects) * numFrames;

  const jugador = 0;
  let encontrado = false;
  let result = null;

  for (let c = 0; c < numCars; c++) {
    const carId = cadena();
    const piloto = cadena();
    cadena();                  // nation_code
    cadena();                  // team
    cadena();                  // skin
    const frames = u32();
    const wings = u32();
    pos += 20;

    if (c !== jugador) {
      pos += frames * 256 + (frames - 1) * (20 + wings * 4);
      pos += wings * 4;
      const extra = u32();
      pos += extra * 8;
      continue;
    }

    const X = [], Z = [], V = [], GE = [], GAS = [], FREN = [], VUELTA = [], TIME = [];
    for (let i = 0; i < frames; i++) {
      const o = pos;
      pos += 256;
      X.push(dv.getFloat32(o, true));
      Z.push(dv.getFloat32(o + 8, true));
      const vx = halfToFloat(dv.getUint16(o + 164, true));
      const vy = halfToFloat(dv.getUint16(o + 166, true));
      const vz = halfToFloat(dv.getUint16(o + 168, true));
      V.push(Math.hypot(vx, vy, vz) * 3.6);
      GE.push(u8[o + 234]);
      GAS.push(u8[o + 244]);
      FREN.push(u8[o + 245]);
      VUELTA.push(u8[o + 246]);
      TIME.push(dv.getUint32(o + 220, true) / 1000);
      if (i < frames - 1) pos += 20 + wings * 4;
    }
    pos += wings * 4;
    const extra = u32();
    pos += extra * 8;

    // segmenta por número de vuelta (como el core): cada tramo es una "vuelta"
    const laps = [];
    let seg = { lap: null, indices: [] };
    for (let i = 0; i < frames; i++) {
      if (seg.lap === null) seg.lap = VUELTA[i];
      if (VUELTA[i] !== seg.lap) { laps.push(seg); seg = { lap: VUELTA[i], indices: [] }; }
      seg.indices.push(i);
    }
    if (seg.indices.length) laps.push(seg);

    const vueltas = [];
    for (const lap of laps) {
      const idxs = lap.indices;
      if (idxs.length < 2) continue;
      const serie = { x: [], z: [], speed: [], throttle: [], brake: [], gear: [], time: [] };
      for (const i of idxs) {
        serie.x.push(X[i]); serie.z.push(Z[i]);
        serie.speed.push(V[i]); serie.throttle.push(GAS[i]); serie.brake.push(FREN[i]);
        serie.gear.push(GE[i]); serie.time.push(TIME[i]);
      }
      const t = serie.time;
      const dur = t.length > 1 ? Math.max(...t) - Math.min(...t) : NaN;
      vueltas.push({
        name: `${piloto} · ${carId} · V${lap.lap}`,
        nVuelta: lap.lap,
        frames: idxs.length,
        tiempo: Number.isFinite(dur) ? dur : NaN,
        serie,
      });
    }
    result = vueltas;
    encontrado = true;
    break;
  }

  if (!encontrado || !result || !result.length) {
    throw new Error(`${file.name}: no se encontraron vueltas en el replay.`);
  }
  return result;
}

async function cargarArchivos(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  try {
    const nuevas = [];
    for (const f of files) {
      if (/\.csv$/i.test(f.name)) {
        nuevas.push(construirVueltaCSV(await parsearArchivoCSV(f)));
      } else if (/\.acreplay$/i.test(f.name)) {
        const candidatas = await parsearReplay(f);
        const elegidas = await preguntarVueltas(f.name, candidatas);
        for (const c of elegidas) nuevas.push(crearLap(c.name, c.serie));
      } else {
        throw new Error(`"${f.name}": extensión no soportada (CSV o .acreplay).`);
      }
    }
    if (!nuevas.length) return;
    state.laps.push(...nuevas);
    if (state.refId === null && state.laps.length) state.refId = visibleLaps()[0].id;
    ocultarError();
    mostrarDashboard();
    recomputar();
  } catch (e) {
    mostrarError(e.message || String(e));
  }
}

/* ---------- selector de vueltas (replays) ---------- */

function fmtTiempo(seg) {
  if (!Number.isFinite(seg)) return '';
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function preguntarVueltas(nombreArchivo, vueltas) {
  return new Promise((resolve) => {
    const modal = $('modal-selector');
    $('modal-archivo').textContent = nombreArchivo;
    const lista = $('modal-lista');
    lista.innerHTML = vueltas
      .map(
        (v, i) =>
          `<label class="fila-vuelta">
             <input type="checkbox" data-i="${i}" checked />
             <span class="nombre">${v.name}</span>
             <span class="tiempo mono">${fmtTiempo(v.tiempo)}</span>
             <span class="frames mono">${v.frames} fr</span>
           </label>`
      )
      .join('');

    const chkTodas = $('chk-todas');
    chkTodas.checked = false;

    const marcarRapidas = () => {
      const tiempos = vueltas.map((v) => v.tiempo).filter(Number.isFinite);
      if (!tiempos.length) return;
      const mejor = Math.min(...tiempos);
      lista.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const v = vueltas[Number(cb.dataset.i)];
        cb.checked = Number.isFinite(v.tiempo) && v.tiempo <= mejor * 1.03;
      });
    };
    marcarRapidas();

    chkTodas.onchange = () => {
      lista.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = chkTodas.checked));
    };

    $('btn-solo-rapidas').onclick = () => {
      marcarRapidas();
      chkTodas.checked = false;
    };

    const cerrar = (elegidas) => {
      modal.classList.add('oculto');
      modal.setAttribute('aria-hidden', 'true');
      resolve(elegidas);
    };
    $('btn-modal-aceptar').onclick = () => {
      const elegidas = vueltas.filter((v, i) => {
        const cb = lista.querySelector(`input[data-i="${i}"]`);
        return cb && cb.checked;
      });
      cerrar(elegidas);
    };
    $('btn-modal-cancelar').onclick = () => cerrar([]);

    modal.classList.remove('oculto');
    modal.setAttribute('aria-hidden', 'false');
  });
}

/* ---------- recomputar malla común y resample ---------- */

function visibleLaps() {
  return state.laps.filter((l) => l.visible);
}

function recomputar() {
  const laps = visibleLaps();
  if (!laps.length) return;

  let maxDist = 0;
  for (const l of laps) {
    const d = l.raw.dist;
    maxDist = Math.max(maxDist, d[d.length - 1]);
  }
  state.maxDist = maxDist;
  const objetivo = 2200;
  const step = Math.max(maxDist / objetivo, 0.25);
  state.gridStep = step;
  const n = Math.floor(maxDist / step) + 1;
  const grid = new Array(n);
  for (let i = 0; i < n; i++) grid[i] = i * step;
  state.grid = grid;

  for (const l of laps) {
    const r = l.raw;
    l.grid = {
      speed: resampleLineal(r.dist, r.speed, grid),
      throttle: resampleLineal(r.dist, r.throttle, grid),
      brake: resampleLineal(r.dist, r.brake, grid),
      x: resampleLineal(r.dist, r.x, grid),
      z: resampleLineal(r.dist, r.z, grid),
      time: resampleLineal(r.dist, r.time, grid),
      gear: resampleCercano(r.dist, r.gear, grid),
    };
  }
  state.idx = Math.min(state.idx, grid.length - 1);
  state.dist = grid[state.idx] || 0;

  renderListaVueltas();
  renderReadoutsBase();
  buildCharts();
  drawMap();
  actualizarScrub();
}

/* ---------- lista de vueltas ---------- */

function tiempoDeVuelta(l) {
  const t = l.raw.time;
  for (let i = t.length - 1; i >= 0; i--) if (Number.isFinite(t[i])) return t[i];
  return NaN;
}

function renderListaVueltas() {
  const ul = $('lista-vueltas');
  ul.innerHTML = '';
  state.laps.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'vuelta-item' + (l.id === state.refId ? ' ref' : '');
    const tMeta = fmtTiempo(tiempoDeVuelta(l));
    li.innerHTML =
      `<span class="vuelta-color" style="background:${l.color}"></span>` +
      `<span class="vuelta-info">
         <span class="vuelta-nombre">${l.name}</span>
         <span class="vuelta-meta">${tMeta ? tMeta + ' · ' : ''}${l.raw.x.length} pts · ${l.raw.dist[l.raw.dist.length - 1].toFixed(0)} m</span>
       </span>` +
      (l.id === state.refId ? '<span class="ref-badge">REF</span>' : '') +
      `<button class="vuelta-eye ${l.visible ? 'on' : ''}" title="Mostrar/ocultar">●</button>`;
    li.querySelector('.vuelta-info').addEventListener('click', () => {
      state.refId = l.id;
      renderListaVueltas();
      renderReadoutsBase();
      updateUI();
    });
    const ojo = li.querySelector('.vuelta-eye');
    ojo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      l.visible = !l.visible;
      if (!l.visible && l.id === state.refId) {
        const v = visibleLaps();
        state.refId = v.length ? v[0].id : null;
      }
      recomputar();
      if (!visibleLaps().length) buildCharts();
    });
    ul.appendChild(li);
  });
}

/* ---------- readouts ---------- */

const RO = [
  { id: 'vel', label: 'Velocidad', unidad: 'km/h' },
  { id: 'dist', label: 'Distancia', unidad: 'm' },
  { id: 'gas', label: 'Acelerador', unidad: '%' },
  { id: 'freno', label: 'Freno', unidad: '%' },
  { id: 'marcha', label: 'Marcha', unidad: '' },
  { id: 'tiempo', label: 'Tiempo', unidad: 's' },
];

function renderReadoutsBase() {
  const cont = $('readouts');
  cont.innerHTML = '';
  RO.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'ro';
    div.innerHTML = `<div class="ro-label">${r.label} ${r.unidad ? '(' + r.unidad + ')' : ''}</div>
                     <div class="ro-valor mono" id="ro-${r.id}">–</div>`;
    cont.appendChild(div);
  });
}

function lapRef() {
  return state.laps.find((l) => l.id === state.refId) || visibleLaps()[0] || null;
}

/* ---------- gráficos ---------- */

function opcionesGrafico(cont, height, yRango, yLabel) {
  const ancho = cont.clientWidth || 800;
  return {
    width: ancho,
    height,
    padding: [8, 14, 0, 8],
    cursor: {
      sync: { key: SYNC_KEY },
      drag: { x: true, y: false, setScale: false },
      focus: { prox: 40 },
    },
    legend: { show: true, live: true },
    scales: {
      x: { time: false },
      y: yRango ? { range: yRango } : { auto: true },
    },
    axes: [
      {
        stroke: '#8b97a8',
        grid: { stroke: 'rgba(255,255,255,0.05)' },
        ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif',
        label: 'Distancia (m)',
        labelFont: '12px "Segoe UI", sans-serif',
        size: 42,
        values: (u, vals) => vals.map((v) => Math.round(v)),
      },
      {
        stroke: '#8b97a8',
        grid: { stroke: 'rgba(255,255,255,0.05)' },
        ticks: { stroke: '#2a3444' },
        font: '12px "Segoe UI", sans-serif',
        label: yLabel,
        labelFont: '12px "Segoe UI", sans-serif',
        size: 52,
        labelSize: 26,
      },
    ],
    hooks: { setCursor: [onCursor] },
  };
}

function buildCharts() {
  destroyCharts();
  const laps = visibleLaps();
  if (!laps.length) return;
  const x = state.grid;

  // --- Velocidad ---
  const cSpeed = $('chart-speed');
  const sData = [x];
  const sSeries = [{ label: 'Distancia', value: (u, v) => (v == null ? '' : v.toFixed(0) + ' m') }];
  laps.forEach((l) => {
    sData.push(l.grid.speed);
    sSeries.push({ label: l.name, stroke: l.color, width: 2, points: { show: false }, spanGaps: true });
  });
  const oSpeed = opcionesGrafico(cSpeed, 250, null, 'km/h');
  oSpeed.series = sSeries;
  state.charts.speed = new uPlot(oSpeed, sData, cSpeed);

  // --- Acelerador / Freno: un gráfico por vuelta ---
  const cIn = $('chart-inputs');
  cIn.innerHTML = '';
  laps.forEach((l) => {
    const caja = document.createElement('div');
    caja.className = 'mini-grafico';
    caja.innerHTML = `<div class="mini-titulo" style="color:${l.color}">${l.name}</div>`;
    const div = document.createElement('div');
    div.className = 'plot';
    div.style.height = '150px';
    caja.appendChild(div);
    cIn.appendChild(caja);

    const iData = [x, l.grid.throttle, l.grid.brake];
    const iSeries = [
      { label: `${l.name} · distancia`, value: (u, v) => (v == null ? '' : v.toFixed(0) + ' m') },
      { label: 'gas', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
      { label: 'freno', stroke: '#f87171', width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
    ];
    const oIn = opcionesGrafico(div, 150, [0, 1.05], '0–1');
    oIn.series = iSeries;
    state.charts.inputs.push(new uPlot(oIn, iData, div));
  });

  // posición inicial del cursor
  moverCursor();
}

function destroyCharts() {
  if (state.charts.speed) { state.charts.speed.destroy(); state.charts.speed = null; }
  for (const u of state.charts.inputs) u.destroy();
  state.charts.inputs = [];
}

function onCursor(u) {
  const idx = u.cursor.idx;
  if (idx == null || idx < 0 || idx >= state.grid.length) return;
  state.idx = idx;
  state.dist = state.grid[idx];
  updateUI({ moverCursor: false });
}

function moverCursor() {
  const u = state.charts.speed;
  if (!u) return;
  const left = u.valToPos(state.dist, 'x');
  u.setCursor({ left, top: u.over.height / 2 });
}

/* ---------- UI / mapa ---------- */

function actualizarScrub() {
  const scrub = $('scrub');
  scrub.value = state.maxDist ? Math.round((state.dist / state.maxDist) * 1000) : 0;
  $('scrub-dist').textContent = state.dist.toFixed(0) + ' m';
}

function updateUI(opts = { moverCursor: true }) {
  actualizarScrub();
  const lap = lapRef();
  if (lap && lap.grid) {
    const i = state.idx;
    $('ro-vel').textContent = (lap.grid.speed[i] ?? 0).toFixed(1);
    $('ro-dist').textContent = state.dist.toFixed(0);
    $('ro-gas').textContent = (lap.grid.throttle[i] * 100).toFixed(0);
    $('ro-freno').textContent = (lap.grid.brake[i] * 100).toFixed(0);
    $('ro-marcha').textContent = Math.round(lap.grid.gear[i] ?? 0);
    $('ro-tiempo').textContent = (lap.grid.time[i] ?? 0).toFixed(2);
  }
  drawMap();
  if (opts.moverCursor) moverCursor();
}

/* ---------- canvas mapa ---------- */

function drawMap() {
  const cv = $('mapa');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 400;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const laps = visibleLaps();
  if (!laps.length) return;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const l of laps) {
    const { x, z } = l.raw;
    for (let i = 0; i < x.length; i++) {
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (z[i] < minZ) minZ = z[i];
      if (z[i] > maxZ) maxZ = z[i];
    }
  }
  const pad = 34;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanZ = Math.max(maxZ - minZ, 1e-6);
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanZ);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanZ * s) / 2;
  const tf = (x, z) => [ox + (x - minX) * s, oy + (maxZ - z) * s];

  // grilla de fondo
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
  for (let gy = 0; gy <= h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

  // trazados
  for (const l of laps) {
    const esRef = l.id === state.refId;
    ctx.beginPath();
    const { x, z } = l.raw;
    for (let i = 0; i < x.length; i++) {
      const [px, py] = tf(x[i], z[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = hexA(l.color, esRef ? 0.95 : 0.45);
    ctx.lineWidth = esRef ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // línea de meta (primer punto de la referencia)
  const ref = lapRef();
  if (ref) {
    const [mxs, mys] = tf(ref.raw.x[0], ref.raw.z[0]);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mxs, mys, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('S/F', mxs + 8, mys - 6);
  }

  // marcadores (uno por vuelta visible) en la distancia actual
  for (const l of laps) {
    if (!l.grid) continue;
    const esRef = l.id === state.refId;
    const [px, py] = tf(l.grid.x[state.idx], l.grid.z[state.idx]);
    ctx.beginPath();
    ctx.arc(px, py, esRef ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = esRef ? '#ffffff' : hexA(l.color, 0.9);
    ctx.fill();
    if (esRef) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = l.color;
      ctx.stroke();
    }
  }
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- reproductor ---------- */

function togglePlay() {
  state.playing = !state.playing;
  $('btn-play').textContent = state.playing ? '❚❚' : '▶';
  if (state.playing) {
    state.lastTs = performance.now();
    state.raf = requestAnimationFrame(tick);
  } else if (state.raf) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }
}

function tick(ts) {
  if (!state.playing) return;
  const dt = (ts - state.lastTs) / 1000;
  state.lastTs = ts;
  // velocidad de reproducción: ~120 m/s base * mult (aprox. 1× = tiempo real a ~200 km/h)
  let nueva = state.dist + dt * state.speedMult * 90;
  if (nueva >= state.maxDist) {
    if (state.loop) nueva = nueva % state.maxDist;
    else { nueva = state.maxDist; togglePlay(); }
  }
  const idx = Math.min(state.grid.length - 1, Math.max(0, Math.round(nueva / state.gridStep)));
  state.idx = idx;
  state.dist = state.grid[idx];
  updateUI({ moverCursor: true });
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

function irA(dist) {
  const d = Math.max(0, Math.min(state.maxDist, dist));
  state.dist = d;
  state.idx = Math.min(state.grid.length - 1, Math.max(0, Math.round(d / state.gridStep)));
  updateUI({ moverCursor: true });
}

/* ---------- visibilidad ---------- */

function mostrarDashboard() { $('zona-carga').classList.add('oculto'); $('dashboard').classList.remove('oculto'); $('btn-limpiar').disabled = false; }
function mostrarError(msg) { const e = $('error-aviso'); e.textContent = '⚠ ' + msg; e.classList.remove('oculto'); }
function ocultarError() { $('error-aviso').classList.add('oculto'); }

/* ---------- eventos ---------- */

function init() {
  const input = $('input-archivos');
  $('btn-abrir').addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { cargarArchivos(e.target.files); input.value = ''; });

  const zona = $('zona-carga');
  ['dragenter', 'dragover'].forEach((ev) =>
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zona.classList.remove('encima');
    if (e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files);
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length && $('dashboard').classList.contains('oculto')) cargarArchivos(e.dataTransfer.files);
  });

  $('btn-play').addEventListener('click', togglePlay);
  $('chk-loop').addEventListener('change', (e) => { state.loop = e.target.checked; });
  $('sel-velocidad').addEventListener('change', (e) => { state.speedMult = parseFloat(e.target.value); });
  $('scrub').addEventListener('input', (e) => irA((e.target.value / 1000) * state.maxDist));

  $('btn-limpiar').addEventListener('click', () => {
    destroyCharts();
    state.laps = [];
    state.refId = null;
    state.idx = 0;
    state.dist = 0;
    state.playing = false;
    state.colorIdx = 0;
    $('btn-play').textContent = '▶';
    $('dashboard').classList.add('oculto');
    $('zona-carga').classList.remove('oculto');
    $('btn-limpiar').disabled = true;
    ocultarError();
  });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (state.grid.length) togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); irA(state.dist + state.gridStep * 10); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); irA(state.dist - state.gridStep * 10); }
  });

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      drawMap();
      const laps = visibleLaps();
      if (!laps.length) return;
      const w = $('graficos').clientWidth;
      if (state.charts.speed) state.charts.speed.setSize({ width: w, height: 250 });
      if (state.charts.inputs) state.charts.inputs.setSize({ width: w, height: 210 });
    }, 120);
  });
}

document.addEventListener('DOMContentLoaded', init);
