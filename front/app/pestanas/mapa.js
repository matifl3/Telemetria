'use strict';

/* Pestaña Mapa (RF-011): banda + trazadas, canales, marcadores, 3D, auto en vivo. */

async function renderPestanaMapa(version = state.version) {
  const rot = state.mapa.tresD ? state.mapa.rot : 0;
  const alt = state.mapa.tresD ? state.mapa.alt : 3;
  const datos = await puente.pedirPestana('mapa', rot, alt);
  const rotActual = state.mapa.tresD ? state.mapa.rot : 0;
  const altActual = state.mapa.tresD ? state.mapa.alt : 3;
  if (version !== state.version || state.tab !== 'mapa' || rot !== rotActual || alt !== altActual) return;
  state.mapaDatos = datos;
  destruirTrazadasObsoletas();
  dibujarMapaPestana();
  dibujarAutoCarga(state.idx);
}

/* Si la selección cambió, rehacer la grilla de mini-mapas. */
function destruirTrazadasObsoletas() {
  const cont = $('mapa-trazadas');
  if (!cont || !state.mapaDatos) return;
  const key = state.mapaDatos.trazas.map((t) => idVuelta(t.id)).join(',');
  if (cont.dataset.key !== key) { cont.innerHTML = ''; cont.dataset.key = ''; }
}

function dibujarMapaPestana(opts = {}) {
  const datos = state.mapaDatos;
  if (!datos || !datos.trazas.length || !dadosBoundsValidos(datos)) return;
  const cv = $('mapa');
  if (!cv) return;
  if (opts.soloVivo) { dibujarVivoMapa(); dibujarAutoCarga(state.idx); return; }
  const trazada = state.mapa.visual === 'trazada';
  const cajaMapa = $('mapa-canvas');
  const cajaTrazadas = $('mapa-trazadas');
  if (cajaMapa) { cajaMapa.classList.toggle('oculto', trazada); cajaMapa.style.display = ''; }
  if (cajaTrazadas) cajaTrazadas.classList.toggle('oculto', !trazada);
  if (trazada) { dibujarMapaTrazadas(datos); return; }
  dibujarMapaCanal(datos);
  dibujarAutoCarga(state.idx);
}

function dadosBoundsValidos(datos) {
  const b = datos.bounds;
  return b && b.min_x != null && b.max_x != null && b.min_y != null && b.max_y != null;
}

/* Vista única heatmap coloreada por el canal elegido. */
function dibujarMapaCanal(datos) {
  const cv = $('mapa');
  const pcv = prepararMapa(cv);
  if (!pcv) return;
  const { ctx, w, h } = pcv;
  const bounds = datos.bounds;
  dibujarGrillaFondo(ctx, w, h);
  const ref = trazaReferencia(datos.trazas);
  const canal = state.mapa.canal;
  const rango = rangoCanalDeTrazas(datos.trazas, canal);
  dibujarBandaPista(ctx, construirVistaMapa(cv, bounds).tf, state.mapa.bordes ? datos.pista : null);
  const vista = construirVistaMapa(cv, datos.bounds);
  for (const traza of datos.trazas) {
    dibujarTrazaCanalizada(ctx, vista.tf, traza, canal, rango, ref && mismaId(traza.id, ref.id));
  }
  dibujarMarcadoresRef(ctx, vista.tf, ref, { frenada: state.mapa.frenada, cambios: state.mapa.cambios });
  dibujarNumeralesCurvas(ctx, vista.tf, ref, datos.curvas);
  dibujarLeyendaCanal(ctx, w, h, rango.min, rango.max, canal);
  dibujarVivoMapa();
  if (!state.mapa.interaccion) {
    state.mapa.interaccion = true;
    adjuntarInteraccionMapa(cv, () => dibujarMapaCanal(state.mapaDatos));
  }
}

/* Mini-mapa por vuelta: banda + trazada fina por vuelta. */
function dibujarMapaTrazadas(datos) {
  const cont = $('mapa-trazadas');
  if (!cont) return;
  cont.style.display = 'flex';
  const trazas = datos.trazas;
  const key = trazas.map((t) => idVuelta(t.id)).join(',') + '|' + (state.mapa.bordes ? 'b' : 'n');
  if (cont.dataset.key !== key) {
    cont.innerHTML = '';
    cont.dataset.key = key;
    for (const traza of trazas) {
      const item = document.createElement('div');
      item.className = 'trazada-item';
      const nombre = trazaReferencia(trazas) && mismaId(traza.id, trazaReferencia(trazas).id) ? traza.etiqueta + ' (REF)' : traza.etiqueta;
      item.innerHTML =
        `<div class="trazada-titulo"><span class="trazada-dot" style="background:${colorDeVuelta(traza.id)}"></span>` +
        `<span class="trazada-nombre">${nombre}</span></div>`;
      const lienzo = document.createElement('div');
      lienzo.className = 'lienzo-mapa';
      const cv = document.createElement('canvas');
      cv.className = 'trazada-canvas';
      const capa = document.createElement('canvas');
      capa.className = 'capa-vivo';
      capa.setAttribute('aria-hidden', 'true');
      lienzo.append(cv, capa);
      item.appendChild(lienzo);
      adjuntarInteraccionMapa(cv, () => dibujarMapaTrazadas(state.mapaDatos));
      cont.appendChild(item);
    }
  }
  const canvases = cont.querySelectorAll('.trazada-canvas');
  for (let i = 0; i < trazas.length; i++) {
    const cv = canvases[i];
    if (!cv) continue;
    const pcv = prepararCanvas(cv, 300);
    if (!pcv) continue;
    dibujarGrillaFondo(pcv.ctx, pcv.w, pcv.h);
    const vista = construirVistaMapa(cv, datos.bounds);
    dibujarBandaPista(pcv.ctx, vista.tf, state.mapa.bordes ? datos.pista : null);
    dibujarTrazada(pcv.ctx, vista.tf, trazas[i], colorDeVuelta(trazas[i].id), 3);
    dibujarMarcadoresRef(pcv.ctx, vista.tf, trazas[i], { frenada: state.mapa.frenada, cambios: state.mapa.cambios });
    dibujarNumeralesCurvas(pcv.ctx, vista.tf, trazas[i], datos.curvas);
  }
  dibujarVivoMapa();
}

/* Posición en vivo sobre la capa transparente de cada mapa visible. */
function dibujarVivoMapa() {
  const datos = state.mapaDatos;
  if (!datos || !datos.trazas.length || !dadosBoundsValidos(datos)) return;
  if (state.mapa.visual === 'trazada') {
    const items = $('mapa-trazadas') ? $('mapa-trazadas').querySelectorAll('.trazada-item') : [];
    datos.trazas.forEach((traza, i) => {
      const item = items[i];
      // Una sola vuelta por mini-mapa: su punto va destacado aunque no sea la REF.
      if (item) pintarCapaVivo(item.querySelector('.capa-vivo'), item.querySelector('.trazada-canvas'), [traza], traza.id);
    });
  } else {
    const ref = trazaReferencia(datos.trazas);
    pintarCapaVivo($('mapa-vivo'), $('mapa'), datos.trazas, ref ? ref.id : null);
  }
}

/* La capa usa la misma vista (zoom/pan/3D) que el mapa de abajo. */
function pintarCapaVivo(capa, base, trazas, refId) {
  if (!capa || !base || !base.clientWidth) return;
  const c = prepararCanvas(capa, base.clientHeight);
  if (!c) return;
  const vista = construirVistaMapa(base, state.mapaDatos.bounds);
  dibujarPosicionVivo(c.ctx, vista.tf, trazas, refId);
}

/* Etiqueta del canal + escala. */
function dibujarLeyendaCanal(ctx, w, h, min, max, canal) {
  ctx.fillStyle = COLOR.apagado; ctx.font = '10px "Segoe UI"';
  ctx.fillText(canal, 10, h - 32);
  dibujarEscalaColor(ctx, w, h, min, max);
}

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
function dibujarAutoCarga(i) {
  const c = prepCanvas('chart-carga-vivo', 320);
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
