'use strict';

/* Estado global de la sesión del front (sin persistencia): vive solo por sesión. */

const PALETA = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#c084fc', '#fde047'];
const G = 9.80665;
const N_SECTORES = 3;
const SLIP_SPIN = 0.15;
const SLIP_LOCK = -0.3;
const SLIP_VEL_MIN = 30;

const state = {
  resumen: null,          // último DtoResumen (cargo/selector/avisos)
  avisos: [],             // avisos acumulados durante la sesión actual
  avisosProcesados: new Set(),
  version: 0,             // invalida el caché de datos de pestaña
  cacheDatos: new Map(),  // pestaña → { version, rot, alt, datos }
  tab: 'vuelta',
  datosVuelta: null,      // DtoVuelta base (grilla + canales de vueltas visibles)
  pistasCurvas: [],       // curvas del DTO activo p/ marcas en uPlot y lecturas
  colorPorId: new Map(),  // id "auto NumeroLocal" → color de paleta
  grilla: [],             // s de pista (eje X común)
  paso: 1,                // paso de la grilla (m) p/ índices de arcos
  longitudPista: 0,
  idx: 0,
  dis: 0,
  playing: false,
  speedMult: 1,
  loop: true,
  raf: null,
  lastTs: 0,
  ultVms: 0,
  _tick: 0,
  charts: { lines: [], inputs: [] },
  mapa: { visual: 'canal', canal: 'velocidad_kmh', bordes: true, frenada: true, cambios: false, tresD: false, rot: 0, alt: 3, zoom: 1, panX: 0, panY: 0, resetView: true },
  mapaSectores: { tresD: false, rot: 0, alt: 3 },
  ultimoConjunto: null,   // último DtoConjunto recibido (para ver en grande)
  trazadasMapa: { key: '', mapas: null },   // cache de mapas por returnType sección
};
