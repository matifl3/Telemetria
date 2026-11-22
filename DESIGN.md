---
name: AC Telemetry Lab
description: Análisis y comparación de replays de Assetto Corsa, con la sobriedad de un muro de boxes.
colors:
  fondo: "#0b0e13"
  fondo-2: "#10141b"
  panel: "#151a23"
  panel-2: "#1b212c"
  borde: "#232b38"
  borde-control: "#606c80"
  texto: "#e6ebf2"
  apagado: "#8b97a8"
  blanco: "#ffffff"
  cian-telemetria: "#22d3ee"
  cian-telemetria-claro: "#23c7e0"
  cian-telemetria-profundo: "#14a6bd"
  texto-sobre-acento: "#04222a"
  verde-gas: "#4ade80"
  rojo-freno: "#f87171"
  rosa-rival: "#f472b6"
  texto-sobre-rival: "#2a0716"
  error-texto: "#fecaca"
  amarillo-senal: "#facc15"
typography:
  titulo-carga:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  titulo-app:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "0.4px"
  lectura:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  titulo-modal:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  enfasis:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  titulo-curva:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  titulo-tarjeta:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  cuerpo:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  ayuda:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  etiqueta:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "1.2px"
  etiqueta-tabla:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.6px"
  micro:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "9px"
    fontWeight: 800
    letterSpacing: "0.5px"
  dato-mono:
    fontFamily: "Cascadia Code, Consolas, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  punto: "3px"
  muestra: "4px"
  insignia: "5px"
  chico: "6px"
  rol: "7px"
  control: "8px"
  aviso: "9px"
  item: "10px"
  barra: "12px"
  tarjeta: "14px"
  pildora: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  xxl: "22px"
components:
  boton:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.texto}"
    typography: "{typography.titulo-tarjeta}"
    rounded: "{rounded.item}"
    padding: "9px 16px"
  boton-primario:
    backgroundColor: "{colors.cian-telemetria}"
    textColor: "{colors.texto-sobre-acento}"
    rounded: "{rounded.item}"
    padding: "9px 16px"
  boton-fantasma:
    textColor: "{colors.texto}"
    rounded: "{rounded.item}"
    padding: "9px 16px"
  pestana:
    textColor: "{colors.apagado}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  pestana-activa:
    backgroundColor: "{colors.cian-telemetria}"
    textColor: "{colors.texto-sobre-acento}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  tarjeta:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.tarjeta}"
    padding: "16px"
  item-vuelta:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.texto}"
    rounded: "{rounded.item}"
    padding: "9px 10px"
  insignia-ref:
    backgroundColor: "{colors.cian-telemetria}"
    textColor: "{colors.texto-sobre-acento}"
    rounded: "{rounded.insignia}"
    padding: "2px 5px"
  insignia-b:
    backgroundColor: "{colors.rosa-rival}"
    textColor: "{colors.texto-sobre-rival}"
    rounded: "{rounded.insignia}"
    padding: "2px 5px"
  selector:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.texto}"
    rounded: "{rounded.control}"
    padding: "5px 8px"
  boton-rol:
    backgroundColor: "{colors.fondo-2}"
    textColor: "{colors.apagado}"
    typography: "{typography.micro}"
    rounded: "{rounded.rol}"
    padding: "4px 7px"
    height: "24px"
  chip-dato:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.apagado}"
    rounded: "{rounded.pildora}"
    padding: "2px 9px"
---

# Design System: AC Telemetry Lab

## Overview

**Creative North Star: "El muro de boxes"**

AC Telemetry Lab se mira como las pantallas del ingeniero en el pit wall: superficies
oscuras, datos densos y color usado solo para señalar. Todo el sistema existe para que
el piloto o el coach encuentren rápido dónde la vuelta B pierde tiempo frente a la REF.
La interfaz se queda en segundo plano y los trazos de los gráficos son lo más brillante
de la pantalla.

La densidad es alta pero ordenada: barra lateral fija de 300 px con la lista de vueltas,
el reproductor y las lecturas, y a la derecha una columna de tarjetas con gráficos. La
atmósfera tiene una firma propia y contenida: dos resplandores radiales casi
imperceptibles en el fondo (cian arriba a la derecha, rojo abajo a la izquierda) y un
brillo cian en el logo y en el control de reproducción. Son la luz del muro, no
decoración.

Los controles son precisos y discretos: no compiten con los datos y el acento solo
aparece en lo que está activo.

**Key Characteristics:**
- Tema oscuro único, pensado para sesiones largas frente al monitor.
- Un solo acento de interfaz (Cian Telemetría); el resto del color tiene significado de dato.
- Profundidad por capas tonales con sombra ambiental suave.
- Números en monoespaciada con cifras tabulares.
- Español en toda la interfaz; etiquetas cortas en mayúsculas para títulos de panel.

## Colors

Una base gris azulada casi negra con un cian frío como única voz de interfaz y un juego
de colores de pista (gas, freno, rival) que siempre significan algo.

### Primary
- **Cian Telemetría** (`cian-telemetria`): el único acento de interfaz. Pestaña activa,
  botón primario, vuelta REF (borde e insignia), foco visible, progreso del scrub y
  valores destacados como la vuelta teórica. En superficies grandes se usa como
  degradado vertical hacia **Cian Telemetría Profundo** (`cian-telemetria-profundo`),
  con texto en **Tinta de Box** (`texto-sobre-acento`). El degradado de botones y pestañas
  arranca en **Cian Telemetría Claro** (`cian-telemetria-claro`).

### Secondary
- **Rosa Rival** (`rosa-rival`): la vuelta B. Borde del ítem B, insignia B (con texto
  `texto-sobre-rival`) y trazo B en los gráficos. Es el par fijo de la REF.

### Tertiary
- **Verde Gas** (`verde-gas`): acelerador, archivo cargado y delta a favor (`delta-gana`).
- **Rojo Freno** (`rojo-freno`): freno, delta en contra (`delta-pierde`) y avisos de error,
  siempre como fondo translúcido (8–12 %) con borde al 28–40 % y texto **Rosa Error**
  (`error-texto`).
- **Amarillo Señal** (`amarillo-senal`): marcas puntuales en mapas y curvas; también es parte
  de la paleta de vueltas.

### Neutral
- **Asfalto Nocturno** (`fondo`): fondo de la aplicación, debajo de los resplandores.
- **Asfalto 2** (`fondo-2`): fondo de subpaneles hundidos (mini-gráficos, trazadas,
  cabeceras de sección) y del hover de los iconos.
- **Panel** (`panel`): tarjetas, barra de pestañas, popovers.
- **Panel 2** (`panel-2`): botones, ítems de lista, lecturas, bloques de curva.
- **Línea de Box** (`borde`): bordes de 1 px de superficies y separadores de tabla.
- **Borde de Control** (`borde-control`): borde de selectores y campos; llega a 3:1 sobre
  Panel y Panel 2 para que el campo se distinga (WCAG 1.4.11).
- **Blanco** (`blanco`): texto de botón en hover y pulgar del scrub.
- **Texto** (`texto`): texto principal.
- **Apagado** (`apagado`): etiquetas, unidades, ayudas, ejes y texto inactivo.

### Paleta de vueltas
Las vueltas se colorean en orden con `PALETA` (`front/app/estado.js`): `#38bdf8`,
`#f472b6`, `#4ade80`, `#facc15`, `#a78bfa`, `#fb923c`, `#22d3ee`, `#f87171`, `#c084fc`,
`#fde047`. El color de cada vuelta se mantiene en todos los gráficos, mapas y listas
(`colorPorId`).

### Named Rules
**La regla de la voz única.** Cian Telemetría es el único color de interfaz. Si un
elemento no es activo, REF ni foco, no lleva cian.

**La regla del color con significado.** Verde, rojo y rosa nunca son decoración: verde
es gas o ganancia, rojo es freno, pérdida o error, rosa es la vuelta B.

## Typography

**Display Font:** Segoe UI (con system-ui, -apple-system, sans-serif)
**Body Font:** Segoe UI (con system-ui, -apple-system, sans-serif)
**Label/Mono Font:** Cascadia Code (con Consolas, ui-monospace, monospace)

**Character:** La sans del sistema de Windows para que la app se sienta nativa y sin
peso, y una monoespaciada de terminal para tiempos, distancias y valores, donde la
alineación de cifras importa.

### Hierarchy
- **Display** (600, 20px): título de la zona de carga, la única pantalla sin datos.
- **Título de modal** (600, 16px): encabezado del overlay de zoom.
- **Headline** (600, 18px, 0.4px de tracking): nombre de la app en la barra superior. Las
  lecturas del panel lateral usan el mismo tamaño en 700.
- **Énfasis** (700, 15px): valor destacado de la vuelta teórica.
- **Title** (700, 13px; 14px en el nombre de curva): títulos de tarjeta de gráfico (son
  `<h2>`), pestañas.
- **Body** (400–600, 13px): texto general, ítems de lista, botones.
- **Ayuda** (400, 12px, interlineado 1.5–1.6): ayudas, leyendas, unidades, tablas y
  controles de mapa. Es el piso del texto de lectura.
- **Label** (700, 11px, 1.2px de tracking, MAYÚSCULAS): títulos de sección del panel. Las
  cabeceras de tabla y las etiquetas de lectura usan la misma forma a 10px.
- **Micro** (800, 9–10px): insignias REF/B, botones de rol y etiquetas de estadística de
  curva.

### Named Rules
**La regla de la cifra tabular.** Todo tiempo (`m:ss.mmm`), distancia o valor numérico
comparable va en `dato-mono` con `font-variant-numeric: tabular-nums`, para que las
columnas no bailen.

## Layout

- **Escritorio (> 980 px):** grilla de dos columnas: lateral fijo de 300 px (sticky,
  `top: 84px`) y contenido flexible (`minmax(0, 1fr)`), con 18 px de separación y
  relleno de `18px 22px 40px`. Barra superior sticky con desenfoque.
- **Contenido:** columna de tarjetas con 18 px de separación. Las rejillas de curvas y
  tracción usan `auto-fit` con mínimos de 340 px y 230 px. `fila-doble` pone dos mapas
  lado a lado.
- **≤ 980 px:** el lateral pasa arriba, a una sola columna. **≤ 900 px:** `fila-doble`
  pasa a una columna. **≤ 640 px:** la barra superior se apila, los botones de carga se
  reparten el ancho y los mapas bajan de alto (`#mapa` 320 px, trazadas 220 px). Todo
  tiene que funcionar a 360 px.
- **Ritmo:** pasos de 6 / 8 / 10 / 14 / 18 / 22 px. Dentro de los componentes se usan
  6–10 px y entre bloques 14–18 px.
- **Canvas:** cada canvas propio fija su alto por CSS (200 / 240 / 260 / 300 / 460 px);
  si no, el alto depende del ancho.

## Elevation & Depth

Es un sistema híbrido. La estructura la dan las capas tonales (`fondo` → `panel` →
`panel-2`, con `fondo-2` para lo hundido) y un borde de 1 px en **Línea de Box**. Encima,
una sombra ambiental grande y oscura asienta las tarjetas sobre el fondo. Refuerza la
separación, pero nunca es lo único que la marca. Los elementos flotantes (tooltip,
popover de avisos, overlay de zoom) suben un nivel con una sombra más cerrada o un velo
oscuro con desenfoque.

### Shadow Vocabulary
- **Ambiental** (`box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35)`, `--sombra`): tarjetas,
  paneles, barra de pestañas, popovers.
- **Tooltip** (`box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45)`): tooltip de gráficos.
- **Anillo REF** (`box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.3)`): refuerza el borde de
  la vuelta REF.
- **Luz de muro** (`drop-shadow(0 0 10px rgba(34, 211, 238, 0.6))` en el logo;
  `0 0 8px rgba(34, 211, 238, 0.5)` en el pulgar del scrub, 14 px en hover): el brillo
  cian que forma parte de la identidad.
- **Velo de overlay** (`rgba(5, 7, 10, 0.82)` + `backdrop-filter: blur(4px)`): fondo del
  zoom de trazada.

### Named Rules
**La regla de la capa antes que la sombra.** Una superficie nueva se distingue primero
por su escalón tonal y su borde. La sombra solo acompaña.

**La regla de la luz de muro.** Los resplandores del fondo (cian al 8 %, rojo al 6 %) y
el brillo cian son la firma del sistema. Se mantienen a baja opacidad y solo en el
fondo, el logo y el control de reproducción. No se extienden a tarjetas ni a texto.

## Shapes

Esquinas suavemente redondeadas que se cierran a medida que el elemento es más chico:
14 px en tarjetas y la zona de carga, 12 px en la barra de pestañas y los popovers,
10 px en botones, ítems y lecturas, 8 px en pestañas, selectores y estadísticas, 5–7 px
en insignias y botones de rol, y 3–4 px en los cuadraditos de color de vuelta. Las
píldoras completas (999 px) quedan para chips de dato, el estado de archivo y el
contador de avisos. Los bordes son siempre de 1 px, salvo la zona de carga (2 px
discontinuo). Los puntos de vuelta en curvas son círculos.

Los radios intermedios tienen nombre: `punto` 3 px (puntos de trazada), `muestra` 4 px
(color de vuelta), `chico` 6 px (iconos y `code`), `rol` 7 px (botones REF/B) y `aviso`
9 px (avisos guardados).

## Components

### Buttons
- **Shape:** esquinas suavemente redondeadas (10 px), borde de 1 px en Línea de Box.
- **Base:** fondo Panel 2, texto 13 px en 600, relleno `9px 16px`.
- **Primario:** degradado Cian Telemetría → Cian Profundo, sin borde y con texto Tinta de
  Box. Uno por contexto como máximo.
- **Fantasma:** fondo transparente, para acciones secundarias.
- **Icono:** relleno `8px 14px`, SVG centrado.
- **Hover / Focus:** el borde pasa a cian y el texto a blanco. Con puntero fino sube
  1 px. Al presionar escala a 0.97. El foco es un contorno cian de 2 px separado 2 px.
  Deshabilitado: opacidad 0.4. Cargando: un spinner de 12 px en `currentColor`.

### Chips
- **Chip de dato:** píldora en Panel con borde y texto Apagado a 10 px (datos de curva).
- **Estado de archivo:** píldora en Panel 2. Cuando el archivo está cargado, el borde y
  el texto pasan a Verde Gas.
- **Insignias REF / B:** bloque macizo de 9 px en 800, cian o rosa, radio 5 px.

### Cards / Containers
- **Corner Style:** 14 px.
- **Background:** Panel. Los bloques internos (curvas, tracción, lecturas) usan Panel 2 y
  los subpaneles hundidos Asfalto 2.
- **Shadow Strategy:** Ambiental (ver Elevation & Depth).
- **Border:** 1 px en Línea de Box.
- **Internal Padding:** 16 px en paneles, `14px 16px 10px` en tarjetas de gráfico y
  10–14 px en bloques internos.

### Inputs / Fields
- **Selectores:** fondo Panel 2, borde Borde de Control, radio 8 px, `5px 8px`, 12 px.
  Deshabilitado: opacidad 0.45.
- **Rangos:** `accent-color` en cian. El scrub es propio: pista de 6 px con el progreso
  en cian y pulgar blanco con borde cian y luz de muro.
- **Focus:** contorno cian global de 2 px (`:focus-visible`).

### Navigation
- **Pestañas:** barra en Panel con radio 12 px y relleno de 6 px. Cada pestaña es texto
  Apagado en 13 px/700 y pasa a Texto en hover. La activa toma el degradado cian con
  Tinta de Box. Se navega con flechas, Inicio y Fin. En pantallas estrechas las
  pestañas pasan a varias líneas.
- **Barra superior:** sticky, `rgba(16, 20, 27, 0.85)` con desenfoque de 10 px y borde
  inferior. Lleva la marca a la izquierda y las acciones de carga y avisos a la derecha.

### Objetivos táctiles
Todo control mide al menos 24 × 24 px (WCAG 2.5.8): chevrons de colapsar, ojo de
visibilidad y botones de rol. Con puntero grueso (`@media (pointer: coarse)`) suben a
32 px. Las superficies que se arrastran (mapas, zoom) usan pointer events con
`touch-action: none`. Las tarjetas clicables (tracción por curva) llevan `role="button"`,
`tabindex="0"` y responden a Enter y Espacio.

### Ítem de vuelta (componente firma)
La fila que define el sistema: un cuadrado con el color de la vuelta, el nombre
(truncado), el tiempo en monoespaciada tabular alineado a la derecha, los botones de rol
REF/B y un ojo de visibilidad. En reposo no tiene borde. La REF lleva borde cian con
anillo y la B borde rosa al 65 %. Una vuelta oculta se ve tachada, con el tiempo al 60 %
y el color al 40 %.

### Tabla delta
Tablas compactas de 12 px con cabeceras de 10 px en mayúsculas Apagado, separadores
Línea de Box y hover en Panel 2. El delta usa Verde Gas cuando B gana y Rojo Freno
cuando pierde.

## Do's and Don'ts

### Do:
- **Do** usar las variables de `:root` (`--panel`, `--borde`, `--acento`, …) para todo
  color nuevo; nada de hex sueltos en CSS. En canvas y uPlot, usar `COLOR.*`
  (`front/app/utils.js`), que lee esas mismas variables.
- **Do** reservar Cian Telemetría para lo activo, la REF y el foco, y Rosa Rival para la
  vuelta B.
- **Do** escribir tiempos y valores en `--fuente-mono` con cifras tabulares.
- **Do** separar superficies por escalón tonal + borde de 1 px, y sumar `--sombra` solo
  como refuerzo.
- **Do** dar alto fijo por CSS a todo canvas nuevo y registrar el gráfico en
  `doc/Catalogo_Graficos.md`.
- **Do** respetar `prefers-reduced-motion` y dejar las elevaciones de hover detrás de
  `(hover: hover) and (pointer: fine)`.
- **Do** usar las curvas `--ease-out` / `--ease-in-out` con transiciones de 150–200 ms.
- **Do** llevar el foco a "Cerrar" al abrir un overlay, mantener Tab dentro, cerrar con
  Escape y devolver el foco a quien lo abrió.

### Don't:
- **Don't** añadir un segundo acento de interfaz ni usar verde, rojo o rosa como
  decoración.
- **Don't** llevar los resplandores ni el brillo cian a tarjetas, texto o componentes
  nuevos; viven en el fondo, el logo y el scrub.
- **Don't** introducir un tema claro, una fuente web externa ni un framework de UI (el
  front es HTML/CSS/JS plano y offline).
- **Don't** depender solo de la sombra para separar una superficie del fondo.
- **Don't** bajar texto de lectura (ayudas, tablas, cuerpo) de 12 px. Los tamaños de
  9–11 px quedan para etiquetas en mayúsculas e insignias.
