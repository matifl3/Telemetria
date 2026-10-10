# Columnas del CSV (diccionario de datos)

Referencia de las columnas que genera el exportador del core
(`core/src/telemetria/procesamiento/exportador.py`).

- Se genera **un CSV por vuelta** (`<pista>_vuelta_NN.csv`) con **85 columnas**.
- Se genera además un **resumen** (`<pista>_resumen.csv`) con **10 columnas**.
- El orden de columnas de la vuelta es: **auto (37) → ruedas (48)**.
- Orden de ruedas: **FL, FR, RL, RR** (delantera izq./der., trasera izq./der.).

**Origen**: `Replay` = leído directamente del `.acreplay`; `Derivada` = calculado
por el programa a partir de otros canales (no existe en el archivo).

**Sobre `t`**: es el tiempo del frame = `índice de frame × intervalo`, medido
desde el **inicio de la grabación** (no desde el inicio de la vuelta). Para el
tiempo dentro de una vuelta: `t − t` del primer frame de esa vuelta.

---

## 1. Auto (37 columnas)

| # | Columna | Unidad / escala | Origen | Descripción |
|---|---|---|---|---|
| 1 | `t` | s | Replay | Tiempo del frame desde el inicio de la grabación |
| 2 | `velocidad_kmh` | km/h | Derivada | Módulo del vector velocidad |
| 3 | `acc_x` | m/s² | Derivada | Aceleración en el eje X del mundo (Δvelocidad/Δt) |
| 4 | `acc_y` | m/s² | Derivada | Aceleración en el eje Y del mundo |
| 5 | `acc_z` | m/s² | Derivada | Aceleración en el eje Z del mundo |
| 6 | `acc_total` | m/s² | Derivada | Módulo √(acc_x²+acc_y²+acc_z²); dividir por 9.80665 para G |
| 7 | `rpm` | rpm | Replay | Revoluciones del motor |
| 8 | `marcha` | — | Replay | Marcha actual (`gear`; 0 = punto muerto) |
| 9 | `gas` | 0–255 (crudo) | Replay | Acelerador |
| 10 | `freno` | 0–255 (crudo) | Replay | Freno |
| 11 | `steer_angle` | crudo (`f16`) | Replay | Ángulo de dirección |
| 12 | `pos_x` | m | Replay | Posición X del auto en el mundo |
| 13 | `pos_y` | m | Replay | Posición Y del auto |
| 14 | `pos_z` | m | Replay | Posición Z del auto |
| 15 | `rot_x` | rad (crudo) | Replay | Orientación del auto, eje X (normalizada de Y-X-Z) |
| 16 | `rot_y` | rad (crudo) | Replay | Orientación del auto, eje Y |
| 17 | `rot_z` | rad (crudo) | Replay | Orientación del auto, eje Z |
| 18 | `vel_x` | m/s | Replay | Componente X del vector velocidad |
| 19 | `vel_y` | m/s | Replay | Componente Y del vector velocidad |
| 20 | `vel_z` | m/s | Replay | Componente Z del vector velocidad |
| 21 | `bodywork_noise` | crudo (`f16`) | Replay | Ruido/vibración de carrocería |
| 22 | `drivetrain_speed` | crudo (`f16`) | Replay | Velocidad de giro de la transmisión |
| 23 | `numero_vuelta` | — | Replay | Contador de vuelta actual (`current_lap`) |
| 24 | `tiempo_vuelta_ms` | ms | Replay | Tiempo de la vuelta en curso |
| 25 | `ultima_vuelta_ms` | ms | Replay | Tiempo de la última vuelta completada |
| 26 | `mejor_vuelta_ms` | ms | Replay | Mejor tiempo de vuelta del auto |
| 27 | `fuel` | 0–255 (crudo) | Replay | Combustible |
| 28 | `fuel_por_vuelta` | 0–255 (crudo) | Replay | Combustible estimado por vuelta |
| 29 | `boost` | 0–255 (crudo) | Replay | Turbo/boost |
| 30 | `dirt` | 0–255 (crudo) | Replay | Suciedad del auto |
| 31 | `engine_health` | 0–255 | Replay | Salud del motor (menor = más dañado) |
| 32 | `damage_front_deformation` | 0–255 | Replay | Deformación frontal |
| 33 | `damage_rear` | 0–255 | Replay | Daño trasero |
| 34 | `damage_left` | 0–255 | Replay | Daño lateral izquierdo |
| 35 | `damage_right` | 0–255 | Replay | Daño lateral derecho |
| 36 | `damage_front` | 0–255 | Replay | Daño frontal |
| 37 | `status` | bitmask `u16` | Replay | Estado (ver bits abajo) |

**Bits de `status`** (offset 248, `u16`):

| Bit(s) | Significado |
|---|---|
| 3 | `horn` (bocina) |
| 4–5 | `camera_direction` |
| 9 | `gearbox_being_damaged` |
| 12 | `lights` (luces) |

---

## 2. Ruedas (48 columnas = 12 canales × 4 ruedas)

Se imprimen **por canal** (los valores de las cuatro ruedas seguidos), en este
orden: `pos_x_<R>`, `pos_y_<R>`, `pos_z_<R>`, `rot_x_<R>`, `rot_y_<R>`,
`rot_z_<R>`, `vel_angular_<R>`, `slip_angle_<R>`, `slip_ratio_<R>`,
`nd_slip_<R>`, `carga_<R>`, `dirt_<R>`, con `<R>` recorriendo `FL, FR, RL, RR`
en cada canal (p. ej. `pos_x_FL, pos_x_FR, pos_x_RL, pos_x_RR, pos_y_FL, …`).

| Canal | Unidad / escala | Origen | Descripción |
|---|---|---|---|
| `pos_x_*`, `pos_y_*`, `pos_z_*` | m | Replay | Posición de la rueda en el mundo |
| `rot_x_*`, `rot_y_*`, `rot_z_*` | rad (crudo) | Replay | Orientación de la rueda (normalizada de Y-X-Z) |
| `vel_angular_*` | rad/s | Replay | Velocidad angular de la rueda |
| `slip_angle_*` | crudo | Replay | Ángulo de deslizamiento del neumático |
| `slip_ratio_*` | adimensional | Replay | Relación de deslizamiento (longitudinal) |
| `nd_slip_*` | adimensional | Replay | Deslizamiento normalizado |
| `carga_*` | N | Replay | Carga vertical sobre el neumático |
| `dirt_*` | 0–255 (crudo) | Replay | Suciedad del neumático |

`*` = `FL`, `FR`, `RL`, `RR`.

> **Nota**: en pruebas con replays reales, `slip_angle_*` salió `0.0000`. Falta
> confirmar si es el valor real o un offset a corregir en el parser.

---

## 3. Resumen (`<pista>_resumen.csv`, 10 columnas)

| Columna | Descripción |
|---|---|
| `vuelta` | Número de vuelta (`numero_vuelta`) |
| `tiempo_ms` | Tiempo de la vuelta (ms) |
| `tiempo` | Tiempo formateado `m:ss.mmm` |
| `valida` | `1`/`0`: vuelta válida (excluye salida/largada, entrada y cortadas) |
| `rapida` | `1`/`0`: dentro del `pct`% del mejor tiempo (por defecto 103) |
| `motivo` | Causa de invalidez: `salida`, `entrada`, `cortada`, `incompleta`; vacío si válida |
| `frames` | Cantidad de frames de la vuelta |
| `auto` | ID del auto |
| `piloto` | Nombre del piloto |
| `pista` | Nombre de la pista |

---

## 4. Limitaciones

- El `.acreplay` **no** guarda temperatura ni presión de neumáticos; eso solo
  existe en captura en vivo (shared memory / UDP), fuera de alcance.
- Varios canales (`gas`, `freno`, `fuel`, `boost`, `steer_angle`, etc.) son
  valores **crudos** del juego cuya escala exacta aún no está documentada.
- Los frames extra de **CSP** (`clutch`, `handbrake`, `wipers`, `turn_signals`,
  `low_beams`) todavía **no** se exportan (bloque opcional, ver
  `doc/FormatoTelemetria.md` §2.5).

Ver también: `doc/FormatoTelemetria.md` (offsets y tipos del archivo).
