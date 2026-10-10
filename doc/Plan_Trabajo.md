# Plan de trabajo

Roadmap por fases de **Telemetría AC**.

> Estado actual: **Fase 1 (core + CLI) implementada** y validada con un `.acreplay`
> real (Monza, 16 autos, 5 vueltas). **Fase 3 (web Flask) implementada**. La
> **Fase 2 (`.nkt`)** sigue pendiente.

---

## Fase 0 — Documentación (en curso)

Entregables:
- [x] `README.md`
- [x] `doc/Requisitos.txt`
- [x] `doc/Arquitectura.md`
- [x] `doc/FormatoTelemetria.md`
- [x] `doc/Manual_Usuario.md`
- [x] `doc/Plan_Trabajo.md` (este documento)

Definición de terminado: documentación revisada por el equipo y preguntas
abiertas de `Requisitos.txt` resueltas.

---

## Fase 1 — Core Python: CLI de parseo y export (PRIMER PASO)

Objetivo: convertir un `.acreplay` v16 en **un CSV por vuelta**, sin web.
Es la base que luego reutiliza la web.

Tareas:
1. Estructura del paquete `core/src/telemetria/` y `core/requirements.txt`.
2. `lector/modelos.py`: dataclasses (`Sesion`, `Auto`, `Frame`, `Rueda`, `Vuelta`).
3. `lector/acreplay.py`: parser v16 (basado en el formato documentado).
4. `procesamiento/segmentador.py`: dividir frames en vueltas.
5. `procesamiento/exportador.py`: escribir CSV por vuelta.
6. `cli.py`: argumentos `archivo`, `--out` y `--json` (resumen por consola y
   salida JSON opcional para *scripts*).
7. Tests con un archivo de muestra en `Paquetes de telemetria/`.

Definición de terminado:
- Con un `.acreplay` válido, genera un CSV por vuelta con datos correctos.
- Los tiempos de vuelta coinciden con los del juego.
- Un archivo inválido produce un error claro y código de salida ≠ 0.
- La salida `--json` respeta el contrato de `Arquitectura.md` (§4).
- Tests en verde.

Riesgos: archivos de muestra insuficientes; versión de replay distinta a 16.

---

## Fase 2 — Soporte `.nkt` y robustez

Objetivo: aceptar más entradas y endurecer el motor.

Tareas:
1. Importador del CSV exportado por **AiM Race Studio** (vía de menor riesgo).
2. Investigar parseo directo del `.nkt` (riesgo alto, opcional).
3. `lector/detector.py`: detección automática de formato.
4. Manejo de outlap/inlap y vueltas incompletas.
5. Suite de tests más amplia.

Definición de terminado: la app procesa `.acreplay` y al menos una variante de
`.nkt`/CSV de entrada.

---

## Fase 3 — Aplicación web (Flask)

Objetivo: interfaz web para subir, listar vueltas y descargar CSV, apoyada en el
core Python de la fase 1 (**importado como librería**, sin reimplementar nada).

Tareas:
1. `web/app.py`: fábrica `create_app()` y arranque del servidor.
2. `web/rutas.py`: endpoints `/subir`, `/sesion`, descarga de CSV, ZIP y borrado
   (ver `Arquitectura.md` §5).
3. `web/sesion.py`: carpeta de trabajo por sesión, límites de tamaño y limpieza.
4. Plantillas Jinja2: principal, listado de vueltas, errores.
5. Uso directo del core (`import telemetria`): leer → segmentar → exportar.

Definición de terminado: el flujo subir → elegir vuelta → descargar CSV funciona
desde el navegador, usando el core Python por debajo.

---

## Fase 4 — Extras (opcional)

- Gráficos por vuelta (velocidad, gas/freno) en la web.
- Comparación entre vueltas.
- Historial persistente (SQLite).
- Export a Parquet/JSON resumen.

---

## Orden recomendado e hitos

```
Fase 0  doc            ->  Hito A: documentacion aprobada          [hecho]
Fase 1  script CLI     ->  Hito B: .acreplay -> CSV por vuelta     [hecho]
Fase 2  .nkt + robustez->  Hito C: multiples entradas              [pendiente]
Fase 3  web (Flask)    ->  Hito D: app web funcional               [hecho]
Fase 4  extras         ->  Hito E: mejoras                         [opcional]
```

## Requisitos de entorno

- **Python 3.10+** (todo el proyecto: core, CLI y web).
- **Flask** (web) y **pytest** (tests).
- **Assetto Corsa** instalado (para generar archivos de prueba).

## Próximo paso inmediato

La v1 (core + web) funciona de punta a punta sobre `.acreplay`. Pendientes:

1. **Fase 2:** soporte de `.nkt` (o import del CSV de AiM Race Studio).
2. ✔ Afinar la validacion de vueltas (outlap/inlap) con datos reales.
   Heuristica implementada en el core y el visualizador y validada con los
   7 replays de `Paquetes de telemetria/temp/`: no cuentan salida/largada,
   entrada ni cortadas/incompletas (motivo en resumen CSV, JSON y web).
3. ✔ UX del selector: el modal abre sin vueltas preseleccionadas (las no
   válidas llevan su motivo), exige elegir al menos una y el panel lateral
   permite mostrar/ocultar cada vuelta con su ojo (fila tachada = oculta).
4. ✔ Trazadas: la banda de pista se centra en la posición media de las vueltas
   visibles (no en la REF), así cada trazada queda donde se condujo realmente.
5. Fase 4 (opcional): graficos por vuelta y comparacion.
