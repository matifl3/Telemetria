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

/* Mensaje legible de un rechazo (ErrorComando: {codigo, archivo, mensaje, offset}). */
function mensajeComando(error) {
  if (error && typeof error === 'object' && error.mensaje) {
    const archivo = error.archivo ? `<strong>${error.archivo}</strong>: ` : '';
    return `${archivo}${error.mensaje}`;
  }
  return String(error && error.mensaje ? error.mensaje : error);
}

/* Dibuja el bloque de avisos de la sesión (advertencias de carga) con archivo y motivo. */
function calcularAvisos(resumen) {
  if (!resumen || !resumen.avisos || !resumen.avisos.length) return;
  const items = resumen.avisos
    .map((a) => `<div class="aviso-item">${a.archivo ? '<strong>' + a.archivo + '</strong>: ' : ''}${a.mensaje}</div>`)
    .join('');
  mostrarError(items);
}
