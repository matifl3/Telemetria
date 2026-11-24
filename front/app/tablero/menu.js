'use strict';

/* Menú «Agregar gráfico»: diálogo lateral con buscador y gráficos agrupados por
   categoría. Queda abierto para agregar varios; Esc o ✕ lo cierran. */

const menuGraficos = (() => {
  let abierto = false;
  let origen = null;       // botón que lo abrió (foco al cerrar)
  let ultimaAgregada = null;
  let alAgregar = null;    // callback del tablero: (def) → tarjeta

  const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function abrir(desde) {
    if (abierto) return;
    abierto = true;
    origen = desde || document.activeElement;
    ultimaAgregada = null;
    const ov = $('menu-graficos');
    ov.classList.remove('oculto');
    ov.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sin-scroll');
    const buscar = $('menu-buscar');
    buscar.value = '';
    renderLista('');
    buscar.focus();
  }

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    const ov = $('menu-graficos');
    ov.classList.add('oculto');
    ov.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sin-scroll');
    // Foco en la última tarjeta agregada; si no hubo, vuelve al botón.
    const destino = ultimaAgregada && ultimaAgregada.isConnected ? ultimaAgregada : origen;
    if (destino && destino.isConnected) destino.focus({ preventScroll: !ultimaAgregada });
    if (ultimaAgregada && ultimaAgregada.isConnected) ultimaAgregada.scrollIntoView({ block: 'nearest' });
    origen = null;
  }

  function renderLista(filtro) {
    const lista = $('menu-lista');
    lista.innerHTML = '';
    const f = normalizar(filtro.trim());
    let total = 0;
    for (const cat of CATEGORIAS_GRAFICOS) {
      const defs = CATALOGO_GRAFICOS.filter((g) => g.categoria === cat.id &&
        (!f || normalizar(`${g.nombre} ${g.descripcion || ''} ${cat.nombre}`).includes(f)));
      if (!defs.length) continue;
      total += defs.length;
      const seccion = document.createElement('section');
      seccion.className = 'menu-categoria';
      const h = document.createElement('h3');
      h.textContent = cat.nombre;
      seccion.appendChild(h);
      if (cat.ayuda) {
        const p = document.createElement('p');
        p.className = 'menu-ayuda';
        p.textContent = cat.ayuda;
        seccion.appendChild(p);
      }
      const ul = document.createElement('ul');
      for (const def of defs) {
        const li = document.createElement('li');
        li.className = 'menu-item';
        const texto = document.createElement('div');
        texto.className = 'menu-item-texto';
        const nombre = document.createElement('span');
        nombre.className = 'menu-item-nombre';
        nombre.textContent = def.nombre;
        texto.appendChild(nombre);
        if (def.descripcion) {
          const d = document.createElement('span');
          d.className = 'menu-item-desc';
          d.textContent = def.descripcion;
          texto.appendChild(d);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn fantasma menu-agregar';
        b.textContent = 'Agregar';
        b.setAttribute('aria-label', `Agregar ${def.nombre}`);
        b.addEventListener('click', () => {
          const t = alAgregar && alAgregar(def);
          if (t) ultimaAgregada = t.contenido;
        });
        li.append(texto, b);
        ul.appendChild(li);
      }
      seccion.appendChild(ul);
      lista.appendChild(seccion);
    }
    if (!total) {
      const p = document.createElement('p');
      p.className = 'menu-vacio';
      p.textContent = 'Ningún gráfico coincide con la búsqueda.';
      lista.appendChild(p);
    }
  }

  function iniciar(callbackAgregar) {
    alAgregar = callbackAgregar;
    const ov = $('menu-graficos');
    $('menu-cerrar').addEventListener('click', cerrar);
    $('menu-buscar').addEventListener('input', (ev) => renderLista(ev.target.value));
    // Clic en el fondo oscuro (fuera del panel) cierra.
    ov.addEventListener('click', (ev) => { if (ev.target === ov) cerrar(); });
    document.addEventListener('keydown', (ev) => {
      if (!abierto) return;
      if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); return; }
      if (ev.key !== 'Tab') return;
      const enfocables = [...ov.querySelectorAll('input, button:not(:disabled)')];
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement;
      if (!ov.contains(actual)) { ev.preventDefault(); primero.focus(); }
      else if (ev.shiftKey && actual === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && actual === ultimo) { ev.preventDefault(); primero.focus(); }
    });
  }

  return { iniciar, abrir, cerrar, estaAbierto: () => abierto };
})();
