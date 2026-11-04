'use strict';

/* Reproductor: play/pausa/velocidad/loop/scrub y sincronización del cursor (RF-011). */

const ICONO_PLAY = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICONO_PAUSA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function fijarIconoPlay() {
  const b = $('btn-play');
  if (!b) return;
  b.innerHTML = state.playing ? ICONO_PAUSA : ICONO_PLAY;
  b.setAttribute('aria-pressed', String(state.playing));
  b.setAttribute('aria-label', state.playing ? 'Pausar vuelta' : 'Reproducir vuelta');
}

function togglePlay() {
  if (!state.grilla.length) return;
  if (!state.playing && state.dis >= state.longitudPista - 0.5 && state.longitudPista > 0) {
    state.dis = 0; state.idx = 0; actualizarPorIdx({ moverCursor: true });
  }
  state.playing = !state.playing;
  fijarIconoPlay();
  if (state.playing) { state.lastTs = performance.now(); state.raf = requestAnimationFrame(tick); }
  else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
}

function tick(ts) {
  if (!state.playing) return;
  try {
    const dt = Math.min(Math.max((ts - state.lastTs) / 1000, 0), 0.05);
    state.lastTs = ts;
    let vms = state.ultVms > 0 ? state.ultVms : 90;
    const canales = vueltaReferencia();
    if (canales) {
      const v = valorSerie(canales.velocidad_kmh, state.idx);
      if (v != null && v > 0) vms = v / 3.6;
    }
    state.ultVms = vms;
    let nueva = state.dis + dt * state.speedMult * vms;
    if (state.longitudPista > 0 && nueva >= state.longitudPista) {
      if (state.loop) nueva = nueva % state.longitudPista;
      else { nueva = state.longitudPista; togglePlay(); }
    }
    fijarDistancia(nueva);
    const redibujarMapa = state.tab === 'mapa' && state._tick % 3 === 0;
    state._tick++;
    actualizarPorIdx({ moverCursor: true, mapa: redibujarMapa });
  } catch (err) {
    console.error('[reproductor]', err);
  }
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

function irA(dist) { fijarDistancia(dist); actualizarPorIdx({ moverCursor: true }); }

function fijarDistancia(dist) {
  const p = state.longitudPista > 0 ? clampedPaso(dist) : dist;
  state.dis = Math.max(0, Math.min(state.longitudPista || 0, dist));
  state.idx = state.grilla.length ? clamp(Math.round(p / state.paso), 0, state.grilla.length - 1) : 0;
}

function clampedPaso(dist) { return Math.max(0, dist); }

function actualizarScrub() {
  const scrub = $('scrub');
  if (!scrub) return;
  const pct = state.longitudPista ? Math.min(100, (state.dis / state.longitudPista) * 100) : 0;
  scrub.value = Math.round(pct * 10);
  scrub.style.setProperty('--bait', pct + '%');
  $('scrub-dist').textContent = state.dis.toFixed(0) + ' m';
}

function vueltasVisibles() {
  const datos = state.datosVuelta;
  return (datos && datos.vueltas) || [];
}

function vueltaPorId(dtoId) {
  return vueltasVisibles().find((l) => mismaId(l.id, dtoId)) || null;
}

function vueltaReferencia() {
  const resumen = state.resumen;
  const refId = resumen && resumen.seleccion && resumen.seleccion.referencia;
  return refId ? vueltaPorId(refId) : vueltasVisibles()[0] || null;
}

/* Readouts + cursor + mapa: se llama en cada cambio de posición (RF-011). */
function actualizarPorIdx(opts = { moverCursor: true }) {
  actualizarScrub();
  const ref = vueltaReferencia();
  if (ref) {
    const v = valorSerie(ref.velocidad_kmh, state.idx);
    $('ro-vel').textContent = (v == null ? 0 : v).toFixed(1);
    $('ro-dist').textContent = (state.grilla[state.idx] ?? state.dis).toFixed(0);
    const gas = valorSerie(ref.acelerador, state.idx);
    $('ro-gas').textContent = ((gas == null ? 0 : gas) * 100).toFixed(0);
    const freno = valorSerie(ref.freno, state.idx);
    $('ro-freno').textContent = ((freno == null ? 0 : freno) * 100).toFixed(0);
    const marcha = valorSerie(ref.marcha, state.idx);
    $('ro-marcha').textContent = marcha == null ? '–' : Math.round(marcha);
    const tiempo = valorSerie(ref.tiempo, state.idx);
    $('ro-tiempo').textContent = (tiempo == null ? 0 : tiempo).toFixed(2);
  }
  if (opts.moverCursor) moverCursor();
  if (state.tab === 'mapa' && opts.mapa) dibujarMapaPestana({ soloVivo: true });
}

function iniciarReproductor() {
  $('btn-play').addEventListener('click', togglePlay);
  $('chk-loop').addEventListener('change', (e) => { state.loop = e.target.checked; });
  $('sel-velocidad').addEventListener('change', (e) => { state.speedMult = parseFloat(e.target.value); });
  $('scrub').addEventListener('input', (e) => irA((e.target.value / 1000) * state.longitudPista));
  fijarIconoPlay();

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (state.grilla.length) togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); irA(state.dis + state.paso * 10); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); irA(state.dis - state.paso * 10); }
  });
}
