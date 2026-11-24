'use strict';

/* Diseño del tablero guardado entre ejecuciones (constitución, principio 5):
   solo qué gráficos hay, su posición, tamaño y ajustes. Nunca datos del replay. */

const disenoTablero = (() => {
  const CLAVE = 'ac-telemetry-lab.tablero.v1';
  const VERSION = 1;
  const COLUMNAS = 12;

  const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

  /* Una tarjeta guardada válida, o null. Ajustes inválidos vuelven al defecto. */
  function validarTarjeta(t) {
    if (!t || typeof t !== 'object') return null;
    const def = graficoPorId(t.id);
    if (!def) return null;
    if (!entero(t.w, 1, COLUMNAS) || !entero(t.h, 1, 200)) return null;
    // x/y nulos = posición automática (tarjeta agregada con la grilla en 1 columna).
    const auto = t.x == null || t.y == null;
    if (!auto && (!entero(t.x, 0, COLUMNAS - 1) || !entero(t.y, 0, 10000) || t.x + t.w > COLUMNAS)) return null;
    const ajustes = ajustesPorDefecto(def);
    const guardados = t.ajustes && typeof t.ajustes === 'object' ? t.ajustes : {};
    for (const a of def.ajustes) {
      if (ajusteValido(a, guardados[a.clave])) ajustes[a.clave] = guardados[a.clave];
    }
    return { id: t.id, x: auto ? null : t.x, y: auto ? null : t.y, w: t.w, h: t.h, ajustes };
  }

  /* { tarjetas, aviso }: `aviso` si el diseño guardado no se pudo usar. */
  function leer() {
    let texto = null;
    try { texto = localStorage.getItem(CLAVE); } catch (e) { return { tarjetas: [], aviso: null }; }
    if (texto == null) return { tarjetas: [], aviso: null };
    let obj;
    try { obj = JSON.parse(texto); } catch (e) { obj = null; }
    if (!obj || obj.version !== VERSION || !Array.isArray(obj.tarjetas)) {
      return { tarjetas: [], aviso: 'No se pudo leer el diseño guardado del tablero: se empezó con el tablero vacío.' };
    }
    return { tarjetas: obj.tarjetas.map(validarTarjeta).filter(Boolean), aviso: null };
  }

  function guardar(tarjetas) {
    const limpio = tarjetas.map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, ajustes: t.ajustes }));
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ version: VERSION, tarjetas: limpio }));
    } catch (e) {
      console.warn('[tablero] no se pudo guardar el diseño', e);
    }
  }

  return { leer, guardar, CLAVE };
})();
