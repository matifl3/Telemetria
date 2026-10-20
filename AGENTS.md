# AGENTS.md

## Qué es esto

AC Telemetry Lab: visualizador solo-navegador para replays de Assetto Corsa
**sin tests, sin lint, sin CI**. Toda la app es `visualizador/app.js`
(~2600 líneas) + `index.html` + `estilos.css`.

## Stack y estructura
- Hoy: JS vanilla (sin build ni dependencias). El visualizador completo vive
  en `visualizador/`.
- Migrar a Tauri (frontend) + Rust (parseo y backend) es un próximo paso
  planeado, **todavía no implementado**. No dar Tauri/Rust por hechos.
- Hoy debe funcionar abriendo `index.html` con doble clic (`file://`). (Con
  Tauri sería un binario, no un `index.html` suelto — eso solo tras la
  migración.)

## Convenciones
- Textos de la interfaz en español.
- Código simple, nombres descriptivos y comentarios solo donde aporten.
- Diseño limpio y responsive; cualquier pantalla nueva debe verse bien en el móvil. 

## Forma de trabajar
- Haz solo lo que se pide: no añadas funcionalidades por tu cuenta.
- Cambios pequeños y enfocados; no reescribas lo que ya funciona.
- Al terminar, resume qué has cambiado y cualquier decisión que deba revisar. 

## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones
tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su
porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Ejecutar / verificar

- Abrir `visualizador/index.html` directamente en el navegador (`file://` —
  no hace falta servidor).
- Se requiere internet: uPlot se carga desde el CDN de jsdelivr (fijado en
  `index.html`).
- Único chequeo automatizado: `node --check visualizador/app.js` (solo
  sintaxis).
- Test manual: cargar un replay de ejemplo + `fast_lane.ai` desde
  `Paquetes de telemetria/` (solo local, gitignored).

## Mapa de `app.js`

- El objeto global `state` guarda todo; `renderTabActiva()` despacha la
  pestaña activa.
- Funciones clave (buscar por nombre, no por línea): `parsearReplay`
  (parser binario v16), `cargarArchivos`, `parsearAi` / `cargarPistaAi`
  (archivo de pista), `detectarCurvas` / `metricasCurva` / `deltaCurvas`
  (pestaña Curvas), `init` (conexiones).
- Las constantes de calibración están arriba del archivo (`SLIP_SPIN`,
  `SLIP_LOCK`, `R_CURVA`, `R_RECTA`, `GRID_*`). Ajustar umbrales ahí; no
  tocar la lógica.

## Reglas duras

- Solo se parsea `.acreplay` **versión 16**; cualquier otra versión lanza
  error por diseño.
- El archivo de pista (`fast_lane.ai`) es **obligatorio** para entrar al
  análisis (`puedeEntrar()` / `FALTA_PISTA`): sin banda de pista, no hay
  detección de curvas, no hay mapas.
- Después de editar `app.js` o `estilos.css`, subir la query anti-caché en
  `index.html` (`app.js?v=15`, `estilos.css?v=7`). Nada más lo hace.
- Nunca commitear: `*.acreplay`, `Paquetes de telemetria/`, `datos/`,
  `salida/` (ver `.gitignore`).
- Sin persistencia: los datos viven **solo en memoria, por sesión** Al refrescar se pierde todo y hay que recargar los archivos.
- Estilo de commits (de la historia): prefijo de tipo + resumen en español,
  p. ej. `visualizador: delta A/B por curva`, `fix: ...`, `chore: ...`.

  ## Límites
- ✅ Siempre: respetar las reglas de fechas y racha, mantener los textos en español.
- ✅ Siempre: actualizar `MEMORY.md` al terminar cada tarea.
- ⚠️ Pregunta antes: crear archivos nuevos, cambiar el formato de los datos guardados.
- 🚫 Nunca: añadir dependencias, frameworks o un paso de build (salvo que la migración a Tauri/Rust ya esté aprobada e implementada).

## Convenciones

- Todos los strings de UI, comentarios y docs están **en español** —
  escribir los nuevos en español.
- Los gráficos son canvas 2D + uPlot; seguir los patrones existentes
  `lineChart` / `prepCanvas` al agregar uno, y registrarlo en
  `doc/Catalogo_Graficos.md`.

## Docs como fuente de verdad

- `doc/FormatoTelemetria.md` — offsets/layout de bytes del `.acreplay` v16.
  Confiar en él sobre los comentarios del código al cambiar el parser.
- `doc/PLAN_CURVAS.md` — algoritmo de detección de curvas y calibración de
  constantes. Su sección "Verificación" nombra scripts smoke
  (`ai_smoke.js`, `smoke_visualizador.js`, `replay_e2e.js`,
  `delta_curvas_smoke.js`) que ya no existen — no buscarlos.
- Historia: `core/` (pipeline Python de CSV) y `web/` se borraron en el
  commit `5f560a9`; las docs se limpiaron entonces, pero no reintroducir
  referencias a ellos.
