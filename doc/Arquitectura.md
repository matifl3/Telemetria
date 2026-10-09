# Arquitectura

Documento de diseño de **Telemetría AC**. Todo el proyecto es **Python 3.10+** y
está separado en **dos capas** dentro de un mismo lenguaje:

- **Core (`core/`):** lee los archivos, segmenta por vuelta y exporta CSV.
  Es la pieza con más lógica y de mayor riesgo (formato binario).
- **Web (`web/`):** interfaz de usuario con **Flask**; no reimplementa nada,
  **importa el core como librería**.

---

## 1. Vista general

```
                    +-------------------------------------------+
                    |             WEB (Flask)                    |
   navegador  <---> |  app.py + rutas + plantillas Jinja2        |
                    |  import telemetria  (librería)             |
                    +--------------------+----------------------+
                                         |  llamada directa (mismo proceso)
                                         v
                    +-------------------------------------------+
                    |             CORE (Python)                 |
                    |  lector/   -> Sesion tipada               |
                    |  procesamiento/ -> Vuelta -> CSV          |
                    |  cli.py -> interfaz de línea de comandos  |
                    +-------------------------------------------+
                                         ^
                                         |  archivo .acreplay / .nkt
                                         |
                              Paquetes de telemetria/
```

Idea clave: **un solo motor y un solo lenguaje**. El core Python es la única
fuente de verdad del parseo; la CLI (fase 1) y la web (fase 3) lo usan. La web
solo se encarga de HTTP, subida/descarga y de presentar los resultados.

## 2. Capa CORE (Python)

```
core/src/telemetria/
├── lector/
│   ├── modelos.py        # dataclasses comunes: Sesion, Auto, Vuelta, Frame, Rueda
│   ├── acreplay.py       # parser .acreplay v16 (binario, struct)
│   ├── nkt.py            # parser .nkt (AiM) - fase 2 / a investigar
│   └── detector.py       # reconoce el formato de un archivo
├── procesamiento/
│   ├── segmentador.py    # divide frames en vueltas
│   └── exportador.py     # genera CSV por vuelta
├── errores.py            # ErrorTelemetria (excepción de dominio)
└── cli.py                # interfaz de línea de comandos (+ salida JSON)
```

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `lector.modelos` | Modelo de datos común | stdlib |
| `lector.acreplay` | Leer `.acreplay` v16 → `Sesion` | `modelos` |
| `lector.nkt` | Leer `.nkt`/CSV AiM → `Sesion` | `modelos` |
| `lector.detector` | Elegir el lector según el archivo | lectores |
| `procesamiento.segmentador` | `Sesion` → lista de `Vuelta` | `modelos` |
| `procesamiento.exportador` | `Vuelta` → CSV | stdlib / pandas |
| `cli` | Flujo completo + salida JSON | procesamiento |

### Modelo de datos (borrador)

```
Sesion:
  metadatos: pista, config_pista, clima, version_formato, intervalo_ms
  autos:     [Auto]
Auto:
  id, piloto, equipo, skin
  frames:    [Frame]
Frame:
  t (relativo), posicion, velocidad, rpm, marcha,
  gas, freno, steer_angle, lat, long, best, fuel, boost
  ruedas: [Rueda x4]  # FL, FR, RL, RR
Rueda:
  posicion, rotacion, vel_angular, slip_angle, slip_ratio,
  nd_slip, carga, dirt
Vuelta:
  numero, t_inicio, t_fin, tiempo_ms, es_valida, frames: [Frame]
```

## 3. Capa WEB (Flask)

```
web/
├── app.py              # crea la app Flask y registra las rutas
├── rutas.py            # endpoints HTTP + subida/descarga
├── sesion.py           # estado de la sesión y carpeta de trabajo
├── plantillas/         # HTML (Jinja2)
│   ├── base.html
│   ├── principal.html
│   ├── sesion.html
│   └── error.html
└── estatico/           # CSS/JS
```

- **`rutas.py`**: recibe el `multipart`, guarda el archivo en una carpeta
  temporal y llama al core **directamente** (`import telemetria`).
- **`sesion.py`**: gestiona el id de sesión, la carpeta de trabajo y la limpieza.
- **`app.py`**: `create_app()` y arranque del servidor de desarrollo.

## 4. Uso del core como librería

Al ser un solo lenguaje, la web **no usa `subprocess` ni JSON**: importa el core.
API pública prevista:

```python
from telemetria.lector.detector import leer
from telemetria.procesamiento.segmentador import segmentar
from telemetria.procesamiento.exportador import exportar_vueltas

sesion = leer(ruta_archivo)          # -> Sesion (o ErrorTelemetria)
vueltas = segmentar(sesion)          # -> [Vuelta]
archivos = exportar_vueltas(vueltas, carpeta_salida)  # -> [str] rutas CSV
```

El CLI expone el mismo flujo y, opcionalmente, una salida **JSON** en `stdout`
(útil para *scripts* y pruebas), pero la web no la necesita:

**Comando:**

```
python -m telemetria <archivo> --out <dir> [--json] [--auto N] [--solo-rapidas] [--pct P]
```

**Salida `--json` (stdout, código 0):**

```json
{
  "ok": true,
  "formato": "acreplay",
  "version": 16,
  "sesion": {
    "pista": "monza",
    "config_pista": "",
    "clima": "3_clear",
    "intervalo_ms": 16.66
  },
  "autos": [
    { "id": "ferrari_458_gt2", "piloto": "Matias", "equipo": "", "skin": "" }
  ],
  "resumen": "monza_resumen.csv",
  "vueltas": [
    { "numero": 2, "tiempo_ms": 105432, "valida": true, "rapida": true, "archivo": "monza_vuelta_02.csv" },
    { "numero": 3, "tiempo_ms": 104871, "valida": true, "rapida": true, "archivo": "monza_vuelta_03.csv" }
  ]
}
```

**Salida con error (código ≠ 0):**

```json
{ "ok": false, "error": "Solo se soporta .acreplay versión 16 (encontrado 15)" }
```

Reglas:
- `archivo` es relativo a la carpeta `--out` indicada.
- `valida=false` marca outlap/inlap (ver §6).
- `rapida=true` si la vuelta válida está dentro del `--pct`% del mejor tiempo
  (por defecto 103); se usa para filtrar con `--solo-rapidas`.

## 5. Endpoints web (Flask)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Página principal con formulario de subida |
| `POST` | `/subir` | Recibe el archivo, ejecuta el core y crea la sesión |
| `GET` | `/sesion` | Lista las vueltas detectadas de la sesión actual |
| `GET` | `/sesion/vuelta/<n>.csv` | Descarga el CSV de la vuelta `n` |
| `GET` | `/sesion/todas.zip` | Descarga todas las vueltas en un ZIP |
| `POST` | `/sesion/borrar` | Elimina los archivos temporales |

### Flujo de usuario

```
/subir  ──(import telemetria)──► Core Python ──► CSV
   ▲                                    │
   └──────────── /sesion ◄──────────────┘
                     │
                     └──► /sesion/vuelta/<n>.csv  (descarga)
```

### Persistencia

- Cada subida usa una **carpeta temporal única** (p. ej. `datos/<uuid>/`) con el
  archivo original y los CSV generados.
- No hay base de datos en v1. El estado de la sesión vive en la sesión Flask
  (cookie) o en un mapa en memoria.
- Limpieza: al borrar la sesión o por caducidad (tarea programada).

### Configuración

`web/config.py` (o variables de entorno):

```python
CARPETA_TRABAJO = "C:/Facultad/ProyectoProgra/Telemetria/datos"
TAMANO_MAX_SUBIDA = 200 * 1024 * 1024   # 200 MB
EXTENSIONES = {".acreplay", ".nkt"}
```

## 6. Segmentación de vueltas (lógica propuesta)

Regla base (a validar con datos reales):

- Se detecta un corte cuando el número de vuelta `n` cambia a `n+1`, o cuando
  `current_lap_time` cae (reinicio) respecto del frame anterior.
- El tiempo de la vuelta se toma de `last_lap_time` cuando se cierra la vuelta.
- La **vuelta de salida** (outlap) y la **de entrada** (inlap) se marcan como
  `valida = false` (ver pregunta P3 de Requisitos).

## 7. Tecnologías y dependencias

| Capa | Componente | Elección | Motivo |
|---|---|---|---|
| Core | Lenguaje | Python 3.10+ | Parser ya resuelto; `f16` a mano |
| Core | Parseo binario | `struct`, `zlib` (stdlib) | Sin dependencias externas |
| Core | CSV | `csv` (stdlib) o `pandas` | `pandas` simplifica columnas |
| Core | Tests | `pytest` | Estándar de facto |
| Web | Framework | Flask + Jinja2 | Simple, ideal para subir/descargar |
| Web | Integración | `import` del core | Un solo lenguaje, sin `subprocess` |

`core/requirements.txt` (propuesto):

```
# fase 1 (core + CLI)
pytest>=8.0
```

`web/requirements.txt` (propuesto):

```
flask>=3.0
```

## 8. Manejo de errores (extremo a extremo)

1. El core lanza `ErrorTelemetria` con un mensaje claro.
2. La CLI lo serializa como `{"ok": false, "error": "..."}` y sale con código ≠ 0.
3. La web captura `ErrorTelemetria` y muestra el mensaje en la plantilla de error.
4. Casos: archivo inexistente, extensión desconocida, versión no soportada,
   datos truncados/dañados, archivo sin vueltas completas.
5. Seguridad: validar extensión y tamaño del archivo subido; nunca ejecutar el
   archivo como código; la salida siempre dentro de la carpeta de trabajo.

## 9. Decisiones abiertas

- ¿`pandas` desde el inicio o CSV con la stdlib primero? (recomendado: stdlib en
  fase 1).
- ¿Cómo tratar `.nkt` (ver RNF-06)?
- ¿Persistir historial (SQLite) en fases posteriores?
