'use strict';

/* Tarjeta del tablero: cabecera arrastrable con sus acciones, paneles de ajustes
   y de mover/tamaño (teclado), regla de curvas propia y cuerpo del gráfico.
   También el montaje genérico de gráficos uPlot (uno o varios por tarjeta). */

const ALTO_MIN_PLOT = 70;   // alto mínimo de un uPlot dentro de una tarjeta (px)
const EXTRA_MINI = 52;      // título, relleno y separación de cada mini-gráfico (px)

/* Crea la tarjeta (sin montar el gráfico). `acciones` recibe los callbacks del
   tablero: quitar, mover, cambiarAjuste, ampliar. */
function crearTarjeta(uid, def, ajustes, acciones) {
  const t = { uid, def, ajustes, instancia: null, montaje: 0 };

  const item = document.createElement('div');
  item.className = 'grid-stack-item';
  const tarjeta = document.createElement('div');
  tarjeta.className = 'grid-stack-item-content tarjeta';
  tarjeta.setAttribute('role', 'region');
  tarjeta.tabIndex = -1;
  const idTitulo = `${uid}-titulo`;
  tarjeta.setAttribute('aria-labelledby', idTitulo);

  const cab = document.createElement('div');
  cab.className = 'tarjeta-cab';
  cab.title = 'Arrastrá el título para mover la tarjeta';
  const titulo = document.createElement('h2');
  titulo.className = 'tarjeta-titulo';
  titulo.id = idTitulo;
  titulo.textContent = def.nombre + ' ';
  const subtitulo = document.createElement('span');
  subtitulo.className = 'unidad';
  subtitulo.textContent = def.unidad || '';
  titulo.appendChild(subtitulo);
  // Subtítulo que depende de los datos (p. ej. la vuelta de una trazada), con su color.
  t.fijarSubtitulo = (texto, color = '') => {
    subtitulo.textContent = texto;
    subtitulo.style.color = color;
  };
  const botones = document.createElement('div');
  botones.className = 'tarjeta-acciones';
  const boton = (texto, etiqueta, alClic) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn fantasma tarjeta-btn';
    b.textContent = texto;
    b.setAttribute('aria-label', etiqueta);
    b.title = etiqueta;
    b.addEventListener('click', alClic);
    botones.appendChild(b);
    return b;
  };
  t.botonAmpliar = boton('⤢', `Ver en grande: ${def.nombre}`, () => acciones.ampliar(t, t.botonAmpliar));
  t.botonAmpliar.disabled = true;
  const panelAjustes = document.createElement('div');
  panelAjustes.className = 'tarjeta-panel oculto';
  panelAjustes.id = `${uid}-ajustes`;
  if (def.ajustes.length) {
    t.botonAjustes = boton('⚙', `Ajustes de ${def.nombre}`, () => alternarPanel(t.botonAjustes, panelAjustes));
    t.botonAjustes.setAttribute('aria-expanded', 'false');
    t.botonAjustes.setAttribute('aria-controls', panelAjustes.id);
    construirAjustes(t, panelAjustes, acciones);
  }
  const panelMover = document.createElement('div');
  panelMover.className = 'tarjeta-panel tarjeta-mover oculto';
  panelMover.id = `${uid}-mover`;
  t.botonMover = boton('⋯', `Mover o cambiar el tamaño de ${def.nombre}`, () => alternarPanel(t.botonMover, panelMover));
  t.botonMover.setAttribute('aria-expanded', 'false');
  t.botonMover.setAttribute('aria-controls', panelMover.id);
  construirMover(t, panelMover, acciones);
  boton('✕', `Quitar ${def.nombre}`, () => acciones.quitar(t));
  cab.append(titulo, botones);

  const regla = document.createElement('canvas');
  regla.className = 'tarjeta-regla';
  regla.setAttribute('role', 'img');
  regla.setAttribute('aria-label', 'Regla de curvas: cada tramo de color es una curva de la pista');
  regla.hidden = true;

  const cuerpo = document.createElement('div');
  cuerpo.className = 'tarjeta-cuerpo';

  tarjeta.append(cab, panelAjustes, panelMover, regla, cuerpo);
  item.appendChild(tarjeta);
  Object.assign(t, { el: item, contenido: tarjeta, cuerpo, regla });
  return t;
}

function alternarPanel(boton, panel) {
  const abrir = panel.classList.contains('oculto');
  panel.classList.toggle('oculto', !abrir);
  boton.setAttribute('aria-expanded', String(abrir));
}

/* Controles de ajustes generados desde la definición del gráfico. */
function construirAjustes(t, panel, acciones) {
  const controles = [];
  for (const a of t.def.ajustes) {
    const etiqueta = document.createElement('label');
    etiqueta.className = a.tipo === 'check' ? 'check' : '';
    let control;
    if (a.tipo === 'select') {
      control = document.createElement('select');
      for (const [valor, texto] of a.opciones) {
        const op = document.createElement('option');
        op.value = valor;
        op.textContent = texto;
        control.appendChild(op);
      }
      control.value = t.ajustes[a.clave];
      control.addEventListener('change', () => acciones.cambiarAjuste(t, a.clave, control.value));
      etiqueta.append(a.etiqueta + ' ', control);
    } else if (a.tipo === 'check') {
      control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = t.ajustes[a.clave];
      control.addEventListener('change', () => acciones.cambiarAjuste(t, a.clave, control.checked));
      etiqueta.append(control, ' ' + a.etiqueta);
    } else if (a.tipo === 'rango') {
      control = document.createElement('input');
      control.type = 'range';
      control.min = a.min; control.max = a.max; control.step = a.paso;
      control.value = t.ajustes[a.clave];
      // Los rangos piden datos al backend: se espera a que el usuario se detenga.
      let espera = null;
      control.addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(() => acciones.cambiarAjuste(t, a.clave, parseFloat(control.value)), 150);
      });
      etiqueta.append(a.etiqueta + ' ', control);
    }
    controles.push({ a, control });
    panel.appendChild(etiqueta);
  }
  // Ajustes que dependen de otros (rotación/elevación solo con 3D).
  t.actualizarAjustes = () => {
    for (const { a, control } of controles) control.disabled = a.activo ? !a.activo(t.ajustes) : false;
  };
  t.actualizarAjustes();
}

/* Mover y redimensionar sin mouse: Gridstack no tiene soporte de teclado. */
function construirMover(t, panel, acciones) {
  const grupos = [
    ['Mover', [['←', 'Mover a la izquierda', -1, 0, 0, 0], ['→', 'Mover a la derecha', 1, 0, 0, 0],
      ['↑', 'Mover arriba', 0, -1, 0, 0], ['↓', 'Mover abajo', 0, 1, 0, 0]]],
    ['Tamaño', [['Ancho −', 'Más angosta', 0, 0, -1, 0], ['Ancho +', 'Más ancha', 0, 0, 1, 0],
      ['Alto −', 'Más baja', 0, 0, 0, -1], ['Alto +', 'Más alta', 0, 0, 0, 1]]],
  ];
  for (const [nombre, botones] of grupos) {
    const grupo = document.createElement('div');
    grupo.className = 'tarjeta-mover-grupo';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', nombre);
    const et = document.createElement('span');
    et.className = 'tarjeta-mover-etiqueta';
    et.textContent = nombre;
    grupo.appendChild(et);
    for (const [texto, etiqueta, dx, dy, dw, dh] of botones) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn fantasma tarjeta-btn';
      b.textContent = texto;
      b.setAttribute('aria-label', etiqueta);
      b.addEventListener('click', () => acciones.mover(t, dx, dy, dw, dh));
      grupo.appendChild(b);
    }
    panel.appendChild(grupo);
  }
}

// ===== Gráficos uPlot dentro de una tarjeta (o de «Ver en grande») =====

/* Contenedores de uno o varios uPlot. Varios plots (pedales: uno por vuelta) van
   en cajas con su título. Devuelve el div de cada plot. */
function cajasDePlots(cont, plots) {
  if (plots.length === 1) {
    const div = document.createElement('div');
    div.className = 'plot';
    cont.appendChild(div);
    return [div];
  }
  return plots.map((p) => {
    const caja = document.createElement('div');
    caja.className = 'mini-grafico';
    const titulo = document.createElement('div');
    titulo.className = 'mini-titulo';
    if (p.color) titulo.style.color = p.color;
    titulo.textContent = p.titulo || '';
    const div = document.createElement('div');
    div.className = 'plot';
    caja.append(titulo, div);
    cont.appendChild(caja);
    return div;
  });
}

/* Crea un uPlot por plot. `registrar` los suma a state.charts.lines para que el
   reproductor mueva su cursor; `zoomX` y `hooks` son para «Ver en grande». */
function crearUplots(divs, plots, { zoomX = false, registrar = true, hooks = null } = {}) {
  return plots.map((p, k) => {
    const o = opcionesGrafico(divs[k], 150, p.yRango, p.yLabel, zoomX);
    o.series = p.series;
    if (hooks) Object.assign(o.hooks, hooks);
    const u = new uPlot(o, p.data, divs[k]);
    if (registrar) state.charts.lines.push({ u, cont: divs[k], height: u.height });
    return u;
  });
}

/* Ajusta cada uPlot al ancho de su div y al alto disponible `alto`, repartido
   entre varios. Descuenta la leyenda real de cada uno (crece con las vueltas). */
function ajustarUplots(us, divs, alto, minimo = ALTO_MIN_PLOT) {
  const n = us.length;
  if (!n) return;
  const porPlot = n > 1 ? Math.floor(alto / n) - EXTRA_MINI : alto;
  us.forEach((u, k) => {
    const leyenda = u.root.offsetHeight - u.height;
    const h = Math.max(minimo, Math.floor(porPlot - leyenda));
    const w = divs[k].clientWidth;
    if (w && (w !== u.width || h !== u.height)) u.setSize({ width: w, height: h });
  });
}

/* Monta en la tarjeta el resultado de `def.uplot`: plots con regla de curvas. */
function montarUplotTarjeta(t, resultado) {
  const { cuerpo, regla } = t;
  if (!resultado || resultado.vacio || !resultado.plots || !resultado.plots.length) {
    mensajeTarjeta(cuerpo, (resultado && resultado.vacio) || 'Sin datos para este gráfico.');
    return {};
  }
  const divs = cajasDePlots(cuerpo, resultado.plots);
  const us = crearUplots(divs, resultado.plots);
  regla.hidden = false;
  const dibujarRegla = () => { if (!regla.hidden && us[0] && regla.clientWidth) dibujarReglaCurvas(regla, us[0]); };
  const redimensionar = () => {
    if (!cuerpo.clientWidth) return;
    ajustarUplots(us, divs, cuerpo.clientHeight);
    // uPlot aplica el tamaño un instante después y la leyenda puede reacomodarse
    // (si no, el gráfico queda aplastado): se vuelve a medir en el cuadro siguiente
    // y recién ahí se alinea la regla.
    requestAnimationFrame(() => {
      if (cuerpo.clientWidth) ajustarUplots(us, divs, cuerpo.clientHeight);
      dibujarRegla();
    });
  };
  redimensionar();
  return {
    redimensionar,
    alCursor: dibujarRegla,
    destruir: () => { for (const u of us) quitarUplot(u); },
    ampliar: (origen) => abrirGraficoAmpliado({ titulo: t.def.nombre + (t.def.unidad ? ` · ${t.def.unidad}` : ''), plots: resultado.plots }, origen),
  };
}
