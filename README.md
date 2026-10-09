# Telemetría AC

Aplicación web para **extraer, segmentar por vuelta y exportar** la telemetría de
**Assetto Corsa** (AC1) a partir de archivos guardados por el juego.

> Estado: **Fase 1 (core + CLI) y Fase 3 (web Flask) implementadas** y validadas
> con un replay real. Falta el soporte `.nkt` (Fase 2). Ver `doc/Plan_Trabajo.md`.

---

## 1. Objetivo

Permitir que un usuario cargue un archivo de telemetría de Assetto Corsa y obtenga,
sin herramientas externas, un **CSV por vuelta** con las señales de conducción
(velocidad, RPM, marcha, acelerador, freno, dirección, deslizamiento/carga por
rueda, tiempos de vuelta, etc.) para analizarlas o graficarlas luego.

## 2. Alcance

| Aspecto | Definición |
|---|---|
| Juego soportado | Assetto Corsa (AC1) |
| Fuentes de datos | Replays `.acreplay` (versión 16) y export `.nkt` de AiM Race Studio |
| Modalidad | Archivos guardados (post-sesión). **No** captura en vivo |
| Salida | Un archivo **CSV por vuelta** |
| Interfaz final | Aplicación web (**Python + Flask**) |
| Core de datos | **Python** (parser + segmentación + exportación) — Fase 1 |
| Integración | La web **importa el core como librería** (sin duplicar lógica) |

**Fuera de alcance (por ahora):** captura en vivo (UDP 9996 / shared memory),
ACC/ACE, comparación gráfica entre vueltas, cuentas de usuario, nube.

## 3. Stack

Un solo lenguaje: **Python 3.10+**.

- **Core (`core/`):** parseo binario con `struct`/`zlib`, segmentación por vuelta
  y exportación a CSV. Se expone como **CLI** (primer entregable) y como
  **librería**.
- **Web (`web/`):** aplicación **Flask** que sube archivos, usa el core como
  librería (sin duplicar lógica), lista las vueltas y sirve los CSV. Plantillas
  con **Jinja2**.
- **Sin `subprocess` ni segundo runtime:** al ser todo Python, la web importa el
  core directamente.

## 4. Estructura del repositorio (propuesta)

```
Telemetria/
├── README.md                     # este archivo
├── doc/                          # documentación del proyecto
│   ├── Requisitos.txt            # requisitos funcionales y no funcionales
│   ├── Arquitectura.md           # diseño de capas e integración
│   ├── FormatoTelemetria.md      # referencia de .acreplay v16 y .nkt
│   ├── Manual_Usuario.md         # guía de uso
│   └── Plan_Trabajo.md           # fases y roadmap
├── Paquetes de telemetria/       # archivos de muestra (.acreplay / .nkt)
├── core/                         # CAPA PYTHON (parser + CLI)
│   ├── src/telemetria/
│   │   ├── lector/               # parsers de archivos de entrada
│   │   ├── procesamiento/        # segmentación por vuelta y exportación
│   │   └── cli.py                # interfaz de línea de comandos (+ JSON)
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
└── web/                          # CAPA WEB (Flask)
    ├── app.py                    # app Flask + rutas
    ├── plantillas/               # HTML (Jinja2)
    ├── estatico/                 # CSS/JS
    └── requirements.txt
```

## 5. Uso previsto (resumen)

1. En Assetto Corsa, correr la sesión y **guardar el replay** (queda en
   `Documents\Assetto Corsa\replay\`).
2. Abrir la aplicación web (Flask), **subir** el archivo `.acreplay` (o `.nkt`).
3. La web usa el core Python, que genera los CSV; la app lista las **vueltas
   detectadas** con su tiempo.
4. Descargar el **CSV de la vuelta** elegida.

Detalle paso a paso en `doc/Manual_Usuario.md`.

## 6. Documentación

- [`doc/Requisitos.txt`](doc/Requisitos.txt) — qué debe hacer la app.
- [`doc/Arquitectura.md`](doc/Arquitectura.md) — cómo está construida.
- [`doc/FormatoTelemetria.md`](doc/FormatoTelemetria.md) — formato de los archivos.
- [`doc/Manual_Usuario.md`](doc/Manual_Usuario.md) — uso.
- [`doc/Plan_Trabajo.md`](doc/Plan_Trabajo.md) — plan por fases.
