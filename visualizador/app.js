'use strict';

/* ============================================================
   AC Telemetry Lab
   Carga CSV / .acreplay, gráficos sincronizados (uPlot),
   mapas y estadísticas por vuelta y de conjunto.
   ============================================================ */

const SYNC_KEY = 'ac-tele-lab';
const PALETA = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#c084fc', '#fde047'];
const G = 9.80665;
const N_SECTORES = 3;
const GRID_PUNTOS_MAX = 10000;      // puntos máximos de la grilla de distancia común
const GRID_PASO_MIN = 0.1;          // paso mínimo (m) entre puntos de la grilla
const ICONO_OJO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_TACHADO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

const ALIAS = {
  distance: ['distance', 'dist', 'distancia', 'lap_distance', 'distance_m', 'lapdist', 'dist_m'],
  time: ['timestamp', 'time', 't', 'tiempo', 'tiempo_s', 'time_s', 'tiempo_vuelta_s'],
  speed: ['speed', 'velocidad_kmh', 'velocidad', 'speed_kmh', 'vel', 'velocity_kmh', 'vkmh'],
  throttle: ['throttle', 'gas', 'acelerador', 'throttle_pct', 'gas_pct', 'acelerador_pct'],
  brake: ['brake', 'freno', 'brake_pct', 'freno_pct', 'frenado_pct'],
  gear: ['gear', 'marcha', 'ngear', 'gear_number'],
  rpm: ['rpm', 'revoluciones', 'engine_rpm'],
  steer: ['steer_angle', 'steer', 'volante', 'steering', 'steerangle'],
  x: ['x', 'pos_x', 'position_x', 'world_x', 'posx', 'positionx', 'pos_x_m', 'x_m'],
  y: ['pos_y', 'y', 'position_y', 'world_y', 'posy', 'positiony', 'pos_y_m', 'y_m', 'elevacion'],
  z: ['z', 'pos_z', 'position_z', 'world_z', 'posz', 'positionz', 'pos_z_m', 'z_m'],
  yaw: ['rot_y', 'rotation_y', 'yaw', 'roty'],
  fuel: ['fuel', 'combustible', 'nafta', 'fuel_level', 'fuel_nivel'],
  loadFL: ['carga_fl', 'load_fl', 'carga_di', 'load_fl_'],
  loadFR: ['carga_fr', 'load_fr', 'carga_dd'],
  loadRL: ['carga_rl', 'load_rl', 'carga_ti'],
  loadRR: ['carga_rr', 'load_rr', 'carga_td'],
};

const state = {
  laps: [],
  refId: null,
  lapBId: null,
  grid: [],
  gridStep: 1,
  maxDist: 0,
  idx: 0,
  dist: 0,
  playing: false,
  speedMult: 1,
  loop: true,
  raf: null,
  lastTs: 0,
  ultVms: 0,
  _tick: 0,
  colorIdx: 0,
  tab: 'vuelta',
  charts: { lines: [], inputs: [] },
  mapa: { canal: 'speed', frenada: true, cambios: false, tresD: false, rot: 0, alt: 3, visual: 'canal', bordes: true, zoom: 1, panX: 0, panY: 0, s0: 1, cx: 0, cy: 0, resetView: true, projKey: '', projRes: null },
  mapaSectores: { tresD: false, rot: 0, alt: 3 },
  pistaAi: null,
};

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  for (let i = 1; i < xs.length; i++) d[i] = d[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
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

function fmtTiempo(seg) {
  if (!Number.isFinite(seg)) return '';
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function colorMap(t) {
  t = clamp(t, 0, 1);
  const stops = [[0, [59, 130, 246]], [0.25, [34, 211, 238]], [0.5, [74, 222, 128]], [0.75, [250, 204, 21]], [1, [248, 113, 113]]];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      return `rgb(${Math.round(a[1][0] + (b[1][0] - a[1][0]) * k)},${Math.round(a[1][1] + (b[1][1] - a[1][1]) * k)},${Math.round(a[1][2] + (b[1][2] - a[1][2]) * k)})`;
    }
  }
  return 'rgb(248,113,113)';
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

function unwrap(rads) {
  const out = new Array(rads.length);
  if (!rads.length) return out;
  out[0] = Number.isFinite(rads[0]) ? rads[0] : 0;
  for (let i = 1; i < rads.length; i++) {
    let d = rads[i] - rads[i - 1];
    if (!Number.isFinite(d)) { out[i] = out[i - 1]; continue; }
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out[i] = out[i - 1] + d;
  }
  return out;
}

/** Rumbo a partir de posiciones (x, z), para CSVs sin columna de yaw. */
function rumboDePosiciones(x, z) {
  const n = Math.min(x.length, z.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) { out[i] = 0; continue; }
    if (!Number.isFinite(x[i]) || !Number.isFinite(x[i - 1]) || !Number.isFinite(z[i]) || !Number.isFinite(z[i - 1])) { out[i] = out[i - 1] || 0; continue; }
    out[i] = Math.atan2(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  return out;
}

/** Construye una "vuelta" común a partir de series crudas. */
function crearLap(name, s, visible = true) {
  const n = s.x.length;
  if (n < 2) throw new Error(`"${name}": muy pocas filas válidas.`);
  const dist = s.dist ? s.dist.slice() : distanciaAcumulada(s.x, s.z);
  const gasR = normalizarPedal(s.throttle);
  const frenoR = normalizarPedal(s.brake);
  const time = s.time || dist.map(() => NaN);
  const t0 = Number.isFinite(time[0]) ? time[0] : 0;
  const timeRel = time.map((v) => (Number.isFinite(v) ? v - t0 : NaN));

  // dt por frame (con respaldo)
  const dt = new Array(n);
  let dUlt = 0.12;
  for (let i = 0; i < n; i++) {
    const d = i > 0 ? timeRel[i] - timeRel[i - 1] : NaN;
    if (Number.isFinite(d) && d > 0 && d < 2) { dt[i] = d; dUlt = d; }
    else dt[i] = i === 0 ? dUlt : dt[i - 1] || dUlt;
  }

  const speedMs = s.speed.map((v) => (Number.isFinite(v) ? v / 3.6 : NaN));
  const yaw = unwrap(s.yaw && s.yaw.some((v) => Number.isFinite(v) && Math.abs(v) > 0.001)
    ? s.yaw
    : rumboDePosiciones(s.x, s.z));

  const accLong = new Array(n);
  const accLat = new Array(n);
  const accTotal = new Array(n);
  const MAX_G = 4;
  for (let i = 0; i < n; i++) {
    if (i === 0) { accLong[i] = 0; accLat[i] = 0; accTotal[i] = 0; continue; }
    const dv = speedMs[i] - speedMs[i - 1];
    const dY = yaw[i] - yaw[i - 1];
    const ax = Number.isFinite(dv) ? dv / dt[i] : NaN;
    const ay = Number.isFinite(speedMs[i]) ? speedMs[i] * (dY / dt[i]) : NaN;
    accLong[i] = clamp(ax, -MAX_G * G, MAX_G * G);
    accLat[i] = clamp(ay, -MAX_G * G, MAX_G * G);
    const a = Number.isFinite(ax) ? ax : 0;
    const b = Number.isFinite(ay) ? ay : 0;
    accTotal[i] = Math.hypot(a, b);
  }

  return {
    id: name + '#' + Math.random().toString(36).slice(2, 7),
    name,
    color: PALETA[state.colorIdx++ % PALETA.length],
    visible,
    enLista: true,
    raw: {
      x: s.x, z: s.z, y: s.y || dist.map(() => NaN), dist,
      speed: s.speed, throttle: gasR.valores, brake: frenoR.valores,
      gear: s.gear || dist.map(() => NaN), time: timeRel, dt,
      rpm: s.rpm || dist.map(() => NaN),
      steer: s.steer || dist.map(() => NaN),
      yaw, accLong, accLat, accTotal,
      loadFL: s.loadFL || dist.map(() => NaN),
      loadFR: s.loadFR || dist.map(() => NaN),
      loadRL: s.loadRL || dist.map(() => NaN),
      loadRR: s.loadRR || dist.map(() => NaN),
      fuel: s.fuel || dist.map(() => NaN),
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
    x: col('x'), z: col('z'), y: col('y'),
    speed: col('speed'), time: col('time'), gear: col('gear'),
    throttle: col('throttle'), brake: col('brake'),
    rpm: col('rpm'), steer: col('steer'), yaw: col('yaw'),
    loadFL: col('loadFL'), loadFR: col('loadFR'), loadRL: col('loadRL'), loadRR: col('loadRR'),
    fuel: col('fuel'),
  };
  if (cols.distance !== undefined) series.dist = col('distance');
  return crearLap(file.name.replace(/\.csv$/i, ''), series);
}

/* ---------- validez de vueltas ---------- */

const MOTIVO_ETIQUETA = { salida: 'salida', entrada: 'entrada', cortada: 'cortada', incompleta: 'incompleta' };

/** Clasifica (in situ) cada vuelta como valida o no, con su motivo.
 *  No cuentan: la salida/largada y la entrada a pits (primera/ultima lenta),
 *  ni las cortadas (recorrido < 90% de la distancia mediana). Cada item debe
 *  traer `dist` (m) y `vmedia` (m/s). Ver doc/Arquitectura.md, seccion 6. */
function clasificarVueltas(vueltas) {
  const n = vueltas.length;
  if (n < 2) { vueltas.forEach((v) => { v.valida = true; v.motivo = ''; }); return; }
  const mediana = (a) => { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
  const refDist = mediana(vueltas.map((v) => v.dist));
  const velRef = Math.max(0, ...vueltas.filter((v) => refDist > 0 && v.dist >= 0.9 * refDist).map((v) => v.vmedia));
  vueltas.forEach((v, i) => {
    const cortada = refDist > 0 && v.dist < 0.9 * refDist;
    const borde = i === 0 || i === n - 1;
    const lenta = borde && velRef > 0 && v.vmedia < 0.75 * velRef;
    if (lenta) { v.valida = false; v.motivo = i === 0 ? 'salida' : 'entrada'; }
    else if (cortada) { v.valida = false; v.motivo = borde ? 'incompleta' : 'cortada'; }
    else { v.valida = true; v.motivo = ''; }
  });
}

/* ---------- parser .acreplay v16 (navegador) ---------- */

const decodUtf8 = new TextDecoder('utf-8');

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7C00) >> 10;
  const f = h & 0x03FF;
  if (e === 0) return f === 0 ? (s ? -0 : 0) : (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

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
  f64();
  cadena(); cadena(); cadena();
  const numCars = u32();
  u32();
  const numFrames = u32();
  const numTrackObjects = u32();
  pos += (4 + 12 * numTrackObjects) * numFrames;

  const jugador = 0;
  let result = null;

  for (let c = 0; c < numCars; c++) {
    const carId = cadena();
    const piloto = cadena();
    cadena(); cadena(); cadena();
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

    const X = [], Y = [], Z = [], V = [], GE = [], GAS = [], FREN = [], VUELTA = [], TIME = [];
    const RPM = [], STEER = [], YAW = [], LF = [], RF = [], LR = [], RR = [], FUEL = [];
    for (let i = 0; i < frames; i++) {
      const o = pos;
      pos += 256;
      X.push(dv.getFloat32(o, true));
      Y.push(dv.getFloat32(o + 4, true));
      Z.push(dv.getFloat32(o + 8, true));
      YAW.push(halfToFloat(dv.getUint16(o + 12, true))); // rotación: 3×f16 (yaw, pitch, roll) en orden Y-X-Z
      const vx = halfToFloat(dv.getUint16(o + 164, true));
      const vy = halfToFloat(dv.getUint16(o + 166, true));
      const vz = halfToFloat(dv.getUint16(o + 168, true));
      V.push(Math.hypot(vx, vy, vz) * 3.6);
      RPM.push(halfToFloat(dv.getUint16(o + 170, true)));
      LF.push(halfToFloat(dv.getUint16(o + 204, true)));
      RF.push(halfToFloat(dv.getUint16(o + 206, true)));
      LR.push(halfToFloat(dv.getUint16(o + 208, true)));
      RR.push(halfToFloat(dv.getUint16(o + 210, true)));
      STEER.push(halfToFloat(dv.getUint16(o + 212, true)));
      TIME.push(dv.getUint32(o + 220, true) / 1000);
      FUEL.push(u8[o + 232]);
      GE.push(u8[o + 234]);
      GAS.push(u8[o + 244]);
      FREN.push(u8[o + 245]);
      VUELTA.push(u8[o + 246]);
      if (i < frames - 1) pos += 20 + wings * 4;
    }
    pos += wings * 4;
    const extra = u32();
    pos += extra * 8;

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
      const serie = { x: [], z: [], y: [], speed: [], throttle: [], brake: [], gear: [], time: [], rpm: [], steer: [], yaw: [], loadFL: [], loadFR: [], loadRL: [], loadRR: [], fuel: [] };
      for (const i of idxs) {
        serie.x.push(X[i]); serie.y.push(Y[i]); serie.z.push(Z[i]);
        serie.speed.push(V[i]); serie.throttle.push(GAS[i]); serie.brake.push(FREN[i]);
        serie.gear.push(GE[i]); serie.time.push(TIME[i]);
        serie.rpm.push(RPM[i]); serie.steer.push(STEER[i]); serie.yaw.push(YAW[i]);
        serie.loadFL.push(LF[i]); serie.loadFR.push(RF[i]); serie.loadRL.push(LR[i]); serie.loadRR.push(RR[i]);
        serie.fuel.push(FUEL[i]);
      }
      const distArr = distanciaAcumulada(serie.x, serie.z);
      const t = serie.time;
      const dur = t.length > 1 ? Math.max(...t) - Math.min(...t) : NaN;
      const dist = distArr.length ? distArr[distArr.length - 1] : NaN;
      vueltas.push({ name: `${piloto} · ${carId} · V${lap.lap}`, nVuelta: lap.lap, frames: idxs.length, tiempo: dur, dist, vmedia: dur > 0 && Number.isFinite(dist) ? dist / dur : 0, serie });
    }
    clasificarVueltas(vueltas);
    result = vueltas;
    break;
  }

  if (!result || !result.length) throw new Error(`${file.name}: no se encontraron vueltas en el replay.`);
  return result;
}

async function cargarArchivos(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  try {
    // La pista (fast_lane.ai) puede venir suelta o junto con el replay/CSV.
    const ais = files.filter((f) => /\.ai$/i.test(f.name));
    const restantes = files.filter((f) => !/\.ai$/i.test(f.name));
    if (ais.length) await cargarPistaAi(ais);

    const nuevas = [];
    for (const f of restantes) {
      if (/\.csv$/i.test(f.name)) {
        const lap = construirVueltaCSV(await parsearArchivoCSV(f));
        lap.csv = true;
        nuevas.push(lap);
      } else if (/\.acreplay$/i.test(f.name)) {
        const candidatas = await parsearReplay(f);
        const elegidas = await preguntarVueltas(f.name, candidatas); // Set de índices
        for (let i = 0; i < candidatas.length; i++) {
          const p = elegidas.has(i);
          const l = crearLap(candidatas[i].name, candidatas[i].serie, false);
          l.visible = p;     // aparece en gráficos/trazadas solo si fue elegida
          l.enLista = p;     // aparece en el panel lateral solo si fue elegida
          nuevas.push(l);
        }
      } else {
        throw new Error(`"${f.name}": extensión no soportada (CSV, .acreplay o fast_lane.ai).`);
      }
    }
    for (const l of nuevas) {
      const dist = l.raw.dist[l.raw.dist.length - 1];
      l.dist = Number.isFinite(dist) ? dist : NaN;
      const dur = tiempoDeVuelta(l);
      l.vmedia = dur > 0 && Number.isFinite(l.dist) ? l.dist / dur : 0;
    }
    clasificarVueltas(nuevas);
    for (const l of nuevas) if (l.csv) l.visible = l.valida;
    if (!nuevas.length) return;
    state.laps.push(...nuevas);
    const vs = visibleLaps();
    if (state.refId === null && vs.length) state.refId = vs[0].id;
    if (state.lapBId === null && vs.length > 1) state.lapBId = vs[1].id;
    ocultarError();
    if (puedeEntrar()) { mostrarDashboard(); recomputar(); }
    else mostrarError(FALTA_PISTA);
  } catch (e) {
    mostrarError(e.message || String(e));
  }
}

function preguntarVueltas(nombreArchivo, vueltas) {
  return new Promise((resolve) => {
    const modal = $('modal-selector');
    const prevFocus = document.activeElement || document.body;
    $('modal-archivo').textContent = nombreArchivo;
    const lista = $('modal-lista');
    lista.innerHTML = vueltas
      .map((v, i) =>
        `<label class="fila-vuelta">
           <input type="checkbox" data-i="${i}" />
           <span class="nombre">${v.name}</span>
           <span class="tiempo mono">${fmtTiempo(v.tiempo)}</span>
           <span class="frames mono">${v.frames} fr</span>
           ${v.motivo ? `<span class="badge-no" title="No cuenta (vuelta ${MOTIVO_ETIQUETA[v.motivo] || v.motivo})">${MOTIVO_ETIQUETA[v.motivo] || v.motivo}</span>` : ''}
         </label>`)
      .join('');

    const aviso = $('modal-aviso');
    aviso.textContent = '';

    const chkTodas = $('chk-todas');
    chkTodas.checked = false;
    const marcarRapidas = () => {
      const validas = vueltas.filter((v) => v.valida);
      const tiempos = validas.map((v) => v.tiempo).filter(Number.isFinite);
      const mejor = tiempos.length ? Math.min(...tiempos) : NaN;
      lista.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const v = vueltas[Number(cb.dataset.i)];
        cb.checked = Number.isFinite(mejor) && v.valida && Number.isFinite(v.tiempo) && v.tiempo <= mejor * 1.03;
      });
      aviso.textContent = '';
    };
    chkTodas.onchange = () => lista.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      const v = vueltas[Number(cb.dataset.i)];
      cb.checked = chkTodas.checked && !!v.valida;
    });
    $('btn-solo-rapidas').onclick = () => { marcarRapidas(); chkTodas.checked = false; };

    const cerrar = (elegidas) => {
      modal.classList.add('oculto');
      modal.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(elegidas);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(new Set()); return; }
      if (e.key === 'Tab') {
        const foc = modal.querySelectorAll('button, input[type="checkbox"], select, [tabindex]');
        if (!foc.length) return;
        const first = foc[0];
        const last = foc[foc.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    $('btn-modal-aceptar').onclick = () => {
      const elegidas = new Set(Array.from(lista.querySelectorAll('input[data-i]')).filter((cb) => cb.checked).map((cb) => Number(cb.dataset.i)));
      if (elegidas.size === 0) { aviso.textContent = 'Elegí al menos una vuelta (o Cancelar) para continuar.'; return; }
      cerrar(elegidas);
    };
    $('btn-modal-cancelar').onclick = () => cerrar(new Set());

    document.addEventListener('keydown', onKey);
    modal.classList.remove('oculto');
    modal.setAttribute('aria-hidden', 'false');
    $('btn-modal-aceptar').focus();
  });
}

/* ---------- recomputar malla común ---------- */

function visibleLaps() { return state.laps.filter((l) => l.visible); }
function lapRef() { const v = visibleLaps(); return v.find((l) => l.id === state.refId) || v[0] || null; }
function lapB() { const v = visibleLaps(); return v.find((l) => l.id === state.lapBId && l.id !== state.refId) || v.find((l) => l.id !== state.refId) || null; }

function recomputar() {
  const laps = state.laps;
  if (!laps.length) return;
  let maxDist = 0;
  for (const l of laps) maxDist = Math.max(maxDist, l.raw.dist[l.raw.dist.length - 1]);
  state.maxDist = maxDist;
  const step = Math.max(maxDist / GRID_PUNTOS_MAX, GRID_PASO_MIN);
  state.gridStep = step;
  const n = Math.floor(maxDist / step) + 1;
  const grid = new Array(n);
  for (let i = 0; i < n; i++) grid[i] = i * step;
  state.grid = grid;

  const RL = (d, v) => resampleLineal(d, v, grid);
  for (const l of laps) {
    const r = l.raw;
    l.grid = {
      speed: RL(r.dist, r.speed), throttle: RL(r.dist, r.throttle), brake: RL(r.dist, r.brake),
      gear: resampleCercano(r.dist, r.gear, grid), time: RL(r.dist, r.time),
      x: RL(r.dist, r.x), z: RL(r.dist, r.z), y: RL(r.dist, r.y),
      rpm: RL(r.dist, r.rpm), steer: RL(r.dist, r.steer), yaw: RL(r.dist, r.yaw),
      accLong: RL(r.dist, r.accLong), accLat: RL(r.dist, r.accLat), accTotal: RL(r.dist, r.accTotal),
      loadFL: RL(r.dist, r.loadFL), loadFR: RL(r.dist, r.loadFR),
      loadRL: RL(r.dist, r.loadRL), loadRR: RL(r.dist, r.loadRR),
      fuel: RL(r.dist, r.fuel),
    };
  }
  state.idx = Math.min(state.idx, grid.length - 1);
  state.dist = grid[state.idx] || 0;
  state.mapa.resetView = true;

  renderListaVueltas();
  renderReadoutsBase();
  renderTabActiva();
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
    if (l.enLista === false) return;
    const li = document.createElement('li');
    li.className = 'vuelta-item' + (l.id === state.refId ? ' ref' : '') + (l.visible ? '' : ' oculta');
    const tMeta = fmtTiempo(tiempoDeVuelta(l));
    li.innerHTML =
      `<span class="vuelta-color" style="background:${l.color}"></span>` +
      `<span class="vuelta-info">
         <span class="vuelta-nombre">${l.name}</span>
         <span class="vuelta-meta">${tMeta ? tMeta + ' · ' : ''}${l.raw.x.length} pts · ${l.raw.dist[l.raw.dist.length - 1].toFixed(0)} m</span>
       </span>` +
      (l.id === state.refId ? '<span class="ref-badge">REF</span>' : '') +
      (l.motivo ? `<span class="badge-no" title="No cuenta (vuelta ${MOTIVO_ETIQUETA[l.motivo] || l.motivo})">${MOTIVO_ETIQUETA[l.motivo] || l.motivo}</span>` : '') +
      `<button class="vuelta-eye ${l.visible ? 'on' : ''}" title="${l.visible ? 'Ocultar la vuelta' : 'Mostrar la vuelta'}" aria-label="${l.visible ? 'Ocultar la vuelta' : 'Mostrar la vuelta'}" aria-pressed="${!!l.visible}">${l.visible ? ICONO_OJO : ICONO_OJO_TACHADO}</button>`;
    li.querySelector('.vuelta-info').addEventListener('click', () => {
      state.refId = l.id; renderListaVueltas(); renderReadoutsBase(); updateUI();
    });
    const ojo = li.querySelector('.vuelta-eye');
    ojo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      l.visible = !l.visible;
      if (!l.visible && l.id === state.refId) { const v = visibleLaps(); state.refId = v.length ? v[0].id : null; }
      recomputar();
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

/* ---------- gráficos (uPlot) ---------- */

function opcionesGrafico(cont, height, yRango, yLabel) {
  const ancho = cont.clientWidth || cont.parentElement?.clientWidth || 900;
  return {
    width: ancho,
    height,
    padding: [8, 14, 0, 8],
    cursor: { sync: { key: SYNC_KEY }, drag: { x: true, y: false, setScale: false }, focus: { prox: 40 } },
    legend: { show: true, live: true },
    scales: { x: { time: false }, y: yRango ? { range: yRango } : { auto: true } },
    axes: [
      { stroke: '#8b97a8', grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' }, font: '12px "Segoe UI", sans-serif', label: 'Distancia (m)', labelFont: '12px "Segoe UI", sans-serif', size: 42, values: (u, vals) => vals.map((v) => Math.round(v)) },
      { stroke: '#8b97a8', grid: { stroke: 'rgba(255,255,255,0.05)' }, ticks: { stroke: '#2a3444' }, font: '12px "Segoe UI", sans-serif', label: yLabel, labelFont: '12px "Segoe UI", sans-serif', size: 52, labelSize: 26 },
    ],
    hooks: { setCursor: [onCursor] },
  };
}

/** Grafico de líneas: cada vuelta aporta N series sobre la malla común. */
function lineChart(cont, height, yRango, yLabel, laps, getSeries) {
  const data = [state.grid];
  const series = [{ label: 'Distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') }];
  for (const l of laps) {
    for (const s of getSeries(l)) {
      data.push(s.data);
      series.push(Object.assign({ stroke: l.color, width: 2, points: { show: false }, spanGaps: true }, s.opts || {}));
    }
  }
  const o = opcionesGrafico(cont, height, yRango, yLabel);
  o.series = series;
  const u = new uPlot(o, data, cont);
  state.charts.lines.push({ u, cont, height });
  return u;
}

function destroyCharts() {
  for (const r of state.charts.lines) r.u.destroy();
  state.charts.lines = [];
  for (const u of state.charts.inputs) u.destroy();
  state.charts.inputs = [];
}

function onCursor(u) {
  const idx = u.cursor.idx;
  if (idx == null || idx < 0 || idx >= state.grid.length) return;
  if (idx === state.idx) return; // cursor programático del play/scrub: no realimentar
  state.idx = idx; state.dist = state.grid[idx];
  updateUI({ moverCursor: false });
}

let _ultimoCursorPx = -1;
function moverCursor() {
  const u = state.charts.lines[0]?.u;
  if (!u) return;
  const left = u.valToPos(state.dist, 'x');
  if (Math.abs(left - _ultimoCursorPx) < 1) return;
  _ultimoCursorPx = left;
  u.setCursor({ left, top: u.over.height / 2 });
}

/* ---------- render por pestaña ---------- */

function renderTabActiva() {
  destroyCharts();
  _ultimoCursorPx = -1;
  if (!state.laps.length) return;
  if (state.tab === 'conjunto') {
    // No cuentan las vueltas de salida/largada ni las cortadas/incompletas.
    const lapsValidas = state.laps.filter((l) => l.valida);
    if (!lapsValidas.length) return;
    renderConjunto(lapsValidas);
    return;
  }
  const laps = visibleLaps();
  if (!laps.length) return;
  if (state.tab === 'vuelta') renderVuelta(laps);
  else if (state.tab === 'mapa') renderMapa(laps);
  else if (state.tab === 'comparacion') renderComparacion(laps);
}

function renderVuelta(laps) {
  lineChart($('chart-speed'), 250, null, 'km/h', laps, (l) => [{ data: l.grid.speed }]);
  lineChart($('chart-rpm'), 170, null, 'rpm', laps, (l) => [{ data: l.grid.rpm }]);
  lineChart($('chart-gear'), 140, null, 'marcha', laps, (l) => [{ data: l.grid.gear, opts: { paths: uPlot.paths.stepped({ align: 1 }) } }]);
  lineChart($('chart-steer'), 150, null, 'volante', laps, (l) => [{ data: l.grid.steer }]);
  lineChart($('chart-acc'), 150, [0, null], 'g', laps, (l) => [{ data: l.grid.accTotal.map((v) => (Number.isFinite(v) ? v / G : null)) }]);
  lineChart($('chart-yaw'), 140, null, 'rumbo (°)', laps, (l) => [{ data: l.grid.yaw.map((v) => (Number.isFinite(v) ? (v * 180) / Math.PI : null)) }]);

  const ref = lapRef();
  if (ref) {
    lineChart($('chart-load'), 170, [0, null], 'carga (N)', [ref], (l) => [
      { data: l.grid.loadFL, opts: { stroke: '#38bdf8', label: 'FL' } },
      { data: l.grid.loadFR, opts: { stroke: '#f472b6', label: 'FR' } },
      { data: l.grid.loadRL, opts: { stroke: '#4ade80', label: 'RL' } },
      { data: l.grid.loadRR, opts: { stroke: '#facc15', label: 'RR' } },
    ]);
  }

  // Acelerador / Freno por vuelta
  const cIn = $('chart-inputs');
  cIn.innerHTML = '';
  laps.forEach((l) => {
    const caja = document.createElement('div');
    caja.className = 'mini-grafico';
    caja.innerHTML = `<div class="mini-titulo" style="color:${l.color}">${l.name}</div>`;
    const div = document.createElement('div');
    div.className = 'plot'; div.style.height = '140px';
    caja.appendChild(div); cIn.appendChild(caja);
    const oIn = opcionesGrafico(div, 140, [0, 1.05], '0–1');
    oIn.series = [
      { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') },
      { label: 'gas', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
      { label: 'freno', stroke: '#f87171', width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
    ];
    state.charts.inputs.push(new uPlot(oIn, [state.grid, l.grid.throttle, l.grid.brake], div));
  });

  drawTraction(laps);
}

function renderMapa(laps) {
  drawMap();
  const ref = lapRef();
  if (ref) dibujarAutoCarga(ref, state.idx);
}

function renderConjunto(laps) {
  const ref = lapRef();
  drawBarrasTiempos(laps);
  drawVelMedia(laps);
  drawEnvolvente(laps);
  drawHistVel(laps);
  drawHistMarchas(laps);
  drawFuel(laps);
  drawDesvioLateral(laps, ref);
  drawSectores(laps);
  drawMapaSectores();
  drawMapaTeorico(laps);
  renderTablaResumen(laps);
  renderTeorica(laps);
}

function poblarSelB() {
  const sel = $('sel-lap-b');
  if (!sel) return;
  const laps = visibleLaps();
  if (!laps.some((l) => l.id === state.lapBId)) {
    const sig = laps.find((l) => l.id !== state.refId);
    state.lapBId = sig ? sig.id : (laps[0] || { id: null }).id;
  }
  const vsA = $('vs-a');
  const ref = lapRef();
  sel.innerHTML = laps.map((l) => `<option value="${l.id}"${l.id === state.lapBId ? ' selected' : ''}>${l.name}</option>`).join('');
  if (vsA) vsA.textContent = ref ? ref.name : '–';
}

function renderComparacion(laps) {
  const A = lapRef();
  poblarSelB();
  const B = lapB();
  if (!A || !B || A.id === B.id) { drawDelta(null); drawDVel(null); drawDPed(null); drawMiniDelta(null); return; }
  drawDelta([A, B]);
  drawDVel([A, B]);
  drawDPed([A, B]);
  drawMiniDelta([A, B]);
}

/* ---------- canvas helpers ---------- */

function prepCanvas(id, fallbackH) {
  const cv = $(id);
  if (!cv) return null;
  const w = cv.clientWidth || cv.parentElement?.clientWidth || 600;
  const h = cv.clientHeight || fallbackH || 260;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { cv, ctx, w, h };
}

function drawTraction(laps) {
  const c = prepCanvas('chart-traction', 300);
  if (!c) return;
  const { ctx, w, h } = c;
  const pts = [];
  for (const l of laps) {
    const { accLong, accLat } = l.raw;
    const step = Math.max(1, Math.floor(accLong.length / 1500));
    for (let i = 0; i < accLong.length; i += step) {
      if (!Number.isFinite(accLong[i]) || !Number.isFinite(accLat[i])) continue;
      pts.push([accLong[i] / G, accLat[i] / G, l.color]);
    }
  }
  let maxG = 1;
  if (pts.length) {
    const esc = pts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]).sort((a, b) => a - b);
    maxG = Math.max(1, Math.ceil(esc[Math.floor(esc.length * 0.99)]));
  }
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 24;
  const sx = (v) => cx + (v / maxG) * R;
  const sy = (v) => cy - (v / maxG) * R;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  for (const r of [0.5, 1]) { ctx.beginPath(); ctx.arc(cx, cy, (r * R), 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('acel.', cx + R - 34, cy - 8); ctx.fillText('frena', cx - R + 6, cy - 8);
  ctx.fillText('izq.', cx - 16, cy + R - 8); ctx.fillText('der.', cx - 18, cy - R + 16);
  for (const [x, y, color] of pts) { ctx.fillStyle = hexA(color, 0.25); ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2); }
  ctx.fillStyle = '#8b97a8'; ctx.fillText(`escala ±${maxG} g`, 8, 14);
}

/* ---------- carga por rueda ---------- */

const RUEDAS = [
  { k: 'loadFL', l: 'FL', c: '#38bdf8', u: [-1, -1] },
  { k: 'loadFR', l: 'FR', c: '#f472b6', u: [1, -1] },
  { k: 'loadRL', l: 'RL', c: '#4ade80', u: [-1, 1] },
  { k: 'loadRR', l: 'RR', c: '#facc15', u: [1, 1] },
];

function redondeado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cargaPuntosMax(lap) {
  if (!lap._cargaMax) {
    let m = 0;
    for (const r of RUEDAS) { const arr = lap.grid[r.k]; if (arr) for (const v of arr) if (Number.isFinite(v) && v > m) m = v; }
    lap._cargaMax = m || 1;
  }
  return lap._cargaMax;
}

/* Auto en vivo: las 4 ruedas se llenan según la carga en el instante actual. */
function dibujarAutoCarga(lap, i) {
  const c = prepCanvas('chart-carga-vivo', 240);
  if (!c || !lap) return;
  const { ctx, w, h } = c;
  const maxC = cargaPuntosMax(lap);
  const ancho = Math.min(w * 0.56, 240), alto = Math.min(h * 0.5, 130);
  const cx = w / 2, cy = h / 2 + 6;
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('Carga por rueda · ' + lap.name, 8, 16);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b97a8';
  ctx.fillText('▲ adelante', cx, cy - alto / 2 - 14);
  ctx.textAlign = 'left';
  const rw = Math.min(ancho * 0.16, 34), rh = Math.min(alto * 0.22, 20);
  // cuerpo del auto primero (las ruedas se dibujan encima)
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  redondeado(ctx, cx - ancho / 2, cy - alto / 2, ancho, alto, ancho * 0.18); ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  // capó (lado delantero) más claro
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  redondeado(ctx, cx - ancho * 0.36, cy - alto / 2 + 2, ancho * 0.72, alto * 0.18, 8); ctx.fill();
  for (const r of RUEDAS) {
    const rx = cx + (r.u[0] * ancho) / 2 - rw / 2;
    const ry = cy + (r.u[1] * alto) / 2 - rh / 2;
    const v = lap.grid[r.k] ? lap.grid[r.k][i] : NaN;
    const frac = Number.isFinite(v) ? clamp(v / maxC, 0, 1) : 0;
    // neumático (fondo oscuro)
    ctx.fillStyle = '#1c2430';
    redondeado(ctx, rx - 2, ry - 2, rw + 4, rh + 4, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // carga dentro del neumático
    if (Number.isFinite(v) && frac > 0.02) {
      const offY = Math.round((1 - frac) * (rh - 2));
      ctx.fillStyle = colorMap(frac);
      redondeado(ctx, rx, ry + offY, rw, Math.max(2, Math.round((rh - 2) * frac)), 4); ctx.fill();
    } else if (Number.isFinite(v)) {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      redondeado(ctx, rx, ry, rw, Math.max(2, Math.round(rh * 0.06)), 2); ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = r.c; ctx.font = 'bold 13px "Segoe UI"';
    ctx.fillText(r.l, rx + rw / 2, ry + rh + 16);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(Number.isFinite(v) ? Math.round(v).toLocaleString() : '–', rx + rw / 2, ry + rh + 30);
    ctx.textAlign = 'left';
  }
  // leyenda de escala
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  ctx.fillText('0', 10, h - 6);
  ctx.fillText(maxC.toLocaleString() + ' N (máx)', w - 92, h - 6);
  for (let k2 = 0; k2 < w - 102 - 10 - 4; k2++) { ctx.fillStyle = colorMap(k2 / Math.max(w - 102 - 10 - 4, 1)); ctx.fillRect(10 + k2, h - 12, 1, 3); }
}

function drawBarrasTiempos(laps) {
  const c = prepCanvas('ch-barras-tiempos', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const datos = laps.map((l) => ({ name: l.name, t: tiempoDeVuelta(l), color: l.color })).filter((d) => Number.isFinite(d.t) && d.t > 0);
  if (!datos.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos', 12, 20); return; }
  datos.sort((a, b) => a.t - b.t);
  const mejor = datos[0].t;
  const maxT = Math.max(...datos.map((d) => d.t));
  const pad = 8, izq = 150, filaH = Math.min(30, (h - pad * 2) / datos.length);
  const anchoMax = w - izq - 70;
  datos.forEach((d, i) => {
    const y = pad + i * filaH;
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText(d.name.slice(0, 24), 6, y + filaH * 0.62);
    const bw = (d.t / maxT) * anchoMax;
    ctx.fillStyle = hexA(d.color, 0.85); ctx.fillRect(izq, y + 3, bw, filaH - 8);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(fmtTiempo(d.t) + (i ? '  (+' + (d.t - mejor).toFixed(2) + ')' : '  MEJOR'), izq + bw + 6, y + filaH * 0.62);
  });
  const media = datos.reduce((a, d) => a + d.t, 0) / datos.length;
  const sd = Math.sqrt(datos.reduce((a, d) => a + (d.t - media) ** 2, 0) / datos.length);
  ctx.fillStyle = '#8b97a8'; ctx.font = '12px "Segoe UI"';
  ctx.fillText(`consistencia (σ) = ${sd.toFixed(3)} s   ·   promedio ${fmtTiempo(media)}`, 6, h - 4);
}

function drawVelMedia(laps) {
  const c = prepCanvas('ch-velmedia', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  const datos = laps.map((l) => {
    const g = l.grid.speed.filter(Number.isFinite);
    const avg = g.reduce((a, v) => a + v, 0) / (g.length || 1);
    const mx = Math.max(...g);
    return { name: l.name, avg, mx, color: l.color };
  });
  const maxV = Math.max(...datos.map((d) => d.mx), 1);
  const pad = 8, izq = 150, filaH = Math.min(30, (h - pad * 2) / datos.length), anchoMax = w - izq - 70;
  datos.forEach((d, i) => {
    const y = pad + i * filaH;
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText(d.name.slice(0, 24), 6, y + filaH * 0.62);
    ctx.fillStyle = hexA(d.color, 0.85); ctx.fillRect(izq, y + 3, (d.avg / maxV) * anchoMax, filaH - 8);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(`${d.avg.toFixed(1)} km/h  (máx ${d.mx.toFixed(0)})`, izq + (d.avg / maxV) * anchoMax + 6, y + filaH * 0.62);
  });
}

function drawEnvolvente(laps) {
  const cont = $('chart-env');
  if (!cont || !state.grid.length) return;
  const n = state.grid.length;
  const min = new Array(n).fill(Infinity), max = new Array(n).fill(-Infinity), avg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (const l of laps) { const v = l.grid.speed[i]; if (Number.isFinite(v)) { s += v; c++; if (v < min[i]) min[i] = v; if (v > max[i]) max[i] = v; } }
    avg[i] = c ? s / c : null;
    if (!c) { min[i] = null; max[i] = null; }
  }
  const o = opcionesGrafico(cont, 200, null, 'km/h');
  o.series = [
    { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') },
    { label: 'mín', stroke: '#f87171', width: 1.5, points: { show: false }, spanGaps: true },
    { label: 'prom', stroke: '#22d3ee', width: 2, points: { show: false }, spanGaps: true },
    { label: 'máx', stroke: '#4ade80', width: 1.5, points: { show: false }, spanGaps: true },
  ];
  state.charts.lines.push({ u: new uPlot(o, [state.grid, min, avg, max], cont), cont, height: 200 });
}

function drawHistVel(laps) {
  const c = prepCanvas('ch-histvel', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const vals = [];
  for (const l of laps) for (const v of l.raw.speed) if (Number.isFinite(v)) vals.push(v);
  if (!vals.length) return;
  const min = 0, max = Math.max(...vals);
  const bins = 30, conteo = new Array(bins).fill(0);
  for (const v of vals) conteo[clamp(Math.floor(((v - min) / (max - min || 1)) * bins), 0, bins - 1)]++;
  const cmax = Math.max(...conteo, 1);
  const pad = 24, bw = (w - pad * 2) / bins;
  for (let i = 0; i < bins; i++) {
    const bh = (conteo[i] / cmax) * (h - pad * 2);
    ctx.fillStyle = colorMap(i / (bins - 1));
    ctx.fillRect(pad + i * bw, h - pad - bh, bw - 1, bh);
  }
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('0', pad, h - 8); ctx.fillText(max.toFixed(0) + ' km/h', w - pad - 50, h - 8);
}

function drawHistMarchas(laps) {
  const c = prepCanvas('ch-histgear', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const gears = [];
  for (const l of laps) for (const g of l.raw.gear) if (Number.isFinite(g)) gears.push(Math.round(g));
  if (!gears.length) return;
  const maxG = Math.max(...gears, 1), minG = Math.min(...gears, 0);
  const n = maxG - minG + 1;
  const conteo = new Array(n).fill(0);
  for (const g of gears) conteo[g - minG]++;
  const cmax = Math.max(...conteo, 1);
  const pad = 24, bw = (w - pad * 2) / n;
  for (let i = 0; i < n; i++) {
    const bh = (conteo[i] / cmax) * (h - pad * 2);
    ctx.fillStyle = colorMap(i / (n - 1));
    ctx.fillRect(pad + i * bw + 2, h - pad - bh, bw - 4, bh);
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText(String(i + minG), pad + i * bw + bw / 2 - 3, h - 8);
  }
  ctx.fillStyle = '#8b97a8'; ctx.fillText('marcha', 4, 14);
}

function drawFuel(laps) {
  const c = prepCanvas('ch-fuel', 200);
  if (!c) return;
  const { ctx, w, h } = c;
  const datos = laps.map((l) => {
    const f = l.raw.fuel.filter(Number.isFinite);
    const usado = f.length > 1 ? Math.max(0, f[0] - f[f.length - 1]) : 0;
    return { name: l.name, usado, color: l.color };
  });
  const maxU = Math.max(...datos.map((d) => d.usado), 1);
  const pad = 8, izq = 150, filaH = Math.min(30, (h - pad * 2) / datos.length), anchoMax = w - izq - 70;
  datos.forEach((d, i) => {
    const y = pad + i * filaH;
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText(d.name.slice(0, 24), 6, y + filaH * 0.62);
    ctx.fillStyle = hexA(d.color, 0.85); ctx.fillRect(izq, y + 3, (d.usado / maxU) * anchoMax, filaH - 8);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '11px "Consolas", monospace';
    ctx.fillText(d.usado.toFixed(1) + ' u', izq + (d.usado / maxU) * anchoMax + 6, y + filaH * 0.62);
  });
  if (!datos.length) ctx.fillText('sin datos de combustible', 12, 20);
}

function drawDesvioLateral(laps, ref) {
  const cont = $('chart-lat');
  if (!cont || !ref || !state.grid.length) return;
  const series = []; const data = [state.grid];
  for (const l of laps) {
    if (l === ref) continue;
    const dev = state.grid.map((_, i) => {
      const dx = l.grid.x[i] - ref.grid.x[i];
      const dz = l.grid.z[i] - ref.grid.z[i];
      return Number.isFinite(dx) && Number.isFinite(dz) ? Math.hypot(dx, dz) : null;
    });
    data.push(dev);
    series.push({ label: l.name, stroke: l.color, width: 2, points: { show: false }, spanGaps: true });
  }
  const o = opcionesGrafico(cont, 200, [0, null], 'desvío (m)');
  o.series = [{ label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') }, ...series];
  state.charts.lines.push({ u: new uPlot(o, data, cont), cont, height: 200 });
}

function sectorTimes(l) {
  const out = new Array(N_SECTORES);
  const corte = state.maxDist / N_SECTORES;
  for (let s = 0; s < N_SECTORES; s++) {
    const d0 = s * corte, d1 = (s + 1) * corte;
    const i0 = clamp(Math.round(d0 / state.gridStep), 0, state.grid.length - 1);
    const i1 = clamp(Math.round(d1 / state.gridStep), 0, state.grid.length - 1);
    const t0 = l.grid.time[i0], t1 = l.grid.time[i1];
    out[s] = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0 ? t1 - t0 : NaN;
  }
  return out;
}

function drawSectores(laps) {
  const c = prepCanvas('ch-sectores', 260);
  if (!c) return;
  const { ctx, w, h, cv } = c;
  const mat = laps.map((l) => ({ l, s: sectorTimes(l) }));
  const todos = mat.flatMap((m) => m.s).filter(Number.isFinite);
  if (!todos.length) { ctx.fillStyle = '#8b97a8'; ctx.fillText('sin tiempos de sector', 12, 20); return; }
  const maxS = Math.max(...todos);
  const pad = 28, groupW = (w - pad * 2) / N_SECTORES;
  const barW = groupW / (mat.length + 1);
  const mejores = new Array(N_SECTORES).fill(null);
  const rects = [];
  mat.forEach((m, li) => m.s.forEach((v, si) => {
    if (!Number.isFinite(v)) return;
    if (!mejores[si] || v < mejores[si].v) mejores[si] = { v, name: m.l.name, color: m.l.color };
    const x = pad + si * groupW + li * barW + 2;
    const bh = (v / maxS) * (h - pad * 2 - 12);
    ctx.fillStyle = hexA(m.l.color, 0.9);
    ctx.fillRect(x, h - pad - bh, barW - 2, bh);
    rects.push({ x, y: h - pad - bh, w: barW - 2, h: bh, v, name: m.l.name, color: m.l.color, sector: si });
  }));
  ctx.textAlign = 'center';
  for (let s = 0; s < N_SECTORES; s++) {
    const cx = pad + s * groupW + groupW / 2;
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText('S' + (s + 1), cx, h - 15);
    if (mejores[s]) {
      ctx.fillStyle = mejores[s].color; ctx.font = '10px "Consolas", monospace';
      ctx.fillText(fmtTiempo(mejores[s].v), cx, h - 3);
    }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
  ctx.fillText('tiempo por sector (s)', 4, 14);
  cv._sectRects = rects;
  cv.onmousemove = hoverSectores;
  cv.onmouseleave = ocultarTooltip;
}

function hoverSectores(ev) {
  const cv = ev.currentTarget;
  const tt = $('tt-sectores');
  if (!tt || !cv._sectRects) return;
  const card = cv.parentElement;
  const r = card.getBoundingClientRect();
  const rect = cv._sectRects.find((b) =>
    ev.offsetX >= b.x && ev.offsetX <= b.x + b.w && ev.offsetY >= b.y && ev.offsetY <= b.y + b.h);
  if (!rect) { tt.hidden = true; return; }
  tt.textContent = `S${rect.sector + 1} · ${rect.name}: ${fmtTiempo(rect.v)}`;
  tt.style.left = `${ev.clientX - r.left + 14}px`;
  tt.style.top = `${ev.clientY - r.top + 12}px`;
  if (tt.hidden) tt.hidden = false;
}

function ocultarTooltip() {
  const tt = $('tt-sectores');
  if (tt) tt.hidden = true;
}

/* Mapa de Conjunto: la vuelta REF dividida con el mismo corte de distancia
   que usa "Tiempo por sector" (state.maxDist / N_SECTORES). */
function drawMapaSectores() {
  const ref = lapRef();
  const c = prepCanvas('ch-mapa-sectores', 260);
  if (!c || !ref || !ref.grid) return;
  const { ctx, w, h } = c;
  const p = proyectarLaps([ref], state.mapaSectores);
  const view = construirVistaLocal(c, p);
  const corte = state.maxDist / N_SECTORES;
  const gx = ref.grid.x, gz = ref.grid.z, gy = ref.grid.y;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (state.mapa.bordes) drawBordePista(ctx, view.tf, view.proj, envPista([ref]));
  const ptsBySector = Array.from({ length: N_SECTORES }, () => []);
  for (let i = 0; i < gx.length; i++) {
    const s = Math.min(Math.floor(state.grid[i] / corte), N_SECTORES - 1);
    ptsBySector[s].push(view.tf(...view.proj(gx[i], gz[i], gy[i])));
  }
  for (let s = 0; s < N_SECTORES; s++) {
    const pts = ptsBySector[s];
    if (!pts.length) continue;
    ctx.strokeStyle = colorMap(s / (N_SECTORES - 1));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = '10px "Segoe UI"';
  for (let s = 1; s < N_SECTORES; s++) {
    const i = clamp(Math.round((s * corte) / state.gridStep), 0, gx.length - 1);
    const [px, py] = view.tf(...view.proj(gx[i], gz[i], gy[i]));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('S' + (s + 1), px, py - 8);
  }
  const [mx, my] = view.tf(...view.proj(ref.raw.x[0], ref.raw.z[0], ref.raw.y[0]));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b97a8';
  ctx.fillText('S/F', mx + 8, my - 6);
  ctx.textAlign = 'left'; ctx.font = '10px "Segoe UI"';
  ctx.fillStyle = '#8b97a8';
  ctx.fillText('S1', 8, h - 8);
  ctx.fillText('S' + N_SECTORES, w - 30, h - 8);
  for (let k = 0; k < w - 58 && k > 0; k++) { ctx.fillStyle = colorMap(k / Math.max(w - 58, 1)); ctx.fillRect(24 + k, h - 14, 1, 4); }
}

/* Trazada compuesta: junta el tramo del mejor sector de cada vuelta en una sola línea
   (mismo corte de distancia que "Tiempo por sector" y "Mapa por sectores").
   Cada tramo se pinta con el color del sector, sobre una base tenue de todas las vueltas. */
function construirTrazada(laps) {
  const p = proyectarLaps(laps, state.mapaSectores);
  const corte = state.maxDist / N_SECTORES;
  const n = state.grid.length;
  const matriz = laps.map((l) => ({ l, s: sectorTimes(l), gx: l.grid.x, gz: l.grid.z, gy: l.grid.y }));
  const tramos = [];
  for (let s = 0; s < N_SECTORES; s++) {
    let best = null;
    for (const m of matriz) if (Number.isFinite(m.s[s]) && (!best || m.s[s] < best.s[s])) best = m;
    if (!best) continue;
    const i0 = clamp(Math.round((s * corte) / state.gridStep), 0, n - 1);
    const i1 = clamp(Math.round(((s + 1) * corte) / state.gridStep), 0, n - 1);
    tramos.push({ s, best, i0, i1 });
  }
  const env = envPista(laps);
  return { p, corte, n, matriz, tramos, env };
}

function pintarTrazada(ctx, w, h, view, data) {
  const { matriz, tramos } = data;
  if (!tramos.length) return;

  // pista de fondo (silueta gris)
  if (data.env) drawBordePista(ctx, view.tf, view.proj, data.env);

  // base tenue: todas las trazadas
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  for (const m of matriz) {
    ctx.beginPath();
    for (let i = 0; i < m.gx.length; i++) {
      const [px, py] = view.tf(...view.proj(m.gx[i], m.gz[i], m.gy[i]));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5;
  for (const t of tramos) {
    ctx.strokeStyle = colorMap(t.s / (N_SECTORES - 1));
    ctx.beginPath();
    let first = true;
    for (let i = t.i0; i <= t.i1; i++) {
      const [px, py] = view.tf(...view.proj(t.best.gx[i], t.best.gz[i], t.best.gy[i]));
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // marcadores de frontera de sector + largada
  ctx.textAlign = 'center'; ctx.font = '10px "Segoe UI"';
  for (let s = 1; s < N_SECTORES; s++) {
    const i = clamp(Math.round((s * data.corte) / state.gridStep), 0, data.n - 1);
    const t = tramos[Math.min(s, tramos.length - 1)] || tramos[0];
    if (!t) continue;
    const [px, py] = view.tf(...view.proj(t.best.gx[i], t.best.gz[i], t.best.gy[i]));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('S' + (s + 1), px, py - 8);
  }
  const t0 = tramos[0];
  if (t0) {
    const [mx, my] = view.tf(...view.proj(t0.best.gx[t0.i0], t0.best.gz[t0.i0], t0.best.gy[t0.i0]));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#8b97a8';
    ctx.fillText('S/F', mx + 8, my - 6);
  }

  // leyenda: paleta de sectores + vueltas usadas
  ctx.textAlign = 'left'; ctx.font = '10px "Segoe UI"'; ctx.fillStyle = '#8b97a8';
  const usadas = [...new Set(tramos.map((t) => t.best.l.name))];
  const resumen = usadas.length === 1 ? `mejor vuelta: ${usadas[0]}` : `mejores sectores de: ${usadas.join(', ')}`;
  ctx.fillText(resumen.slice(0, 90), 8, 14);
  for (let k = 0; k < w - 58 && k > 0; k++) { ctx.fillStyle = colorMap(k / Math.max(w - 58, 1)); ctx.fillRect(24 + k, h - 14, 1, 4); }
  ctx.fillStyle = '#8b97a8';
  ctx.textAlign = 'left'; ctx.fillText('S1', 8, h - 8);
  ctx.fillText('S' + N_SECTORES, w - 30, h - 8);
}

function drawMapaTeorico(laps) {
  const c = prepCanvas('ch-mapa-teorico', 260);
  if (!c) return;
  if (!laps.length) return;
  const data = construirTrazada(laps);
  const view = construirVistaLocal(c, data.p);
  pintarTrazada(c.ctx, c.w, c.h, view, data);
}

/* Overlay ampliable de la trazada con zoom (rueda) y paneo (arrastre). */
const zoomTeorico = { abierto: false, zoom: 1, panX: 0, panY: 0, data: null, arrastrando: false, lx: 0, ly: 0 };

function dibujarZoomTeorico() {
  const cv = $('ch-mapa-zoom');
  if (!cv || !zoomTeorico.data) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx || !ctx.setTransform) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const base = construirVistaLocal(cv, zoomTeorico.data.p);
  const z = zoomTeorico.zoom, ox = zoomTeorico.panX, oy = zoomTeorico.panY;
  const tf = (px, py) => {
    const [x0, y0] = base.tf(px, py);
    return [w / 2 + (x0 - w / 2) * z + ox, h / 2 + (y0 - h / 2) * z + oy];
  };
  pintarTrazada(ctx, w, h, { proj: zoomTeorico.data.p.proj, tf }, zoomTeorico.data);
  const nivel = $('zoom-nivel');
  if (nivel) nivel.textContent = Math.round(z * 100) + '%';
}

function abrirZoomTeorico() {
  const laps = state.laps.filter((l) => l.valida);
  if (!laps.length) return;
  zoomTeorico.data = construirTrazada(laps);
  zoomTeorico.zoom = 1; zoomTeorico.panX = 0; zoomTeorico.panY = 0;
  const ov = $('zoom-teorico');
  if (!ov) return;
  ov.classList.remove('oculto');
  ov.setAttribute('aria-hidden', 'false');
  zoomTeorico.abierto = true;
  dibujarZoomTeorico();
  $('zoom-cerrar')?.focus();
}

function cerrarZoomTeorico() {
  const ov = $('zoom-teorico');
  if (!ov) return;
  ov.classList.add('oculto');
  ov.setAttribute('aria-hidden', 'true');
  zoomTeorico.abierto = false;
}

function zoomTeoricoFactor(factor, mx, my) {
  const cv = $('ch-mapa-zoom');
  if (!cv) return;
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  if (mx == null) { mx = w / 2; my = h / 2; }
  const z0 = zoomTeorico.zoom;
  const z1 = clamp(z0 * factor, 0.4, 20);
  const k = z1 / z0;
  zoomTeorico.panX = mx - w / 2 - (mx - w / 2 - zoomTeorico.panX) * k;
  zoomTeorico.panY = my - h / 2 - (my - h / 2 - zoomTeorico.panY) * k;
  zoomTeorico.zoom = z1;
  dibujarZoomTeorico();
}

function initZoomTeorico() {
  $('btn-zoom-teorico')?.addEventListener('click', abrirZoomTeorico);
  $('ch-mapa-teorico')?.addEventListener('click', abrirZoomTeorico);
  $('zoom-cerrar')?.addEventListener('click', cerrarZoomTeorico);
  $('zoom-in')?.addEventListener('click', () => zoomTeoricoFactor(1.25));
  $('zoom-out')?.addEventListener('click', () => zoomTeoricoFactor(1 / 1.25));
  $('zoom-reset')?.addEventListener('click', () => { zoomTeorico.zoom = 1; zoomTeorico.panX = 0; zoomTeorico.panY = 0; dibujarZoomTeorico(); });
  const ov = $('zoom-teorico');
  ov?.addEventListener('click', (e) => { if (e.target === ov) cerrarZoomTeorico(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && zoomTeorico.abierto) cerrarZoomTeorico(); });
  const cv = $('ch-mapa-zoom');
  if (!cv) return;
  cv.addEventListener('wheel', (e) => {
    if (!zoomTeorico.abierto) return;
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomTeoricoFactor(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    if (!zoomTeorico.abierto) return;
    zoomTeorico.arrastrando = true; zoomTeorico.lx = e.clientX; zoomTeorico.ly = e.clientY;
    cv.setPointerCapture?.(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!zoomTeorico.arrastrando) return;
    zoomTeorico.panX += e.clientX - zoomTeorico.lx;
    zoomTeorico.panY += e.clientY - zoomTeorico.ly;
    zoomTeorico.lx = e.clientX; zoomTeorico.ly = e.clientY;
    dibujarZoomTeorico();
  });
  const soltar = () => { zoomTeorico.arrastrando = false; };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', soltar);
  window.addEventListener('resize', () => { if (zoomTeorico.abierto) dibujarZoomTeorico(); });
}

function renderTablaResumen(laps) {
  const cont = $('tabla-resumen');
  if (!cont) return;
  const filas = laps.map((l) => {
    const g = l.grid;
    const fin = (arr) => arr.filter(Number.isFinite);
    const avgSpeed = fin(g.speed).reduce((a, v) => a + v, 0) / (fin(g.speed).length || 1);
    const maxSpeed = Math.max(...fin(g.speed), 0);
    const gas = fin(g.throttle).reduce((a, v) => a + v, 0) / (fin(g.throttle).length || 1);
    const freno = fin(g.brake).reduce((a, v) => a + v, 0) / (fin(g.brake).length || 1);
    const gLat = Math.max(...fin(g.accLat).map(Math.abs), 0) / G;
    const rpm = fin(g.rpm).reduce((a, v) => a + v, 0) / (fin(g.rpm).length || 1);
    const fuel = fin(l.raw.fuel);
    const usado = fuel.length > 1 ? fuel[0] - fuel[fuel.length - 1] : NaN;
    return { name: l.name, t: tiempoDeVuelta(l), avgSpeed, maxSpeed, gas, freno, gLat, rpm, usado };
  });
  const mejor = Math.min(...filas.map((f) => f.t).filter(Number.isFinite));
  cont.innerHTML =
    '<table><thead><tr><th>Vuelta</th><th>Tiempo</th><th>Vel.media</th><th>Vel.máx</th><th>Gas%</th><th>Freno%</th><th>g lat</th><th>RPM</th><th>Fuel</th></tr></thead><tbody>' +
    filas
      .map((f) => `<tr><td>${f.name}</td><td class="mono">${fmtTiempo(f.t)}${Number.isFinite(mejor) && f.t > mejor ? ' <span class="delta">+' + (f.t - mejor).toFixed(2) + '</span>' : ''}</td><td>${f.avgSpeed.toFixed(1)}</td><td>${f.maxSpeed.toFixed(0)}</td><td>${(f.gas * 100).toFixed(0)}</td><td>${(f.freno * 100).toFixed(0)}</td><td>${f.gLat.toFixed(2)}</td><td>${f.rpm.toFixed(0)}</td><td>${Number.isFinite(f.usado) ? f.usado.toFixed(1) : '–'}</td></tr>`)
      .join('') +
    '</tbody></table>';
}

function renderTeorica(laps) {
  const cont = $('teorica');
  if (!cont) return;
  const matriz = laps.map((l) => ({ l, s: sectorTimes(l) }));
  let total = 0, valido = true;
  for (let s = 0; s < N_SECTORES; s++) {
    const vals = matriz.map((m) => m.s[s]).filter(Number.isFinite);
    if (!vals.length) { valido = false; break; }
    total += Math.min(...vals);
  }
  const real = Math.min(...matriz.map((m) => tiempoDeVuelta(m.l)).filter(Number.isFinite));
  cont.innerHTML = valido
    ? `<div class="teorica-fila"><span>Vuelta teórica (mejor sector de cada vuelta)</span><strong class="mono">${fmtTiempo(total)}</strong></div>
       <div class="teorica-fila"><span>Mejor vuelta real</span><strong class="mono">${fmtTiempo(real)}</strong></div>
       <div class="teorica-fila"><span>Potencial a ganar</span><strong class="mono">${Number.isFinite(real) ? (real - total).toFixed(3) + ' s' : '–'}</strong></div>`
    : '<em>Faltan tiempos para calcular la vuelta teórica.</em>';
}

/* ---------- comparación (delta / diferencias) ---------- */

function drawDelta(par) {
  const cont = $('chart-delta');
  if (!cont) return;
  if (!par) { cont.innerHTML = '<em class="vacio">Elegí dos vueltas distintas.</em>'; return; }
  const [A, B] = par;
  const delta = state.grid.map((_, i) => {
    const ta = A.grid.time[i], tb = B.grid.time[i];
    return Number.isFinite(ta) && Number.isFinite(tb) ? ta - tb : null;
  });
  const o = opcionesGrafico(cont, 200, null, 'Δ (s)');
  o.series = [
    { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') },
    { label: A.name + ' − ' + B.name, stroke: '#22d3ee', width: 2, points: { show: false }, spanGaps: true },
  ];
  state.charts.lines.push({ u: new uPlot(o, [state.grid, delta], cont), cont, height: 200 });
}

function drawDVel(par) {
  const cont = $('chart-dvel');
  if (!cont) return;
  if (!par) { cont.innerHTML = '<em class="vacio">Elegí dos vueltas distintas.</em>'; return; }
  const [A, B] = par;
  const d = state.grid.map((_, i) => {
    const a = A.grid.speed[i], b = B.grid.speed[i];
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
  });
  const o = opcionesGrafico(cont, 180, null, 'km/h');
  o.series = [
    { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') },
    { label: A.name + ' − ' + B.name, stroke: '#f472b6', width: 2, points: { show: false }, spanGaps: true },
  ];
  state.charts.lines.push({ u: new uPlot(o, [state.grid, d], cont), cont, height: 180 });
}

function drawDPed(par) {
  const cont = $('chart-dped');
  if (!cont) return;
  if (!par) { cont.innerHTML = '<em class="vacio">Elegí dos vueltas distintas.</em>'; return; }
  const [A, B] = par;
  const dg = state.grid.map((_, i) => { const a = A.grid.throttle[i], b = B.grid.throttle[i]; return Number.isFinite(a) && Number.isFinite(b) ? a - b : null; });
  const df = state.grid.map((_, i) => { const a = A.grid.brake[i], b = B.grid.brake[i]; return Number.isFinite(a) && Number.isFinite(b) ? a - b : null; });
  const o = opcionesGrafico(cont, 180, null, 'Δ 0–1');
  o.series = [
    { label: 'distancia', value: (u, v) => (v == null ? '' : Math.round(v) + ' m') },
    { label: 'Δ gas', stroke: '#4ade80', width: 2, points: { show: false }, spanGaps: true },
    { label: 'Δ freno', stroke: '#f87171', width: 2, dash: [6, 4], points: { show: false }, spanGaps: true },
  ];
  state.charts.lines.push({ u: new uPlot(o, [state.grid, dg, df], cont), cont, height: 180 });
}

function drawMiniDelta(par) {
  const c = prepCanvas('ch-minidelta', 240);
  if (!c) return;
  const { ctx, w, h } = c;
  if (!par) { ctx.fillStyle = '#8b97a8'; ctx.fillText('Elegí dos vueltas distintas.', 12, 20); return; }
  const [A, B] = par;
  const sa = sectorTimes(A), sb = sectorTimes(B);
  const dif = sa.map((v, i) => (Number.isFinite(v) && Number.isFinite(sb[i]) ? v - sb[i] : NaN));
  const maxAbs = Math.max(...dif.map((v) => Math.abs(v)).filter(Number.isFinite), 0.001);
  const pad = 28, groupW = (w - pad * 2) / N_SECTORES;
  const cy = h / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy); ctx.stroke();
  dif.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const bh = (v / maxAbs) * (h / 2 - pad);
    ctx.fillStyle = v >= 0 ? '#f87171' : '#4ade80';
    ctx.fillRect(pad + i * groupW + 3, v >= 0 ? cy - bh : cy, groupW - 6, Math.abs(bh));
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px "Segoe UI"';
    ctx.fillText('S' + (i + 1), pad + i * groupW + 3, h - 8);
  });
  ctx.fillStyle = '#8b97a8'; ctx.fillText(`${A.name} − ${B.name}  (rojo = A pierde)`, 4, 14);
}

/* ---------- mapa ---------- */

function valorCanal(l, i, canal) {
  const g = l.grid || {};
  switch (canal) {
    case 'speed': return (l.grid?.speed ?? l.raw.speed)[i];
    case 'throttle': return (l.grid?.throttle ?? l.raw.throttle)[i];
    case 'brake': return (l.grid?.brake ?? l.raw.brake)[i];
    case 'gear': return (l.grid?.gear ?? l.raw.gear)[i];
    case 'y': return (l.grid?.y ?? l.raw.y)[i];
    case 'accLat': return (l.grid?.accLat ?? l.raw.accLat)[i];
    default: return NaN;
  }
}

function rangoCanal(laps, canal) {
  let min = Infinity, max = -Infinity;
  for (const l of laps) for (let i = 0; i < l.raw.x.length; i++) {
    const v = valorCanal(l, i, canal);
    if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  }
  return { min, max };
}

function normalTrazado(nx, nz, i) {
  const a = Math.max(0, i - 1), b = Math.min(nx.length - 1, i + 1);
  const dx = nx[b] - nx[a], dz = nz[b] - nz[a];
  const m = Math.hypot(dx, dz) || 1e-9;
  return [-dz / m, dx / m];
}

/* Dibuja la banda de pista (relleno + bordes), sin ejes. */
function drawBordePista(ctx, tf, proj, env) {
  const { nx, nz, ny, wl, wr } = env;
  const n = nx.length;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const [nmx, nmz] = normalTrazado(nx, nz, i);
    const ey = Number.isFinite(ny[i]) ? ny[i] : 0;
    L[i] = tf(...proj(nx[i] + nmx * wl[i], nz[i] + nmz * wl[i], ey));
    R[i] = tf(...proj(nx[i] - nmx * wr[i], nz[i] - nmz * wr[i], ey));
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  ctx.fill();
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(148,163,184,0.6)';
  for (const arr of [L, R]) {
    ctx.beginPath(); ctx.moveTo(arr[0][0], arr[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(arr[i][0], arr[i][1]);
    ctx.stroke();
  }
}

/* ---------- pista de referencia desde fast_lane.ai ---------- */

/* Parsea un fast_lane.ai de Assetto Corsa: cabecera (4 int32, n = 2º),
   n puntos de 20 bytes (x,y,z,dist,id) y un bloque opcional de 72 bytes/pto
   con los semianchos izquierdo/derecho en los floats 6 y 7.
   Devuelve { nx, nz, ny, wl, wr } con ancho constante (rigido). */
function parsearAi(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let pos = 0;
  const i32 = () => { const v = dv.getInt32(pos, true); pos += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(pos, true); pos += 4; return v; };
  i32(); const n = i32(); i32(); i32();
  if (!(n >= 3) || n > 5000000 || pos + n * 20 > bytes.byteLength) throw new Error('fast_lane.ai: archivo inválido.');
  const nx = new Array(n), ny = new Array(n), nz = new Array(n);
  for (let i = 0; i < n; i++) { nx[i] = f32(); ny[i] = f32(); nz[i] = f32(); f32(); i32(); }
  const bordeI = new Array(n).fill(NaN), bordeD = new Array(n).fill(NaN);
  if (pos + n * 72 <= bytes.byteLength) {
    for (let i = 0; i < n; i++) {
      const base = pos + i * 72;
      const li = dv.getFloat32(base + 6 * 4, true);
      const ld = dv.getFloat32(base + 7 * 4, true);
      if (Number.isFinite(li) && li > 0 && li < 200) bordeI[i] = li;
      if (Number.isFinite(ld) && ld > 0 && ld < 200) bordeD[i] = ld;
    }
  }
  // Ancho constante (rigido): un unico semiancho real, igual en todos los puntos.
  const MEDIO = 6;
  const sumas = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(bordeI[i]) && Number.isFinite(bordeD[i])) sumas.push(bordeI[i] + bordeD[i]);
  sumas.sort((a, b) => a - b);
  const semiancho = sumas.length ? sumas[sumas.length >> 1] / 2 : MEDIO;
  const wl = new Array(n).fill(semiancho);
  const wr = new Array(n).fill(semiancho);
  return { nx, nz, ny, wl, wr };
}

/* Banda de pista: referencia real y fija del fast_lane.ai (no se adapta a las vueltas). */
function envPista() {
  return (state.pistaAi && state.pistaAi.env) || null;
}

async function cargarPistaAi(fileList) {
  const ai = Array.from(fileList).find((f) => /\.ai$/i.test(f.name));
  if (!ai) return;
  try {
    const env = parsearAi(await ai.arrayBuffer());
    state.pistaAi = { env, nombre: ai.name };
    actualizarBotonPista();
    if (puedeEntrar()) {
      const entrando = $('dashboard').classList.contains('oculto');
      ocultarError();
      mostrarDashboard();
      if (entrando) recomputar();   // recomputar() ya redibuja la pestaña activa
      else renderTabActiva();
    }
  } catch (e) {
    mostrarError(e.message || String(e));
  }
}

function quitarPistaAi() {
  state.pistaAi = null;
  actualizarBotonPista();
  if (state.laps.length) {
    $('dashboard').classList.add('oculto');
    $('zona-carga').classList.remove('oculto');
    $('btn-limpiar').disabled = true;
    mostrarError(FALTA_PISTA);
  }
}

function actualizarBotonPista() {
  const btn = $('btn-pista');
  const quitar = $('btn-pista-quitar');
  const cargado = !!(state.pistaAi && state.pistaAi.env);
  if (quitar) quitar.hidden = !cargado;
  if (btn) btn.textContent = cargado ? `Pista: ${state.pistaAi.nombre}` : 'Cargar pista (fast_lane.ai)';
}

function drawCanal(ctx, laps, cache, tf, canal, vMin, vMax) {
  const rango = Math.max(vMax - vMin, 1e-6);
  laps.forEach((l, li) => {
    const pts = cache[li];
    const esRef = l.id === state.refId;
    ctx.lineWidth = esRef ? 4 : 3; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const v = valorCanal(l, i, canal);
      const [x0, y0] = tf(pts[i - 1][0], pts[i - 1][1]);
      const [x1, y1] = tf(pts[i][0], pts[i][1]);
      ctx.strokeStyle = Number.isFinite(v) ? colorMap((v - vMin) / rango) : '#555';
      ctx.globalAlpha = esRef ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
  const lx = 10, ly = h - 22, lw = 140;
  for (let i = 0; i < lw; i++) { ctx.fillStyle = colorMap(i / lw); ctx.fillRect(lx + i, ly, 1, 8); }
  ctx.fillStyle = '#8b97a8'; ctx.font = '10px "Segoe UI"';
  ctx.fillText(`${canal}`, lx, ly - 4);
  if (Number.isFinite(vMin)) ctx.fillText(vMin.toFixed(0), lx, ly + 18);
  if (Number.isFinite(vMax)) ctx.fillText(vMax.toFixed(0), lx + lw - 20, ly + 18);
}

function drawMarcadoresRef(ctx, tf, proj, lapV) {
  const ref = (lapV && lapV.raw && lapV.raw.brake) ? lapV : lapRef();
  if (!ref) return;
  if (state.mapa.frenada) {
    const b = ref.raw.brake, x = ref.raw.x, z = ref.raw.z, y = ref.raw.y;
    let prev = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] > 0.45 && prev <= 0.45) {
        const [px, py] = tf(...proj(x[i], z[i], y[i]));
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      }
      prev = b[i];
    }
  }
  if (state.mapa.cambios) {
    const g = ref.raw.gear, x = ref.raw.x, z = ref.raw.z, y = ref.raw.y;
    for (let i = 1; i < g.length; i++) {
      if (Number.isFinite(g[i]) && Number.isFinite(g[i - 1]) && g[i] !== g[i - 1]) {
        const [px, py] = tf(...proj(x[i], z[i], y[i]));
        ctx.font = '12px "Segoe UI"';
        ctx.fillStyle = g[i] > g[i - 1] ? '#4ade80' : '#facc15';
        ctx.fillText(g[i] > g[i - 1] ? '↑' : '↓', px - 4, py - 4);
      }
    }
  }
  const [mx, my] = tf(...proj(ref.raw.x[0], ref.raw.z[0], ref.raw.y[0]));
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
  ctx.font = '11px "Segoe UI"'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText('S/F', mx + 8, my - 6);
}

function adjuntarVistaMapa(cv) {
  if (!cv) return;
  cv.style.cursor = 'grab';
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    zoomMapa(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top, cv);
  }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, px: state.mapa.panX, py: state.mapa.panY };
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.mapa.panX = drag.px + (e.clientX - drag.x);
    state.mapa.panY = drag.py + (e.clientY - drag.y);
    drawMap();
  });
  const soltar = () => { if (drag) { drag = null; cv.style.cursor = 'grab'; } };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('dblclick', () => { resetViewMapa(); cv.style.cursor = 'grab'; });
}

function zoomMapa(factor, mx, my, cv) {
  const m = state.mapa;
  const baseS = m.s0 || 1;
  const oldS = baseS * m.zoom;
  const nz = clamp(m.zoom * factor, 0.6, 80);
  const r = (baseS * nz) / oldS;
  m.zoom = nz;
  m.panX = (mx - cv.clientWidth / 2) * (1 - r) + m.panX * r;
  m.panY = (my - cv.clientHeight / 2) * (1 - r) + m.panY * r;
  drawMap();
}

function resetViewMapa() {
  state.mapa.zoom = 1; state.mapa.panX = 0; state.mapa.panY = 0;
  drawMap();
}

/* Proyecta todos los puntos de las vueltas a 2D (rotación/elevación) y
   devuelve el cache + bounds comunes (misma escala para todos los mini-mapas). */
function proyectarLaps(laps, cfg) {
  const m = cfg || state.mapa;
  const a = (m.tresD ? m.rot : 0) * Math.PI / 180;
  const alt = m.tresD ? m.alt : 0;
  const proj = (x, z, y) => {
    const rx = x * Math.cos(a) - z * Math.sin(a);
    const rz = x * Math.sin(a) + z * Math.cos(a);
    return [rx, rz - (Number.isFinite(y) ? y : 0) * alt];
  };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const cache = [];
  for (const l of laps) {
    const { x, z, y } = l.raw;
    const pts = new Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const [px, py] = proj(x[i], z[i], y[i]);
      pts[i] = [px, py];
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    cache.push(pts);
  }
  // Encuadre fijo: incluir la banda real del .ai para que la pista entre completa
  // y no quede recortada por el tamano de las vueltas.
  const E = state.pistaAi && state.pistaAi.env;
  if (E) {
    const en = E.nx.length;
    for (let i = 0; i < en; i++) {
      const [nmx, nmz] = normalTrazado(E.nx, E.nz, i);
      const ey = Number.isFinite(E.ny[i]) ? E.ny[i] : 0;
      for (const sgn of [1, -1]) {
        const w = sgn > 0 ? E.wl[i] : E.wr[i];
        const [px, py] = proj(E.nx[i] + sgn * nmx * w, E.nz[i] + sgn * nmz * w, ey);
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
  }
  return { proj, cache, minX, maxX, minY, maxY };
}

/* Cache de proyección: no reproyectar en cada frame de zoom/pan. plano=true fuerza vista top-down fija
   (las mini-mapas por vuelta nunca rotan con el 3D del mapa principal). */
function obtenerProyeccion(laps, plano) {
  const key = laps.map((l) => l.id).join(',') + '|' + (plano ? 'plano' : state.mapa.tresD + '|' + state.mapa.rot + '|' + state.mapa.alt) + '|ai:' + (state.pistaAi ? state.pistaAi.nombre : '');
  if (state.mapa.projKey === key && state.mapa.projRes) return state.mapa.projRes;
  state.mapa.projKey = key;
  state.mapa.projRes = plano ? proyectarLaps(laps, { tresD: false, rot: 0, alt: 0 }) : proyectarLaps(laps);
  return state.mapa.projRes;
}

/* Escala/zoom/pan de la vista; los bounds son comunes a todas las vueltas. */
function construirVista(laps, cv, p) {
  const pad = 34;
  const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
  const s0 = Math.min((w - 2 * pad) / Math.max(p.maxX - p.minX, 1e-6), (h - 2 * pad) / Math.max(p.maxY - p.minY, 1e-6));
  const cxm = (p.minX + p.maxX) / 2, cym = (p.minY + p.maxY) / 2;
  const m = state.mapa;
  m.s0 = s0; m.cx = cxm; m.cy = cym;
  if (m.resetView) { m.zoom = 1; m.panX = 0; m.panY = 0; m.resetView = false; }
  const s = m.zoom * s0;
  const tf = (px, py) => [w / 2 + m.panX + (px - cxm) * s, h / 2 + m.panY + (py - cym) * s];
  return { proj: p.proj, cache: p.cache, w, h, tf };
}

/* Vista propia para thumbnails (no toca el zoom/pan del mapa interactivo). */
function construirVistaLocal(cv, p) {
  const pad = 30;
  const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
  const sx = Math.max(p.maxX - p.minX, 1e-6), sy = Math.max(p.maxY - p.minY, 1e-6);
  const s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
  const cx = (p.minX + p.maxX) / 2, cy = (p.minY + p.maxY) / 2;
  const tf = (px, py) => [w / 2 + (px - cx) * s, h / 2 + (py - cy) * s];
  return { proj: p.proj, w, h, tf };
}

function tfPara(cv) {
  const m = state.mapa;
  const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
  const s = m.zoom * m.s0;
  return (px, py) => [w / 2 + m.panX + (px - m.cx) * s, h / 2 + m.panY + (py - m.cy) * s];
}

function prepMapaCv(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function dibujarGrilla(ctx, w, h) {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let gx = 0; gx <= w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
  for (let gy = 0; gy <= h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
}

function dibujarPosicion(ctx, laps, view) {
  for (const l of laps) {
    if (!l.grid) continue;
    const esRef = l.id === state.refId;
    const [px, py] = view.tf(...view.proj(l.grid.x[state.idx], l.grid.z[state.idx], l.grid.y[state.idx]));
    ctx.beginPath(); ctx.arc(px, py, esRef ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = esRef ? '#ffffff' : hexA(l.color, 0.9); ctx.fill();
    if (esRef) { ctx.lineWidth = 3; ctx.strokeStyle = l.color; ctx.stroke(); }
  }
}

/* Mapa único: heatmap por canal. */
function pintarMapaCanal(cv, laps) {
  const { ctx, w, h } = prepMapaCv(cv);
  if (!laps.length) return;
  const view = construirVista(laps, cv, obtenerProyeccion(laps));
  dibujarGrilla(ctx, w, h);
  const canal = state.mapa.canal;
  const { min: vMin, max: vMax } = rangoCanal(laps, canal);
  drawCanal(ctx, laps, view.cache, view.tf, canal, vMin, vMax);
  drawMarcadoresRef(ctx, view.tf, view.proj, lapRef());
  dibujarPosicion(ctx, laps, view);
}

/* Mini-mapa de una vuelta: banda de pista (silueta) + trazada de color fina por encima. */
function pintarMapaTrazada(cv, lap, laps, view, cacheIdx) {
  const { ctx, w, h } = prepMapaCv(cv);
  dibujarGrilla(ctx, w, h);
  if (view.env) drawBordePista(ctx, view.tf, view.proj, view.env);
  const pts = view.cache[cacheIdx];
  if (pts && pts.length > 1) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = lap.color; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = view.tf(pts[i][0], pts[i][1]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  drawMarcadoresRef(ctx, view.tf, view.proj, lap);
  dibujarPosicion(ctx, [lap], view);
}

/* Grilla: un mapa por vuelta visible. */
function renderTrazadas() {
  const cont = $('mapa-trazadas');
  const laps = visibleLaps();
  if (!cont || !laps.length) return;
  const key = laps.map((l) => l.id).join(',');
  if (cont.dataset.key !== key) {
    cont.innerHTML = '';
    laps.forEach((l) => {
      const item = document.createElement('div');
      item.className = 'trazada-item';
      const nombre = l.id === state.refId ? l.name + ' (REF)' : l.name;
      item.innerHTML =
        `<div class="trazada-titulo"><span class="trazada-dot" style="background:${l.color}"></span>` +
        `<span class="trazada-nombre">${nombre}</span>` +
        `<span class="trazada-tiempo mono">${fmtTiempo(tiempoDeVuelta(l))}</span></div>`;
      const cv = document.createElement('canvas');
      cv.className = 'trazada-canvas';
      item.appendChild(cv);
      cont.appendChild(item);
      adjuntarVistaMapa(cv);
    });
    cont.dataset.key = key;
  }
  const p = obtenerProyeccion(laps, true);
  const canvases = cont.querySelectorAll('.trazada-canvas');
  const cv0 = canvases[0];
  if (!cv0) return;
  construirVista(laps, cv0, p);
  const env = state.mapa.bordes ? envPista(laps) : null;
  const view = { proj: p.proj, cache: p.cache, env };
  laps.forEach((l, i) => {
    const cv = canvases[i];
    if (!cv) return;
    pintarMapaTrazada(cv, l, laps, { ...view, tf: tfPara(cv) }, i);
  });
}

function drawMap() {
  const simple = $('mapa-canvas');
  const grilla = $('mapa-trazadas');
  const mapaCv = $('mapa');
  if (!mapaCv) return;
  if (state.mapa.visual === 'trazada') {
    if (simple) simple.style.display = 'none';
    if (grilla) { grilla.style.display = 'flex'; renderTrazadas(); }
    return;
  }
  if (grilla) grilla.style.display = 'none';
  if (simple) simple.style.display = 'block';
  pintarMapaCanal(mapaCv, visibleLaps());
}

/* ---------- readouts / UI ---------- */

function actualizarScrub() {
  const scrub = $('scrub');
  const pct = state.maxDist ? Math.min(100, (state.dist / state.maxDist) * 100) : 0;
  scrub.value = Math.round(pct * 10);
  scrub.style.setProperty('--bait', pct + '%');
  $('scrub-dist').textContent = state.dist.toFixed(0) + ' m';
}

function updateUI(opts = { moverCursor: true, mapa: true }) {
  actualizarScrub();
  const lap = lapRef();
  if (lap && lap.grid) {
    const i = state.idx;
    $('ro-vel').textContent = (lap.grid.speed[i] ?? 0).toFixed(1);
    $('ro-dist').textContent = state.dist.toFixed(0);
    $('ro-gas').textContent = ((lap.grid.throttle[i] ?? 0) * 100).toFixed(0);
    $('ro-freno').textContent = ((lap.grid.brake[i] ?? 0) * 100).toFixed(0);
    $('ro-marcha').textContent = Math.round(lap.grid.gear[i] ?? 0);
    $('ro-tiempo').textContent = (lap.grid.time[i] ?? 0).toFixed(2);
  }
  if (state.tab === 'mapa') {
    if (opts.mapa) drawMap();
    const r = lapRef();
    if (r && r.grid) dibujarAutoCarga(r, state.idx);
  }
  if (opts.moverCursor) moverCursor();
}

/* ---------- reproductor ---------- */

function fijarIconoPlay() {
  const b = $('btn-play');
  if (!b) return;
  b.innerHTML = state.playing
    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  b.setAttribute('aria-pressed', String(state.playing));
  b.setAttribute('aria-label', state.playing ? 'Pausar vuelta' : 'Reproducir vuelta');
}

function togglePlay() {
  if (!state.playing && state.dist >= state.maxDist - 0.5 && state.maxDist > 0) {
    state.dist = 0; state.idx = 0; updateUI({ moverCursor: true });
  }
  state.playing = !state.playing;
  fijarIconoPlay();
  if (state.playing) { state.lastTs = performance.now(); state.raf = requestAnimationFrame(tick); }
  else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
}

function tick(ts) {
  if (!state.playing) return;
  try {
    const dt = Math.min(Math.max((ts - state.lastTs) / 1000, 0), 0.05); state.lastTs = ts;
    const ref = lapRef();
    let vms = state.ultVms > 0 ? state.ultVms : 90;
    if (ref && ref.grid && ref.grid.speed) {
      const s = ref.grid.speed[state.idx];
      if (Number.isFinite(s) && s > 0) vms = s / 3.6;
    }
    state.ultVms = vms;
    let nueva = state.dist + dt * state.speedMult * vms;
    if (nueva >= state.maxDist) {
      if (state.loop) nueva = nueva % state.maxDist;
      else { nueva = state.maxDist; togglePlay(); }
    }
    const idx = Math.min(state.grid.length - 1, Math.max(0, Math.round(nueva / state.gridStep)));
    state.idx = idx; state.dist = nueva;
    const redibujarMapa = state.mapa.visual !== 'trazada' && state._tick % 3 === 0;
    state._tick++;
    updateUI({ moverCursor: true, mapa: redibujarMapa });
  } catch (err) {
    console.error('[tick]', err);
  }
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

function irA(dist) {
  const d = Math.max(0, Math.min(state.maxDist, dist));
  state.dist = d; state.idx = Math.min(state.grid.length - 1, Math.max(0, Math.round(d / state.gridStep)));
  updateUI({ moverCursor: true });
}

/* ---------- visibilidad / pestañas ---------- */

function mostrarDashboard() { $('zona-carga').classList.add('oculto'); $('dashboard').classList.remove('oculto'); $('btn-limpiar').disabled = false; }
function mostrarError(msg) { const e = $('error-aviso'); e.textContent = '⚠ ' + msg; e.classList.remove('oculto'); }
function ocultarError() { $('error-aviso').classList.add('oculto'); }

/* Para entrar al análisis hacen falta un replay/CSV y la pista (fast_lane.ai). */
function puedeEntrar() { return state.laps.length > 0 && !!(state.pistaAi && state.pistaAi.env); }
const FALTA_PISTA = 'Falta cargar la pista (fast_lane.ai) para entrar al análisis.';

function activarTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => {
    const act = b.dataset.tab === tab;
    b.classList.toggle('activo', act);
    b.setAttribute('aria-selected', String(act));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('activo', p.id === 'panel-' + tab));
  if (visibleLaps().length) renderTabActiva();
}

/* ---------- eventos ---------- */

function init() {
  const input = $('input-archivos');
  $('btn-abrir').addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { cargarArchivos(e.target.files); input.value = ''; });

  const inputPista = $('input-pista');
  $('btn-pista').addEventListener('click', () => inputPista.click());
  inputPista.addEventListener('change', (e) => { if (e.target.files.length) cargarPistaAi(e.target.files); inputPista.value = ''; });
  $('btn-pista-quitar').addEventListener('click', quitarPistaAi);
  actualizarBotonPista();

  const zona = $('zona-carga');
  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); }));
  zona.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); zona.classList.remove('encima'); if (e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files); });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length && $('dashboard').classList.contains('oculto')) cargarArchivos(e.dataTransfer.files); });

  $('btn-play').addEventListener('click', togglePlay);
  $('chk-loop').addEventListener('change', (e) => { state.loop = e.target.checked; });
  $('sel-velocidad').addEventListener('change', (e) => { state.speedMult = parseFloat(e.target.value); });
  $('scrub').addEventListener('input', (e) => irA((e.target.value / 1000) * state.maxDist));

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => activarTab(b.dataset.tab)));

  // controles del mapa
  const canal = $('mapa-canal'); if (canal) canal.addEventListener('change', (e) => { state.mapa.canal = e.target.value; drawMap(); });
  const frenada = $('mapa-frenada'); if (frenada) frenada.addEventListener('change', (e) => { state.mapa.frenada = e.target.checked; drawMap(); });
  const cambios = $('mapa-cambios'); if (cambios) cambios.addEventListener('change', (e) => { state.mapa.cambios = e.target.checked; drawMap(); });
  const t3d = $('mapa-3d'); if (t3d) t3d.addEventListener('change', (e) => { state.mapa.tresD = e.target.checked; mostrarControles3D(); drawMap(); });
  const rot = $('mapa-rot'); if (rot) rot.addEventListener('input', (e) => { state.mapa.rot = parseFloat(e.target.value); drawMap(); });
  const alt = $('mapa-alt'); if (alt) alt.addEventListener('input', (e) => { state.mapa.alt = parseFloat(e.target.value); drawMap(); });

  // controles 3D del mapa por sectores (Conjunto)
  const redibConjMapas = () => { drawMapaSectores(); drawMapaTeorico(state.laps.filter((l) => l.valida)); };
  const ms3d = $('msect-3d'); if (ms3d) ms3d.addEventListener('change', (e) => { state.mapaSectores.tresD = e.target.checked; mostrarControles3DMsect(); redibConjMapas(); });
  const msrot = $('msect-rot'); if (msrot) msrot.addEventListener('input', (e) => { state.mapaSectores.rot = parseFloat(e.target.value); redibConjMapas(); });
  const msalt = $('msect-alt'); if (msalt) msalt.addEventListener('input', (e) => { state.mapaSectores.alt = parseFloat(e.target.value); redibConjMapas(); });

  const visual = $('mapa-visual');
  if (visual) visual.addEventListener('change', (e) => {
    state.mapa.visual = e.target.value;
    const canalSel = $('mapa-canal');
    if (canalSel) canalSel.disabled = state.mapa.visual !== 'canal';
    drawMap();
  });
  const bordes = $('mapa-bordes');
  if (bordes) bordes.addEventListener('change', (e) => { state.mapa.bordes = e.target.checked; drawMap(); });

  adjuntarVistaMapa($('mapa'));

  const selB = $('sel-lap-b'); if (selB) selB.addEventListener('change', (e) => { state.lapBId = e.target.value; renderTabActiva(); });

  $('btn-limpiar').addEventListener('click', () => {
    destroyCharts(); state.laps = []; state.refId = null; state.lapBId = null; state.idx = 0; state.dist = 0; state.playing = false; state.colorIdx = 0;
    fijarIconoPlay(); $('dashboard').classList.add('oculto'); $('zona-carga').classList.remove('oculto'); $('btn-limpiar').disabled = true; ocultarError();
  });

  const btnColapsar = $('btn-colapsar-vueltas');
  if (btnColapsar) btnColapsar.addEventListener('click', colapsarVueltas)

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (state.grid.length) togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); irA(state.dist + state.gridStep * 10); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); irA(state.dist - state.gridStep * 10); }
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (visibleLaps().length) renderTabActiva(); }, 120); });

  initZoomTeorico();
}

function colapsarVueltas() {
  const btn = $('btn-colapsar-vueltas');
  const lista = $('lista-vueltas');
  if (!btn || !lista) return;
  const colapsada = lista.classList.toggle('colapsada');
  btn.classList.toggle('colapsado', colapsada);
  btn.setAttribute('aria-expanded', String(!colapsada));
  btn.title = colapsada ? 'Mostrar la lista de vueltas' : 'Ocultar la lista de vueltas';
}

function mostrarControles3D() {
  const box = $('mapa-3d-controles');
  if (box) box.style.display = state.mapa.tresD ? 'flex' : 'none';
}

function mostrarControles3DMsect() {
  const box = $('msect-3d-controles');
  if (box) box.style.display = state.mapaSectores.tresD ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', init);
