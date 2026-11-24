'use strict';

/* Estado global de la sesión del front (sin persistencia): vive solo por sesión. */

const PALETA = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#c084fc', '#fde047'];
const G = 9.80665;
const N_SECTORES = 3;

const state = {
  resumen: null,          // último DtoResumen (cargo/selector/avisos)
  avisos: [],             // avisos acumulados durante la sesión actual
  avisosProcesados: new Set(),
  version: 0,             // invalida el caché de datos de pestaña
  cacheDatos: new Map(),  // pestaña → { version, rot, alt, datos }
  tab: 'tablero',
  archivos: { replay: null, pista: null }, // rutas cargadas (solo para mostrar)
  datosVuelta: null,      // DtoVuelta base (grilla + canales de vueltas visibles)
  colorPorId: new Map(),  // id "auto NumeroLocal" → color de paleta
  grilla: [],             // s de pista (eje X común)
  paso: 1,                // paso de la grilla (m) p/ índices de arcos
  longitudPista: 0,
  idx: 0,
  dis: 0,
  playing: false,
  speedMult: 1,
  loop: true,
  reproductorExpandido: false, // detalle (lectura actual y sesión) visible; arranca comprimido
  raf: null,
  lastTs: 0,
  ultVms: 0,
  charts: { lines: [] },   // uPlot del tablero (el primero guía el cursor)
  curvasDatos: null,      // último DtoCurvas (umbrales de slip y nombres de curva)
};
