'use strict';

/* Catálogo de gráficos del tablero. Cada módulo de `graficos/` registra los suyos
   con `registrarGrafico`. El `id` es estable: es lo que se guarda en el diseño. */

const CATEGORIAS_GRAFICOS = [
  { id: 'una-vuelta', nombre: 'Una vuelta', ayuda: 'Canales de cada vuelta visible a lo largo de la pista.' },
  { id: 'mapas', nombre: 'Mapas', ayuda: 'La pista vista desde arriba.' },
  { id: 'conjunto', nombre: 'Conjunto', ayuda: 'Usa todas las vueltas válidas del auto de la REF.' },
  { id: 'comparacion', nombre: 'Comparación A/B', ayuda: 'A es la REF y B la vuelta elegida en el panel lateral.' },
  { id: 'curvas', nombre: 'Curvas', ayuda: 'Curvas detectadas en el fast_lane.ai, numeradas C1..Cn.' },
];

const CATALOGO_GRAFICOS = [];

/* Definición de un gráfico:
   - id, nombre, unidad, descripcion, categoria (una de CATEGORIAS_GRAFICOS).
   - fuente: DTO del backend que necesita ('vuelta', 'mapa', 'conjunto',
     'comparacion', 'curvas') o una función (ajustes) → { pestana, rot, alt }.
   - necesitaB: muestra un aviso si no hay vuelta B elegida.
   - tamano: { w, h } inicial en celdas de la grilla (12 columnas).
   - ajustes: [{ clave, etiqueta, tipo: 'select' | 'check' | 'rango', opciones,
     min, max, paso, valor, activo(ajustes) }], editables desde la tarjeta.
   - uplot(datos, ajustes) → { plots: [{ titulo, color, data, series, yRango,
     yLabel }] } o { vacio: 'mensaje' }: gráfico de líneas sobre la distancia de
     pista, con regla de curvas y «Ver en grande».
   - o bien montar(cuerpo, datos, ajustes, tarjeta) → { redimensionar, alCursor,
     destruir, ampliar }: dibujo propio dentro de `cuerpo`. */
function registrarGrafico(def) {
  if (CATALOGO_GRAFICOS.some((g) => g.id === def.id)) throw new Error(`Gráfico repetido: ${def.id}`);
  CATALOGO_GRAFICOS.push({ fuente: 'vuelta', ajustes: [], necesitaB: false, ...def, tamano: { w: 6, h: 6, ...def.tamano } });
}

const graficoPorId = (id) => CATALOGO_GRAFICOS.find((g) => g.id === id) || null;

/* Valores por defecto de los ajustes de un gráfico. */
function ajustesPorDefecto(def) {
  const aj = {};
  for (const a of def.ajustes) aj[a.clave] = a.valor;
  return aj;
}

/* Valida un valor guardado contra la definición del ajuste. */
function ajusteValido(a, valor) {
  if (a.tipo === 'select') return a.opciones.some(([v]) => v === valor);
  if (a.tipo === 'check') return typeof valor === 'boolean';
  if (a.tipo === 'rango') return typeof valor === 'number' && valor >= a.min && valor <= a.max;
  return false;
}

/* Fuente de datos de una tarjeta según sus ajustes: { pestana, rot, alt }. */
function fuenteDe(def, ajustes) {
  const f = typeof def.fuente === 'function' ? def.fuente(ajustes) : { pestana: def.fuente };
  return { pestana: f.pestana, rot: f.rot ?? 0, alt: f.alt ?? 0 };
}

/* Mensaje centrado dentro del cuerpo de una tarjeta. */
function mensajeTarjeta(cuerpo, texto) {
  const p = document.createElement('p');
  p.className = 'tarjeta-mensaje';
  p.textContent = texto;
  cuerpo.appendChild(p);
}

/* Gráfico de canvas que se redibuja entero al cambiar de tamaño.
   `dibujar(cv, datos, extra)` recibe { ajustes, tooltip, cuerpo }.
   Opciones: tooltip (crea el globo), vivo (redibuja con el reproductor),
   ampliar(datos) (acción de «Ver en grande»). */
function graficoCanvas(dibujar, opciones = {}) {
  return (cuerpo, datos, ajustes, tarjeta) => {
    const cv = document.createElement('canvas');
    cv.className = 'lienzo';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', tarjeta.def.nombre);
    cuerpo.appendChild(cv);
    let tooltip = null;
    if (opciones.tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'grafico-tooltip';
      tooltip.hidden = true;
      cuerpo.appendChild(tooltip);
    }
    const extra = { ajustes, tooltip, cuerpo };
    const redibujar = () => { if (cv.clientWidth) dibujar(cv, datos, extra); };
    redibujar();
    return {
      redimensionar: redibujar,
      alCursor: opciones.vivo ? redibujar : null,
      ampliar: opciones.ampliar ? () => opciones.ampliar(datos) : null,
    };
  };
}

/* Gráfico de HTML (tablas y resúmenes): no depende del tamaño de la tarjeta. */
function graficoHTML(render) {
  return (cuerpo, datos, ajustes) => {
    const cont = document.createElement('div');
    cont.className = 'tarjeta-html';
    cuerpo.appendChild(cont);
    render(cont, datos, ajustes);
    return {};
  };
}
