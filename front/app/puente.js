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

  async function abrirDialogo(tipo) {
    return invocar('abrir_dialogo', { tipo });
  }

  async function cargarArchivos(rutas) {
    return invocar('cargar_archivos', { rutas });
  }

  async function cargarPista(ruta) {
    return invocar('cargar_pista', { ruta });
  }

  /* --- datos por fuente (DTO de cada «pestaña» del backend) ---
     Caché por versión de sesión y por proyección (rotación/elevación del mapa).
     Varias tarjetas que piden la misma fuente a la vez comparten el pedido. */

  const enCurso = new Map();

  async function pedirPestana(pestana, rotacion = 0, elevacion = 0) {
    const version = state.version;
    const clave = `${pestana}|${rotacion}|${elevacion}`;
    const cache = state.cacheDatos.get(clave);
    if (cache && cache.version === version) return cache.datos;
    const claveCurso = `${version}|${clave}`;
    if (enCurso.has(claveCurso)) return enCurso.get(claveCurso);
    const pedido = invocar('datos_pestana', { pestana, rotacion, elevacion })
      .then((respuesta) => {
        // La respuesta es el enum etiquetado {pestana, datos}; se cachean los datos crudos.
        if (state.version === version) state.cacheDatos.set(clave, { version, datos: respuesta.datos });
        return respuesta.datos;
      })
      .finally(() => enCurso.delete(claveCurso));
    enCurso.set(claveCurso, pedido);
    return pedido;
  }

  /* --- selección (devuelven siempre un DtoResumen fresco) --- */

  async function alternarVuelta(id) {
    return invocar('alternar_vuelta', { auto: id.auto, numeroLocal: id.numero_local });
  }

  async function establecerVisibilidadVueltas(visible) {
    return invocar('establecer_visibilidad_vueltas', { visible });
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

  return { abrirDialogo, cargarArchivos, cargarPista, pedirPestana, alternarVuelta, establecerVisibilidadVueltas, fijarReferencia, fijarB, limpiarSesion };
})();
