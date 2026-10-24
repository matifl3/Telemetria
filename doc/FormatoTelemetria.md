# Formato de telemetría

Referencia de los archivos que consume la app. Los números están en
**little-endian** (símbolo `<` en `struct`).

Índice:
- [1. Dónde están los archivos](#1-dónde-están-los-archivos)
- [2. `.acreplay` versión 16](#2-acreplay-versión-16)
- [3. `fast_lane.ai` (línea central de la pista)](#3-fast_laneai-línea-central-de-la-pista)
- [4. `.nkt` (AiM Race Studio)](#4-nkt-aim-race-studio)
- [5. Formatos relacionados](#5-formatos-relacionados)

---

## 1. Dónde están los archivos

### Fuentes de telemetría en AC1

| Fuente | Genera | Ruta típica | En alcance |
|---|---|---|---|
| Replay `.acreplay` (v16) | El usuario ("Save Replay") | `Documents\Assetto Corsa\replay\` | **Sí (principal)** |
| `ctelemetry` `.ct` | El juego, automático por vuelta | `Documents\Assetto Corsa\ctelemetry\player\` | No |
| Resultados de carrera | El juego, automático | `Documents\Assetto Corsa\out\` | No |
| Captura en vivo (shared memory / UDP) | Un programa externo | — | No |
| Apps de terceros (Telemetrick, ACTI) | Apps instaladas | `Documents\apps\...` | No |

- **`.acreplay`**: la fuente principal. Trae la telemetría **completa por frame**
  y la controla el usuario. Ver §2.
- **`out\`**: tiempos/posiciones en JSON/INI, **sin** telemetría por frame.
- Las demás quedan fuera de alcance (ver `Requisitos.txt`).

Notas de configuración:
- El export `.nkt` requiere la opción de telemetría habilitada en
  `assettocorsa\system\cfg\assetto_corsa.ini` (`[TELEMETRY]`).

---

## 2. `.acreplay` versión 16

Contenedor binario: encabezado → frames globales de objetos de pista → por cada
auto: encabezado + frames. Puede terminar con un bloque opcional de **CSP**
(Custom Shaders Patch).

### 2.1 Tipos

| Símbolo | Tipo | Bytes |
|---|---|---|
| `u8` | entero sin signo | 1 |
| `u16` | entero sin signo | 2 |
| `u32` | entero sin signo | 4 |
| `f32` | IEEE 754 simple | 4 |
| `f16` | IEEE 754 **media** precisión | 2 |
| `str` | `u32` largo + bytes UTF-8 | 4 + n |

### 2.2 Encabezado

| Orden | Campo | Tipo |
|---|---|---|
| 1 | `version` (debe ser 16) | `u32` |
| 2 | `recording_interval` (ms entre frames) | `f64` |
| 3 | `weather` | `str` |
| 4 | `track` | `str` |
| 5 | `track_config` | `str` |
| 6 | `num_cars` | `u32` |
| 7 | `current_recording_index` | `u32` |
| 8 | `num_frames` | `u32` |
| 9 | `num_track_objects` | `u32` |

`f64` = double (8 bytes). Tras el encabezado se saltan
`(4 + 12 × num_track_objects) × num_frames` bytes (2 ángulos de sol de 2 bytes +
12 bytes por objeto de pista, por frame).

### 2.3 Encabezado por auto

| Orden | Campo | Tipo |
|---|---|---|
| 1 | `car_id` | `str` |
| 2 | `driver_name` | `str` |
| 3 | `nation_code` | `str` |
| 4 | `driver_team` | `str` |
| 5 | `car_skin_id` | `str` |
| 6 | `num_frames` | `u32` |
| 7 | `num_wings` | `u32` |

Luego 20 bytes de relleno y los frames. Entre frame y frame se saltan
`20 + num_wings × 4` bytes; tras el último frame se saltan `num_wings × 4`,
se lee `u32 extra_count` y `extra_count × 8` bytes finales.

### 2.4 Frame de auto (`CarFrame`, 256 bytes)

Orden de ruedas: **FL, FR, RL, RR** (delantera izq./der., trasera izq./der.).

| Offset | Campo | Tipo |
|---|---|---|
| 0 | `position` (x, y, z) | 3 × `f32` |
| 12 | `rotation` (yaw, pitch, roll) | 3 × `f16` |
| 20 | `static_position` × 4 ruedas | 4 × 3 × `f32` |
| 68 | `static_rotation` × 4 ruedas | 4 × 3 × `f16` |
| 92 | `position` (rueda) × 4 | 4 × 3 × `f32` |
| 140 | `rotation` (rueda) × 4 | 4 × 3 × `f16` |
| 164 | `velocity` (x, y, z) | 3 × `f16` |
| 170 | `rpm` | `f16` |
| 172 | `angular_velocity` × 4 | 4 × `f16` |
| 180 | `slip_angle` × 4 | 4 × `f16` |
| 188 | `slip_ratio` × 4 | 4 × `f16` |
| 196 | `nd_slip` × 4 | 4 × `f16` |
| 204 | `load` × 4 | 4 × `f16` |
| 212 | `steer_angle` | `f16` |
| 214 | `bodywork_noise` | `f16` |
| 216 | `drivetrain_speed` | `f16` |
| 218 | *(reservado)* | 2 bytes |
| 220 | `current_lap_time` (ms) | `u32` |
| 224 | `last_lap_time` (ms) | `u32` |
| 228 | `best_lap_time` (ms) | `u32` |
| 232 | `fuel` | `u8` |
| 233 | `fuel_per_lap` | `u8` |
| 234 | `gear` | `u8` |
| 235 | `tire_dirt` × 4 | 4 × `u8` |
| 239 | `damage_front_deformation` | `u8` |
| 240 | `damage_rear` | `u8` |
| 241 | `damage_left` | `u8` |
| 242 | `damage_right` | `u8` |
| 243 | `damage_front` | `u8` |
| 244 | `gas` (acelerador 0–255) | `u8` |
| 245 | `brake` (freno 0–255) | `u8` |
| 246 | `current_lap` (n.º de vuelta) | `u8` |
| 247 | *(desconocido)* | `u8` |
| 248 | `status` | `u16` |
| 250 | *(desconocido)* | `u16` |
| 252 | `dirt` | `u8` |
| 253 | `engine_health` | `u8` |
| 254 | `boost` | `u8` |
| 255 | *(sin usar)* | 1 byte |

**`rotation` está en orden Y-X-Z** en el archivo; el lector lo reordena a X-Y-Z.

**Bits de `status`:**

| Bit(s) | Significado |
|---|---|
| 3 | `horn` (bocina) |
| 4–5 | `camera_direction` |
| 9 | `gearbox_being_damaged` |
| 12 | `lights` |

### 2.5 Bloque opcional CSP

- Al final del archivo puede haber un **pie** de 24 + 8 bytes:
  la cadena `__AC_SHADERS_PATCH_v1__` + `u32 offset` + `u32 version (==1)`.
- En `offset` hay *chunks* con prefijo de largo (`u32`) y etiqueta.
- Etiquetas `EXT_PERCAR_v6:` / `EXT_PERCAR_v7:` → frames extra por auto de
  **108 bytes** cada uno, comprimidos con `zlib`, con: `clutch`, `handbrake`,
  `wipers`, `turn_signals`, `low_beams` y opciones extra.
- Un chunk INI (largo > 255) contiene los nombres de piloto de CSP.

### 2.6 Resumen de señales útiles

`t` (frame × intervalo), `speed` (derivada de `velocity`), `rpm`, `gear`,
`gas`, `brake`, `steer_angle`, `current_lap`, `current_lap_time`,
`last_lap_time`, `best_lap_time`, `fuel`, `boost`, y por rueda
`slip_angle`, `slip_ratio`, `nd_slip`, `load`, `dirt`.

> Limitación: **no hay temperatura ni presión de neumáticos** en `.acreplay`.
> Esas señales solo existen en shared memory / UDP en vivo.

---

## 3. `fast_lane.ai` (línea central de la pista)

Archivo binario little-endian con la **línea central** de la pista. Es la fuente
obligatoria para entrar al análisis: de acá salen la banda de pista, la detección
de curvas y el arco de pista (`s`) usado para alinear vueltas.

### 3.1 Cabecera

Cuatro `i32` consecutivos. El único que se usa es el **segundo**, que indica la
cantidad de puntos `n`; los otros tres son reservados (no se interpretan).

| Offset | Campo | Tipo |
|---|---|---|
| 0 | reservado | `i32` |
| 4 | `n` (cantidad de puntos) | `i32` |
| 8 | reservado | `i32` |
| 12 | reservado | `i32` |

### 3.2 Puntos (obligatorio, 20 bytes por punto)

`n` registros consecutivos, en orden de recorrido:

| Offset | Campo | Tipo |
|---|---|---|
| 0 | `x` | `f32` |
| 4 | `y` | `f32` |
| 8 | `z` | `f32` |
| 12 | `ns` (distancia acumulada, m) | `f32` |
| 16 | `id` de punto | `i32` |

El registro ocupa 20 bytes exactos: no hay relleno después del `id`.

### 3.3 Bloque opcional de 72 bytes por punto

Si después de los `n` puntos quedan al menos `n × 72` bytes, hay un bloque
opcional con datos de ancho de pista. Los **semianchos** izquierdo y derecho
están en los `f32` número 6 y 7 del registro (offsets 24 y 28):

| Offset dentro del registro | Campo |
|---|---|
| 0–23 | otros datos de pista (no usados) |
| 24 | semiancho izquierdo (m) | `f32` |
| 28 | semiancho derecho (m) | `f32` |
| 32–71 | otros datos de pista (no usados) |

Un semiancho se considera válido si es finito y está en `(0, 200)` m. El ancho
utilizable es la mediana de `(izq + der) / 2` sobre los puntos válidos; si no hay
ninguno, se usa un semiancho por defecto de 6 m. La app usa **ancho constante**
(mismo semiancho en todos los puntos), igual que v1.

### 3.4 Validación

- `n >= 3` y `n <= 5_000_000`.
- El archivo debe contener los `n × 20` bytes de puntos; si no, es inválido.
- La ausencia del bloque de 72 bytes **no** invalida el archivo.
- Si `ns` no es estrictamente creciente, se recalcula desde `x`/`z` sumando
  distancias euclidianas. La longitud de pista es el último valor de `ns`.

Si falla cualquiera de estas condiciones, el archivo se rechaza como pista
inválida (RF-006).

---

## 4. `.nkt` (AiM Race Studio)

- Formato **propietario de AiM** (usado por *Race Studio*), binario y **no
  documentado públicamente**.
- AC lo genera en `Documents\Assetto Corsa\aim\telemetry_dump.nkt` y se
  **sobreescribe** cada sesión.
- **No soportado** por el visualizador: hoy la única vía confiable es abrirlo con
  **AiM Race Studio**. La aplicación trabaja exclusivamente con replays
  `.acreplay`.

---

## 5. Formatos relacionados

- **`ctelemetry`** (`Documents\Assetto Corsa\ctelemetry\player\`): formato
  binario por vuelta, con estructura conocida (metadatos de usuario/pista/auto,
  `lap_time_ms`, y arreglos de `position`, `gear`, `speed`, `throttle`, `brake`).
  Es una alternativa simple si se necesita otra fuente. (Existe un PoC público
  de parseo.)
- **MoTeC `.ld`**: lo usa **ACC**, no AC1. Fuera de alcance.

---

## Referencias

- Parser `.acreplay` v16 en Python: `github.com/ffff2004/ac-telemetry-cli`
  (`packages/ac-replay-parser`).
- Origen C++ del parser: `github.com/abchouhan/acreplay-parser`.
- Shared memory de AC (para contexto en vivo): `acpmf_physics`,
  `acpmf_graphics`, `acpmf_static`.
