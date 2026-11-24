'use strict';

/* Mapas del tablero: mapa de pista (heatmap por canal o trazada por vuelta, con
   2D/3D y marcas) y la carga por rueda en vivo. Cada tarjeta de mapa tiene sus
   propios ajustes, vista (zoom/pan) y capa de posición en vivo. */

function dadosBoundsValidos(datos) {
  const b = datos && datos.bounds;
  return b && b.min_x != null && b.max_x != null && b.min_y != null && b.max_y != null;
}

const CANALES_MAPA = [
  ['velocidad_kmh', 'Velocidad'], ['acelerador', 'Acelerador'], ['freno', 'Freno'],
  ['marcha', 'Marcha'], ['acc_lat_g', 'G lateral'], ['altura', 'Elevación'],
];

registrarGrafico({
  id: 'mapa-pista',
  nombre: 'Mapa de pista',
  descripcion: 'Trazadas coloreadas por canal o una por vuelta; rueda = zoom, arrastrar = mover, doble clic = encuadrar.',
  categoria: 'mapas',
  tamano: { w: 6, h: 8 },
  ajustes: [
    { clave: 'visual', etiqueta: 'Visual', tipo: 'select', opciones: [['canal', 'Canal (heatmap)'], ['trazada', 'Trazada por vuelta']], valor: 'canal' },
    { clave: 'canal', etiqueta: 'Canal', tipo: 'select', opciones: CANALES_MAPA, valor: 'velocidad_kmh', activo: (aj) => aj.visual === 'canal' },
    { clave: 'bordes', etiqueta: 'Pista de referencia', tipo: 'check', valor: true },
    { clave: 'frenada', etiqueta: 'Marcas de frenada', tipo: 'check', valor: true },
    { clave: 'cambios', etiqueta: 'Marcas de cambio', tipo: 'check', valor: false },
    { clave: 'tresD', etiqueta: '3D', tipo: 'check', valor: false },
    { clave: 'rot', etiqueta: 'Rotación', tipo: 'rango', min: -180, max: 180, paso: 1, valor: 0, activo: (aj) => aj.tresD },
    { clave: 'alt', etiqueta: 'Elevación', tipo: 'rango', min: 0, max: 15, paso: 0.5, valor: 3, activo: (aj) => aj.tresD },
  ],
  // La proyección 3D se calcula en el backend: cada rotación/elevación es otra fuente.
  fuente: (aj) => ({ pestana: 'mapa', rot: aj.tresD ? aj.rot : 0, alt: aj.tresD ? aj.alt : 3 }),
  montar: montarMapaPista,
});

function montarMapaPista(cuerpo, datos, aj) {
  if (!datos || !datos.trazas.length || !dadosBoundsValidos(datos)) {
    mensajeTarjeta(cuerpo, 'Sin trazadas para dibujar el mapa.');
    return {};
  }
  const m = { datos, aj, cuerpo };
  if (aj.visual === 'trazada') {
    m.items = crearMiniMapas(m);
  } else {
    const lienzo = document.createElement('div');
    lienzo.className = 'lienzo-mapa mapa-principal';
    m.cv = document.createElement('canvas');
    m.cv.setAttribute('role', 'img');
    m.cv.setAttribute('aria-label', 'Mapa de pista');
    m.capa = document.createElement('canvas');
    m.capa.className = 'capa-vivo';
    m.capa.setAttribute('aria-hidden', 'true');
    lienzo.append(m.cv, m.capa);
    cuerpo.appendChild(lienzo);
    adjuntarInteraccionMapa(m.cv, () => dibujarMapaCanal(m));
  }
  const dibujar = () => (aj.visual === 'trazada' ? dibujarMiniMapas(m) : dibujarMapaCanal(m));
  dibujar();
  return { redimensionar: dibujar, alCursor: () => dibujarVivoMapa(m) };
}

/* Vista única heatmap coloreada por el canal elegido. */
function dibujarMapaCanal(m) {
  if (!m.cv.clientWidth) return;
  const pcv = prepararMapa(m.cv);
  if (!pcv) return;
  const { ctx, w, h } = pcv;
  const { datos, aj } = m;
  dibujarGrillaFondo(ctx, w, h);
  const ref = trazaReferencia(datos.trazas);
  const rango = rangoCanalDeTrazas(datos.trazas, aj.canal);
  const vista = construirVistaMapa(m.cv, datos.bounds);
  dibujarBandaPista(ctx, vista.tf, aj.bordes ? datos.pista : null);
  for (const traza of datos.trazas) {
    dibujarTrazaCanalizada(ctx, vista.tf, traza, aj.canal, rango, ref && mismaId(traza.id, ref.id));
  }
  dibujarMarcadoresRef(ctx, vista.tf, ref, { frenada: aj.frenada, cambios: aj.cambios });
  dibujarNumeralesCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarLeyendaCanal(ctx, w, h, rango.min, rango.max, aj.canal);
  dibujarVivoMapa(m);
}

/* Un mini-mapa por vuelta: banda de pista + su trazada fina. */
function crearMiniMapas(m) {
  const cont = document.createElement('div');
  cont.className = 'mapa-trazadas';
  m.cuerpo.appendChild(cont);
  const ref = trazaReferencia(m.datos.trazas);
  return m.datos.trazas.map((traza) => {
    const item = document.createElement('div');
    item.className = 'trazada-item';
    const titulo = document.createElement('div');
    titulo.className = 'trazada-titulo';
    const punto = document.createElement('span');
    punto.className = 'trazada-dot';
    punto.style.background = colorDeVuelta(traza.id);
    const nombre = document.createElement('span');
    nombre.className = 'trazada-nombre';
    nombre.textContent = ref && mismaId(traza.id, ref.id) ? `${traza.etiqueta} (REF)` : traza.etiqueta;
    titulo.append(punto, nombre);
    const lienzo = document.createElement('div');
    lienzo.className = 'lienzo-mapa';
    const cv = document.createElement('canvas');
    cv.className = 'trazada-canvas';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', `Trazada de ${traza.etiqueta}`);
    const capa = document.createElement('canvas');
    capa.className = 'capa-vivo';
    capa.setAttribute('aria-hidden', 'true');
    lienzo.append(cv, capa);
    item.append(titulo, lienzo);
    cont.appendChild(item);
    adjuntarInteraccionMapa(cv, () => dibujarMiniMapas(m));
    return { traza, cv, capa };
  });
}

function dibujarMiniMapas(m) {
  const { datos, aj } = m;
  for (const it of m.items) {
    if (!it.cv.clientWidth) continue;
    const pcv = prepararCanvas(it.cv, 300);
    if (!pcv) continue;
    dibujarGrillaFondo(pcv.ctx, pcv.w, pcv.h);
    const vista = construirVistaMapa(it.cv, datos.bounds);
    dibujarBandaPista(pcv.ctx, vista.tf, aj.bordes ? datos.pista : null);
    dibujarTrazada(pcv.ctx, vista.tf, it.traza, colorDeVuelta(it.traza.id), 3);
    dibujarMarcadoresRef(pcv.ctx, vista.tf, it.traza, { frenada: aj.frenada, cambios: aj.cambios });
    dibujarNumeralesCurvas(pcv.ctx, vista.tf, it.traza, datos.curvas);
  }
  dibujarVivoMapa(m);
}

/* Posición en vivo sobre la capa transparente (sin repintar el mapa base). */
function dibujarVivoMapa(m) {
  if (m.items) {
    // Una sola vuelta por mini-mapa: su punto va destacado aunque no sea la REF.
    for (const it of m.items) pintarCapaVivo(it.capa, it.cv, [it.traza], it.traza.id, m.datos.bounds);
  } else if (m.cv) {
    const ref = trazaReferencia(m.datos.trazas);
    pintarCapaVivo(m.capa, m.cv, m.datos.trazas, ref ? ref.id : null, m.datos.bounds);
  }
}

/* La capa usa la misma vista (zoom/pan/3D) que el mapa de abajo. */
function pintarCapaVivo(capa, base, trazas, refId, bounds) {
  if (!capa || !base || !base.clientWidth) return;
  const c = prepararCanvas(capa, base.clientHeight);
  if (!c) return;
  const vista = construirVistaMapa(base, bounds);
  dibujarPosicionVivo(c.ctx, vista.tf, trazas, refId);
}

/* Etiqueta del canal + escala. */
function dibujarLeyendaCanal(ctx, w, h, min, max, canal) {
  ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Segoe UI"';
  ctx.fillText(canal, 10, h - 32);
  dibujarEscalaColor(ctx, w, h, min, max);
}

// ===== Carga por rueda en vivo =====

registrarGrafico({
  id: 'carga-vivo',
  nombre: 'Carga por rueda en vivo',
  unidad: 'vuelta REF',
  descripcion: 'Auto visto desde arriba: carga de cada rueda y punto de balance de pesos en el instante del reproductor.',
  categoria: 'mapas',
  fuente: 'vuelta',
  tamano: { w: 4, h: 7 },
  montar: graficoCanvas((cv) => dibujarAutoCarga(cv, state.idx), { vivo: true }),
});

/* Ruedas en la figura: `lado` −1 izquierda / +1 derecha; `eje` −1 delante / +1 detrás. */
const RUEDAS_CARGA = [
  { clave: 'delantera_izquierda', etiqueta: 'FL', lado: -1, eje: -1 },
  { clave: 'delantera_derecha', etiqueta: 'FR', lado: 1, eje: -1 },
  { clave: 'trasera_izquierda', etiqueta: 'RL', lado: -1, eje: 1 },
  { clave: 'trasera_derecha', etiqueta: 'RR', lado: 1, eje: 1 },
];
/* Segundos de estela del punto de balance. */
const ESTELA_BALANCE_S = 1.5;

/* Reparto de la carga en un índice: fracciones adelante/derecha y total (N). */
function balanceCarga(carga, i) {
  const v = RUEDAS_CARGA.map((r) => valorSerie(carga[r.clave], i));
  if (v.some((x) => x == null)) return null;
  const [fl, fr, rl, rr] = v;
  const total = fl + fr + rl + rr;
  if (!(total > 0)) return null;
  return { total, valores: v, delantera: (fl + fr) / total, derecha: (fr + rr) / total };
}

/* Máximos de la vuelta (escala de color y del balance); se recalculan solo si
   cambia la REF. */
let _escalaCarga = { ref: null };
function escalaCarga(ref) {
  if (_escalaCarga.ref === ref) return _escalaCarga;
  let maxC = 0, maxLon = 0, maxLat = 0;
  const n = ref.carga[RUEDAS_CARGA[0].clave].length;
  for (let k = 0; k < n; k++) {
    const b = balanceCarga(ref.carga, k);
    if (!b) continue;
    for (const x of b.valores) if (x > maxC) maxC = x;
    maxLon = Math.max(maxLon, Math.abs(b.delantera - 0.5));
    maxLat = Math.max(maxLat, Math.abs(b.derecha - 0.5));
  }
  _escalaCarga = { ref, maxC: maxC || 1, maxLon: maxLon || 0.05, maxLat: maxLat || 0.05 };
  return _escalaCarga;
}

/* Carga por rueda en vivo (vuelta REF): auto visto desde arriba con cada rueda
   coloreada por su carga y, en el centro, el punto de balance de pesos con su
   estela de los últimos segundos. Usa la vista base (datosVuelta). */
function dibujarAutoCarga(cv, i) {
  const c = prepararCanvas(cv, 320);
  if (!c || !state.datosVuelta) return;
  const { ctx, w, h } = c;
  const ref = vueltaReferencia();
  ctx.font = '11px "Segoe UI"';
  if (!ref) { ctx.fillStyle = COLOR.apagado; ctx.fillText('Sin vuelta de referencia.', 12, 20); return; }
  const escala = escalaCarga(ref);
  const actual = balanceCarga(ref.carga, i);

  // Geometría: el auto deja ~90 px por lado para las etiquetas de las ruedas.
  const altoAuto = Math.max(120, Math.min(h - 108, 220));
  const anchoAuto = Math.max(70, Math.min(altoAuto * 0.5, w - 190));
  const cx = w / 2, cy = 46 + altoAuto / 2;
  const top = cy - altoAuto / 2, izq = cx - anchoAuto / 2;

  ctx.fillStyle = COLOR.apagado;
  ctx.textAlign = 'center';
  ctx.fillText('▲ adelante', cx, top - 10);

  // Carrocería: cuerpo redondeado, trompa más angosta y cabina.
  ctx.fillStyle = 'rgba(148,163,184,0.12)';
  ctx.strokeStyle = 'rgba(148,163,184,0.55)'; ctx.lineWidth = 1.5;
  redondeado(ctx, izq, top, anchoAuto, altoAuto, anchoAuto * 0.32); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  redondeado(ctx, cx - anchoAuto * 0.3, top + altoAuto * 0.3, anchoAuto * 0.6, altoAuto * 0.38, 10); ctx.fill();

  // Ruedas: color por carga (misma escala que el mapa), N y % del total al costado.
  const rw = anchoAuto * 0.2, rh = altoAuto * 0.2;
  for (let k = 0; k < RUEDAS_CARGA.length; k++) {
    const r = RUEDAS_CARGA[k];
    const v = actual ? actual.valores[k] : valorSerie(ref.carga[r.clave], i);
    const rx = r.lado < 0 ? izq - rw * 0.45 : izq + anchoAuto - rw * 0.55;
    const ry = cy + r.eje * altoAuto * 0.31 - rh / 2;
    ctx.fillStyle = v == null ? 'rgba(148,163,184,0.25)' : colorMap(v / escala.maxC);
    redondeado(ctx, rx, ry, rw, rh, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(13,18,26,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();

    const tx = r.lado < 0 ? rx - 8 : rx + rw + 8;
    ctx.textAlign = r.lado < 0 ? 'right' : 'left';
    ctx.fillStyle = COLOR.texto; ctx.font = 'bold 13px "Segoe UI"';
    ctx.fillText(r.etiqueta, tx, ry + 8);
    ctx.font = '11px "Consolas", monospace';
    ctx.fillText(v == null ? '–' : `${Math.round(v).toLocaleString()} N`, tx, ry + 23);
    ctx.fillStyle = COLOR.apagado;
    ctx.fillText(actual ? `${Math.round((v / actual.total) * 100)} %` : '', tx, ry + 37);
  }

  // Balance: cruz = reparto 50/50; el punto se aleja hacia donde carga el auto.
  const bx = anchoAuto * 0.28, by = altoAuto * 0.3;
  ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - bx, cy); ctx.lineTo(cx + bx, cy);
  ctx.moveTo(cx, cy - by); ctx.lineTo(cx, cy + by);
  ctx.stroke();
  const posicion = (b) => [
    cx + clamp((b.derecha - 0.5) / escala.maxLat, -1, 1) * bx,
    cy - clamp((b.delantera - 0.5) / escala.maxLon, -1, 1) * by,
  ];

  const tiempos = ref.tiempo;
  const tAhora = valorSerie(tiempos, i);
  if (tAhora != null) {
    const puntos = [];
    for (let k = i; k >= 0; k--) {
      const t = valorSerie(tiempos, k);
      if (t == null || t < tAhora - ESTELA_BALANCE_S) break;
      const b = balanceCarga(ref.carga, k);
      if (b) puntos.unshift(posicion(b));
    }
    for (let k = 1; k < puntos.length; k++) {
      ctx.strokeStyle = `rgba(34,211,238,${(0.6 * k) / puntos.length})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(...puntos[k - 1]); ctx.lineTo(...puntos[k]); ctx.stroke();
    }
  }
  if (actual) {
    const [px, py] = posicion(actual);
    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.blanco; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = COLOR.acento; ctx.stroke();
  }

  // Resumen del reparto y escala de color.
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.texto; ctx.font = '12px "Segoe UI"';
  const pct = (x) => `${Math.round(x * 100)} %`;
  ctx.fillText(actual
    ? `del ${pct(actual.delantera)} · tras ${pct(1 - actual.delantera)} · izq ${pct(1 - actual.derecha)} · der ${pct(actual.derecha)}`
    : 'sin datos de carga en este punto', cx, top + altoAuto + 26);
  ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Segoe UI"';
  ctx.fillText(ref.etiqueta, cx, 14);
  ctx.textAlign = 'left';
  const anchoBarra = Math.max(w - 120, 40);
  ctx.fillText('0', 10, h - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(escala.maxC).toLocaleString()} N (máx)`, w - 10, h - 6);
  ctx.textAlign = 'left';
  for (let k = 0; k < anchoBarra - 24; k++) {
    ctx.fillStyle = colorMap(k / Math.max(anchoBarra - 24, 1));
    ctx.fillRect(22 + k, h - 10, 1, 3);
  }
}
