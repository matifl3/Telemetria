# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(App de escritorio Tauri 2 para Windows; la interfaz es HTML/CSS/JS plano dentro
de WebView2, así que su lenguaje de diseño es web, no nativo.)

## Users

- **Piloto de sim-racing** de Assetto Corsa (AC1) que, después de una sesión,
  revisa sus vueltas para encontrar dónde pierde tiempo.
- **Ingeniero, coach o compañero de equipo/liga** que analiza vueltas de otros
  pilotos y las compara con una referencia.

Trabajo principal: cargar un replay y su pista, elegir una vuelta REF y una B, y
entender en qué tramos y curvas se gana o se pierde tiempo y por qué (velocidad,
pedales, marchas, trazada, tracción).

## Product Purpose

Analizar y comparar replays de Assetto Corsa sin haber grabado telemetría en
vivo. El éxito es que el usuario identifique rápido las curvas o sectores donde
está la diferencia y qué la causa.

## Positioning

- **Lee el replay directamente**: funciona con cualquier `.acreplay` v16 guardado,
  incluidas las vueltas de los otros autos del replay; no hace falta un logger.
- **Análisis por curva**: detecta las curvas automáticamente desde `fast_lane.ai`
  y da métricas, círculos de tracción y delta A/B por curva.
- **Simple y offline**: sin cuentas ni configuración; se abre, se cargan dos
  archivos y se analiza.
- **Sin rastros**: no escribe nada en disco ni envía datos a ningún lado.

## Operating Context

- Monitor de escritorio, en sesiones largas de análisis, a menudo junto al
  simulador. La ventana estrecha (mínimo 360 px) se tiene que poder usar, pero es
  secundaria.
- Flujo: guardar el replay en AC (`Documentos\Assetto Corsa\replay\`) → cargar el
  `.acreplay` y el `fast_lane.ai` de la pista (botones o arrastrar y soltar, en
  cualquier orden) → elegir vueltas → recorrer las pestañas Vuelta, Vueltas,
  Mapa, Conjunto, Comparación y Curvas.
- Se distribuye como instalador NSIS en GitHub Releases.

## Capabilities and Constraints

- Solo `.acreplay` **versión 16**; cualquier otra versión da error por diseño.
- `fast_lane.ai` es obligatorio para entrar al análisis.
- Sin persistencia: los datos viven solo en memoria durante la sesión (ni archivos
  ni `localStorage`).
- Stack mínimo (ver `doc/constitucion.md`): front HTML/JS plano sin framework ni
  paso de build; gráficos en canvas 2D + uPlot vendorizado.
- Todo en español: interfaz, código, documentación.
- Términos: **REF** (vuelta de referencia, A) y **B** (vuelta comparada);
  "distancia de pista (m)" como eje X; tiempos en `m:ss.mmm`.

## Brand Commitments

- Nombre: **AC Telemetry Lab**.
- Voz: español, técnica y directa, con el vocabulario de un ingeniero de pista.

## Evidence on Hand

- Replays y pistas de prueba solo en local (`Paquetes de telemetria/`, fuera de
  git). Calibrado en Monza, Imola, Spa y Mugello.
- No hay testimonios, usuarios públicos ni métricas de adopción: no inventarlos.

## Product Principles

1. **Los datos primero**: cada pantalla sirve para encontrar una diferencia de
   tiempo y su causa; lo decorativo sobra.
2. **REF contra B siempre legible**: la comparación tiene que verse de un vistazo
   en todas las pestañas.
3. **Cero fricción**: dos archivos y adentro; sin cuentas, ajustes ni pasos extra.
4. **Confiable y honesto**: los errores (versión no soportada, pista inválida)
   se explican con claridad y no se muestran datos dudosos.
5. **Pensado para sesiones largas** frente al monitor: legible y sin cansar la
   vista.
