'use strict';

/* Selector de vueltas (RF-005/013/016): dos secciones, REF/B, ojo y orden fijo. */

const ICONO_OJO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_TACHADO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ICONO_FLECHA = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const selectorVueltas = (() => {
  const colapsadas = new Set(); // 'jugador' | 'otros'
  let ocupado = false;

  function render() {
    const cont = $('lista-vueltas');
    if (!cont) return;
    const resumen = state.resumen;
    if (!resumen || !resumen.autos.length) {
      colapsadas.clear();
      cont.innerHTML = '';
      return;
    }

    const foco = capturarFoco(cont);
    const refId = resumen.seleccion && resumen.seleccion.referencia;
    const bId = resumen.seleccion && resumen.seleccion.b;
    const validas = resumen.vueltas.filter((v) => v.valida);
    const autoJugador = resumen.autos.find((auto) => auto.indice === resumen.indice_jugador) || null;
    const vueltasJugador = autoJugador
      ? validas.filter((v) => v.id.auto === autoJugador.indice)
      : [];
    const vueltasOtros = validas
      .filter((v) => !autoJugador || v.id.auto !== autoJugador.indice)
      .sort(compararVueltas);

    cont.innerHTML = '';
    cont.appendChild(seccion(
      'jugador',
      'Tus vueltas',
      autoJugador,
      vueltasJugador,
      refId,
      bId,
      autoJugador
        ? 'El jugador no tiene vueltas válidas en este replay.'
        : 'No se pudo identificar al jugador en este replay.',
    ));

    if (vueltasOtros.length) {
      cont.appendChild(seccion('otros', 'Otros autos', null, vueltasOtros, refId, bId, ''));
    }

    restaurarFoco(cont, foco);
  }

  /* Orden fijo: tiempo ascendente, nulos al final y empate estable por vuelta. */
  function compararVueltas(a, b) {
    const ta = Number.isFinite(a.tiempo_s) ? a.tiempo_s : Infinity;
    const tb = Number.isFinite(b.tiempo_s) ? b.tiempo_s : Infinity;
    if (ta !== tb) return ta - tb;
    if (a.id.auto !== b.id.auto) return a.id.auto - b.id.auto;
    return a.id.numero_local - b.id.numero_local;
  }

  function seccion(clave, titulo, auto, vueltas, refId, bId, mensajeVacio) {
    const caja = document.createElement('section');
    caja.className = 'seccion-vueltas';
    caja.dataset.seccion = clave;

    const cab = document.createElement('button');
    cab.type = 'button';
    cab.className = 'seccion-cab';
    cab.dataset.foco = `seccion:${clave}`;
    const colapsada = colapsadas.has(clave);
    cab.classList.toggle('colapsado', colapsada);
    cab.setAttribute('aria-expanded', String(!colapsada));

    const nombre = document.createElement('span');
    nombre.className = 'seccion-titulo';
    nombre.textContent = titulo;

    const meta = document.createElement('span');
    meta.className = 'seccion-meta';
    const cuenta = `${vueltas.length} ${vueltas.length === 1 ? 'vuelta válida' : 'vueltas válidas'}`;
    if (auto) {
      const piloto = auto.piloto || auto.car_id;
      meta.textContent = `${piloto} · ${cuenta}`;
      meta.title = `${piloto} · ${cuenta}`;
    } else {
      meta.textContent = `${cuenta} · de más rápida a más lenta`;
    }

    const flecha = document.createElement('span');
    flecha.className = 'colapsar';
    flecha.setAttribute('aria-hidden', 'true');
    flecha.innerHTML = ICONO_FLECHA;

    cab.append(nombre, meta, flecha);
    caja.appendChild(cab);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'seccion-cuerpo';
    cuerpo.id = `seccion-${clave}-lista`;
    cab.setAttribute('aria-controls', cuerpo.id);

    if (!vueltas.length) {
      const vacio = document.createElement('p');
      vacio.className = 'lista-vacia';
      vacio.textContent = mensajeVacio;
      cuerpo.appendChild(vacio);
    } else {
      const lista = document.createElement('ul');
      lista.className = 'seccion-lista';
      for (const v of vueltas) lista.appendChild(fila(v, refId, bId));
      cuerpo.appendChild(lista);
    }

    caja.appendChild(cuerpo);
    caja.classList.toggle('colapsada', colapsada);
    cab.addEventListener('click', () => alternarSeccion(caja, cab));
    return caja;
  }

  function alternarSeccion(caja, cab) {
    const clave = caja.dataset.seccion;
    const colapsada = !colapsadas.has(clave);
    if (colapsada) colapsadas.add(clave);
    else colapsadas.delete(clave);
    caja.classList.toggle('colapsada', colapsada);
    cab.classList.toggle('colapsado', colapsada);
    cab.setAttribute('aria-expanded', String(!colapsada));
  }

  function fila(v, refId, bId) {
    const id = idVuelta(v.id);
    const ref = mismaId(v.id, refId);
    const b = mismaId(v.id, bId);
    const li = document.createElement('li');
    li.className = 'vuelta-item' + (ref ? ' ref' : '') + (b ? ' b' : '') + (v.visible ? '' : ' oculta');
    li.dataset.vuelta = id;

    const color = document.createElement('span');
    color.className = 'vuelta-color';
    color.style.background = colorDeVuelta(v.id);
    li.appendChild(color);

    const tiempo = fmtTiempo(v.tiempo_s) || 'sin tiempo';
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'vuelta-info';
    info.dataset.foco = `info:${id}`;
    info.title = ref ? 'Esta vuelta ya es la REF' : 'Fijar como REF';
    info.setAttribute('aria-label', ref
      ? `Vuelta ${v.etiqueta}, tiempo ${tiempo}, ya es la REF`
      : `Vuelta ${v.etiqueta}, tiempo ${tiempo}. Fijar como REF`);
    const nombre = document.createElement('span');
    nombre.className = 'vuelta-nombre';
    nombre.textContent = v.etiqueta;
    info.appendChild(nombre);
    info.addEventListener('click', () => {
      if (ref) return;
      ejecutar(() => puente.fijarReferencia(v.id));
    });
    li.appendChild(info);

    const tiempoEl = document.createElement('span');
    tiempoEl.className = 'vuelta-tiempo' + (Number.isFinite(v.tiempo_s) ? '' : ' sin-tiempo');
    tiempoEl.textContent = tiempo;
    li.appendChild(tiempoEl);

    if (ref) li.appendChild(badge('REF', 'ref-badge'));
    if (b) li.appendChild(badge('B', 'b-badge'));

    const roles = document.createElement('div');
    roles.className = 'vuelta-roles';
    roles.setAttribute('role', 'group');
    roles.setAttribute('aria-label', `Rol de la vuelta ${v.etiqueta}`);

    const btnRef = botonRol('REF', ref, `Fijar como REF la vuelta ${v.etiqueta}`, `ref:${id}`);
    btnRef.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ref) return;
      ejecutar(() => puente.fijarReferencia(v.id));
    });
    roles.appendChild(btnRef);

    const btnB = botonRol('B', b, `Fijar como B la vuelta ${v.etiqueta}`, `b:${id}`);
    if (ref) {
      btnB.disabled = true;
      btnB.title = 'No se puede fijar como B: la vuelta ya es REF';
      btnB.setAttribute('aria-label', `No se puede fijar como B la vuelta ${v.etiqueta}: ya es REF`);
    } else {
      btnB.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (b) return;
        ejecutar(() => puente.fijarB(v.id));
      });
    }
    roles.appendChild(btnB);
    li.appendChild(roles);

    const ojo = document.createElement('button');
    ojo.type = 'button';
    ojo.className = 'vuelta-eye' + (v.visible ? ' on' : '');
    ojo.dataset.foco = `eye:${id}`;
    ojo.title = v.visible ? 'Ocultar la vuelta' : 'Mostrar la vuelta';
    ojo.setAttribute('aria-pressed', String(!!v.visible));
    ojo.setAttribute('aria-label', v.visible ? `Ocultar la vuelta ${v.etiqueta}` : `Mostrar la vuelta ${v.etiqueta}`);
    ojo.innerHTML = v.visible ? ICONO_OJO : ICONO_OJO_TACHADO;
    ojo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ejecutar(() => puente.alternarVuelta(v.id));
    });
    li.appendChild(ojo);

    return li;
  }

  function botonRol(texto, activo, etiqueta, foco) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rol-btn';
    btn.dataset.foco = foco;
    btn.textContent = texto;
    btn.setAttribute('aria-pressed', String(activo));
    btn.setAttribute('aria-label', etiqueta);
    return btn;
  }

  function badge(texto, clase) {
    const span = document.createElement('span');
    span.className = clase;
    span.textContent = texto;
    return span;
  }

  /* Evita respuestas fuera de orden: una sola operación de rol u ojo a la vez. */
  async function ejecutar(accion) {
    if (ocupado) return;
    ocupado = true;
    const cont = $('lista-vueltas');
    if (cont) {
      cont.classList.add('ocupado');
      cont.setAttribute('aria-busy', 'true');
    }
    try {
      const resumen = await accion();
      if (resumen) await aplicarResumen(resumen);
    } catch (err) {
      mostrarError(mensajeComando(err));
    } finally {
      ocupado = false;
      if (cont) {
        cont.classList.remove('ocupado');
        cont.removeAttribute('aria-busy');
      }
    }
  }

  function capturarFoco(cont) {
    const activo = document.activeElement;
    if (!activo || !cont.contains(activo)) return null;
    return activo.dataset.foco || null;
  }

  function restaurarFoco(cont, clave) {
    if (!clave) return;
    let destino = buscarFoco(cont, clave);
    if (!destino) {
      const id = clave.slice(clave.indexOf(':') + 1);
      for (const accion of ['info', 'ref', 'b', 'eye']) {
        destino = buscarFoco(cont, `${accion}:${id}`);
        if (destino) break;
      }
    }
    if (!destino) destino = buscarFoco(cont, 'seccion:jugador') || buscarFoco(cont, 'seccion:otros');
    if (destino) destino.focus({ preventScroll: true });
  }

  function buscarFoco(cont, clave) {
    for (const nodo of cont.querySelectorAll('[data-foco]')) {
      if (nodo.dataset.foco === clave && !nodo.disabled) return nodo;
    }
    return null;
  }

  /* Selectores "vs B" de Comparación y Curvas: lista de visibles ≠ REF. */
  function poblarSelB() {
    const resumen = state.resumen;
    const refId = resumen && resumen.seleccion && resumen.seleccion.referencia;
    const bId = resumen && resumen.seleccion && resumen.seleccion.b;
    const opciones = state.resumen.vueltas
      .filter((v) => v.visible && !mismaId(v.id, refId))
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
