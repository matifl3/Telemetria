'use strict';

/* Puente con los comandos de Tauri (DTO en snake_case, args en camelCase). */

const puente = (() => {
  let core = null;
  function tauri() {
    if (core) return core;
    core = window.__TAURI__ && window.__TAURI__.core;
    if (!core) throw new Error('No se pudo arrancar el puente con Tauri.');
    return core;
  }

  async function invocar(comando, args) {
    return tauri().invoke(comando, args || {});
  }

  /* --- carga --- */

  async function abrirDialogo() {
    return invocar('abrir_dialogo');
  }

  async function cargarArchivos(rutas) {
    return invocar('cargar_archivos', { rutas });
  }

  async function cargarPista(ruta) {
    return invocar('cargar_pista', { ruta });
  }

  /* --- datos por pestaña (con caché por versión de sesión) --- */

  async function pedirPestana(pestana, rotacion = 0, elevacion = 0) {
    const version = state.version;
    const cache = state.cacheDatos.get(pestana);
    if (cache && cache.version === version && cache.rot === rotacion && cache.alt === elevacion) {
      return cache.datos;
    }
    const respuesta = await invocar('datos_pestana', { pestana, rotacion, elevacion });
    // La respuesta es el enum etiquetado {pestana, datos}; cacheamos los datos crudos.
    if (state.version === version) {
      state.cacheDatos.set(pestana, { version, rot: rotacion, alt: elevacion, datos: respuesta.datos });
    }
    return respuesta.datos;
  }

  /* --- selección (devuelven siempre un DtoResumen fresco) --- */

  async function alternarVuelta(id) {
    return invocar('alternar_vuelta', { auto: id.auto, numeroLocal: id.numero_local });
  }

  async function fijarReferencia(id) {
    return invocar('fijar_referencia', { auto: id.auto, numeroLocal: id.numero_local });
  }

  async function fijarB(id) {
    return invocar('fijar_b', { auto: id.auto, numeroLocal: id.numero_local });
  }

  async function limpiarSesion() {
    return invocar('limpiar_sesion');
  }

  return { abrirDialogo, cargarArchivos, cargarPista, pedirPestana, alternarVuelta, fijarReferencia, fijarB, limpiarSesion };
})();
