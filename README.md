# AC Telemetry Lab

Visualizador web para **analizar y comparar** la telemetría de **Assetto Corsa
(AC1)** a partir de los replays `.acreplay` (versión 16) guardados por el juego.
Corre **enteramente en el navegador**: no requiere instalar nada ni levantar un
servidor.

> Estado: analizador funcional con las pestañas **Vuelta**, **Mapa**, **Conjunto**,
> **Comparación** y **Curvas** (detección de curvas, tracción por curva, marcadores
> de slip y delta A/B por curva).

---

## 1. Qué hace

- **Parsea `.acreplay` en el navegador** (binario v16) y separa la sesión en
  **vueltas**.
- Dibuja ~30 gráficos sincronizados (uPlot) por vuelta y de **conjunto**, un
  **mapa** de trazadas sobre la pista real, comparación entre vueltas y una
  pestaña de **Curvas** con métricas por curva.
- Usa la **pista** `fast_lane.ai` como referencia geométrica para dibujar la
  trazada y detectar las curvas.

## 2. Uso

1. En Assetto Corsa, correr la sesión y **guardar el replay** (queda en
   `Documents\Assetto Corsa\replay\`).
2. Abrir `visualizador/index.html` en el navegador (Chrome/Edge/Firefox).
3. **Cargar replay (.acreplay)** y elegir qué vueltas analizar.
4. **Cargar pista (fast_lane.ai)** — carpeta `ai\` de la pista (por ejemplo
   `...\content\tracks\monza\lfmv2\ai\fast_lane.ai`). Es obligatoria para entrar
   al análisis.

## 3. Pestañas

| Pestaña | Contenido |
|---|---|
| **Vuelta** | Gráficos por vuelta (velocidad, pedales, marchas, RPM, G, cargas, etc.), sincronizados y con cursor. |
| **Mapa** | Trazada sobre la pista, canales (velocidad, frenada, cambios…), vista 3D rotable, zoom/pan.
| **Conjunto** | Estadísticas de todas las vueltas válidas + mapa por sectores (vista 3D).
| **Comparación** | Diferencias entre dos vueltas (A/B).
| **Curvas** | Detección de curvas desde `fast_lane.ai`, tracción (g-g) por curva con marcadores de slip, y **delta A/B por curva**.

## 3. Stack

- **JavaScript + HTML/CSS**, sin build. `visualizador/app.js` + `index.html` +
  `estilos.css`.
- Gráficos con **[uPlot](https://github.com/leeoniya/uPlot)** cargado por CDN.
- Sin frameworks ni gestor de paquetes: es abrir el `index.html`.

## 4. Estructura

```
Telemetria/
├─ visualizador/            # la aplicación (abrir index.html)
│  ├─ index.html
│  ├─ app.js
│  └─ estilos.css
├─ doc/
│  ├─ FormatoTelemetria.md  # offsets y señales del .acreplay v16
│  ├─ PLAN_CURVAS.md        # diseño/implementación de la pestaña Curvas
│  └─ Catalogo_Graficos.md  # catálogo de gráficos del visualizador
└─ Paquetes de telemetria/  # archivos de muestra (.acreplay / fast_lane.ai)
```

## 5. Documentación

- [`doc/FormatoTelemetria.md`](doc/FormatoTelemetria.md) — formato de los archivos de entrada.
- [`doc/PLAN_CURVAS.md`](doc/PLAN_CURVAS.md) — pestaña Curvas y delta A/B.
- [`doc/Catalogo_Graficos.md`](doc/Catalogo_Graficos.md) — catálogo de gráficos.
