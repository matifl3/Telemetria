'use strict';

/* Avisos del front: errores de comandos y avisos de la sesión (RF-003/006). */

function mostrarError(html) {
  const e = $('error-aviso');
  if (!e) return;
  e.innerHTML = html;
  e.classList.remove('oculto');
}

function ocultarError() {
  const e = $('error-aviso');
  if (e) e.classList.add('oculto');
}

function claveAviso(aviso) {
  return JSON.stringify([aviso.codigo || '', aviso.archivo || '', aviso.mensaje || '']);
}

function renderizarAvisos() {
  const lista = $('lista-avisos');
  const vacio = $('avisos-vacio');
  const contador = $('contador-avisos');
  const boton = $('btn-avisos');
  if (!lista || !vacio || !contador || !boton) return;

  lista.replaceChildren();
  vacio.classList.toggle('oculto', state.avisos.length > 0);
  contador.textContent = String(state.avisos.length);
  contador.classList.toggle('oculto', state.avisos.length === 0);

  const sufijo = state.avisos.length === 1 ? 'aviso' : 'avisos';
  boton.setAttribute(
    'aria-label',
    state.avisos.length
      ? `Ver avisos de la sesión: ${state.avisos.length} ${sufijo}`
      : 'Ver avisos de la sesión; no hay avisos'
  );
  const botonLimpiar = $('btn-limpiar-avisos');
  if (botonLimpiar) botonLimpiar.disabled = state.avisos.length === 0;

  state.avisos.forEach((aviso) => {
    const item = document.createElement('article');
    item.className = 'aviso-guardado';
    if (aviso.archivo) {
      const archivo = document.createElement('strong');
      archivo.textContent = aviso.archivo;
      item.appendChild(archivo);
    }
    const mensaje = document.createElement('p');
    mensaje.textContent = aviso.mensaje;
    item.appendChild(mensaje);
    lista.appendChild(item);
  });
}

function calcularAvisos(resumen) {
  if (!resumen || !resumen.avisos || !resumen.avisos.length) return;
  const nuevos = [];
  resumen.avisos.forEach((aviso) => {
    const clave = claveAviso(aviso);
    if (state.avisosProcesados.has(clave)) return;
    state.avisosProcesados.add(clave);
    nuevos.push(aviso);
  });
  if (!nuevos.length) return;

  state.avisos.push(...nuevos);
  renderizarAvisos();
  const estado = $('estado-avisos');
  if (estado) {
    const cantidad = nuevos.length;
    estado.textContent = `Se ${cantidad === 1 ? 'guardó 1 aviso' : `guardaron ${cantidad} avisos`}. Total: ${state.avisos.length}.`;
  }
}

function limpiarAvisosSesion() {
  state.avisos = [];
  state.avisosProcesados.clear();
  renderizarAvisos();
  const estado = $('estado-avisos');
  if (estado) estado.textContent = 'Se limpiaron los avisos de la sesión.';
}

function vaciarAvisos() {
  state.avisos = [];
  renderizarAvisos();
  const estado = $('estado-avisos');
  if (estado) estado.textContent = 'Se vació el historial de avisos.';
}

function iniciarAvisos() {
  const menu = $('menu-avisos');
  const boton = $('btn-avisos');
  const panel = $('panel-avisos');
  const limpiar = $('btn-limpiar-avisos');
  if (!menu || !boton || !panel || !limpiar) return;

  const cerrar = () => {
    panel.classList.add('oculto');
    boton.setAttribute('aria-expanded', 'false');
  };

  boton.addEventListener('click', () => {
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    panel.classList.toggle('oculto', abierto);
    boton.setAttribute('aria-expanded', String(!abierto));
  });
  limpiar.addEventListener('click', vaciarAvisos);
  document.addEventListener('click', (evento) => {
    if (!menu.contains(evento.target)) cerrar();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && boton.getAttribute('aria-expanded') === 'true') {
      cerrar();
      boton.focus();
    }
  });
  renderizarAvisos();
}

/* Mensaje legible de un rechazo (ErrorComando: {codigo, archivo, mensaje, offset}). */
function mensajeComando(error) {
  if (error && typeof error === 'object' && error.mensaje) {
    const archivo = error.archivo ? `<strong>${error.archivo}</strong>: ` : '';
    return `${archivo}${error.mensaje}`;
  }
  return String(error && error.mensaje ? error.mensaje : error);
}
