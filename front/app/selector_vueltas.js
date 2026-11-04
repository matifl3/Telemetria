'use strict';

/* Selector de vueltas por auto (RF-005/013/016): etiqueta, motivo, REF/B y ojo. */

const ICONO_OJO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_TACHADO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ETIQUETA_MOTIVO = { salida: 'salida', entrada: 'entrada', cortada: 'cortada', incompleta: 'incompleta' };

const selectorVueltas = (() => {
  const colapsados = new Set();

  function render() {
    const ul = $('lista-vueltas');
    if (!ul) return;
    const resumen = state.resumen;
    if (!resumen || !resumen.autos.length) { ul.innerHTML = ''; return; }
    const refId = resumen.seleccion && resumen.seleccion.referencia;
    ul.innerHTML = '';
    for (const auto of resumen.autos) {
      const vueltas = resumen.vueltas.filter((v) => v.id.auto === auto.indice);
      if (!vueltas.length) continue;
      const colapsado = colapsados.has(auto.indice) && !auto.es_referencia;
      const grupo = document.createElement('li');
      grupo.className = 'auto-grupo';
      const validas = auto.vueltas_validas;
      grupo.innerHTML =
        `<div class="auto-cab${colapsado ? ' colapsado' : ''}" data-auto="${auto.indice}" role="button" tabindex="0" aria-expanded="${!colapsado}">` +
        `<span class="auto-nombre">${auto.piloto || auto.car_id}${auto.es_referencia ? ' <span class="ref-badge">REF</span>' : ''}</span>` +
        `<span class="auto-meta mono">${validas}/${auto.vueltas} válidas</span>` +
        `<span class="colapsar"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span>` +
        `</div>`;
      const ulVueltas = document.createElement('ul');
      ulVueltas.className = 'auto-vueltas';
      for (const v of vueltas) ulVueltas.appendChild(fila(v, refId));
      grupo.appendChild(ulVueltas);
      const cab = grupo.querySelector('.auto-cab');
      cab.addEventListener('click', () => toggleGrupo(cab));
      cab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGrupo(cab); } });
      ul.appendChild(grupo);
    }
  }

  function toggleGrupo(cab) {
    const auto = Number(cab.dataset.auto);
    if (colapsados.has(auto)) colapsados.delete(auto); else colapsados.add(auto);
    cab.classList.toggle('colapsado');
    cab.setAttribute('aria-expanded', String(!cab.classList.contains('colapsado')));
  }

  function fila(v, refId) {
    const li = document.createElement('li');
    const ref = refId && mismaId(v.id, refId);
    li.className = 'vuelta-item' + (ref ? ' ref' : '') + (v.visible ? '' : ' oculta') + (v.valida ? '' : ' no-valida');
    const tMeta = fmtTiempo(v.tiempo_s);
    li.innerHTML =
      `<span class="vuelta-color" style="background:${colorDeVuelta(v.id)}"></span>` +
      `<span class="vuelta-info"><span class="vuelta-nombre">${v.etiqueta}</span>` +
      `<span class="vuelta-meta">${tMeta ? tMeta + (v.valida ? '' : ' · no cuenta') : 'sin tiempo'}</span></span>` +
      (ref ? '<span class="ref-badge">REF</span>' : '') +
      (v.motivo ? `<span class="badge-no" title="No cuenta (vuelta ${ETIQUETA_MOTIVO[v.motivo] || v.motivo})">${ETIQUETA_MOTIVO[v.motivo] || v.motivo}</span>` : '') +
      `<button class="vuelta-eye ${v.visible ? 'on' : ''}" title="${v.visible ? 'Ocultar la vuelta' : 'Mostrar la vuelta'}" aria-pressed="${!!v.visible}" aria-label="${v.visible ? 'Ocultar la vuelta' : 'Mostrar la vuelta'}">${v.visible ? ICONO_OJO : ICONO_OJO_TACHADO}</button>`;
    li.querySelector('.vuelta-info').addEventListener('click', async () => {
      if (!v.valida) return;                          // inválidas no pueden ser REF (RF-016)
      if (mismaId(v.id, refId)) return;
      let resumen;
      try {
        resumen = await puente.fijarReferencia(v.id);
      } catch (err) {
        mostrarError(mensajeComando(err));
        return;
      }
      if (resumen) aplicarResumen(resumen);
    });
    const ojo = li.querySelector('.vuelta-eye');
    ojo.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!v.valida) return;
      try {
        const resumen = await puente.alternarVuelta(v.id);
        aplicarResumen(resumen);
      } catch (err) {
        mostrarError(mensajeComando(err));
      }
    });
    if (!v.valida) ojo.disabled = true;
    return li;
  }

  /* Selectores "vs B" de Comparación y Curvas: lista de visibles ≠ REF. */
  function poblarSelB() {
    const resumen = state.resumen;
    const refId = resumen && resumen.seleccion && resumen.seleccion.referencia;
    const bId = resumen && resumen.seleccion && resumen.seleccion.b;
    const opciones = state.resumen.vueltas
      .filter((v) => v.visible && !mismaId(v.id, refId) && (!refId || v.id.auto === refId.auto))
      .map((v) => `<option value="${idVuelta(v.id)}"${bId && mismaId(v.id, bId) ? ' selected' : ''}>${v.etiqueta}</option>`)
      .join('');
    for (const idSel of ['sel-lap-b', 'sel-lap-b-curvas']) {
      const s = $(idSel);
      if (!s) continue;
      s.innerHTML = opciones;
    }
    for (const idA of ['vs-a', 'vs-a-curvas']) {
      const el = $(idA);
      if (el) el.textContent = refId ? vueltaParaTexto(refId) : '–';
    }
  }

  function vueltaParaTexto(dtoId) {
    const v = state.resumen.vueltas.find((x) => mismaId(x.id, dtoId));
    return v ? v.etiqueta : '–';
  }

  async function fijarBDesdeSelect(sel, pestanaRender) {
    const valor = sel.value;
    if (!valor) return;
    const dtoB = state.resumen.vueltas.map((v) => v.id).find((id) => idVuelta(id) === valor);
    if (!dtoB) return;
    try {
      const resumen = await puente.fijarB(dtoB);
      aplicarResumen(resumen);
      if (pestanaRender) pestanaRender();
    } catch (err) {
      mostrarError(mensajeComando(err));
    }
  }

  return { render, poblarSelB, fijarBDesdeSelect };
})();
