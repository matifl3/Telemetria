# Catálogo de gráficos del visualizador

Ideas de gráficos para la app de análisis (`visualizador/`), clasificadas por
**cómo se agrupan las vueltas**:

1. **Una vuelta** — análisis de una sola vuelta.
2. **Conjunto de vueltas** — estadísticas que usan *todas* las vueltas cargadas.
3. **Comparación de 2 o más vueltas** — diferencias entre vueltas elegidas.

> Este documento es de **diseño**: describe qué gráficos se pueden hacer, con qué
> datos y el esfuerzo estimado. No implica que ya estén implementados.

## Leyenda de estado

| Símbolo | Significado |
|---|---|
| ✅ | Ya implementado en la app |
| 🟢 | Fácil (datos directos, solo dibujar) |
| 🟡 | Media (requiere algún cálculo: remuestreo, agregados, detección) |
| 🔴 | Requiere lógica adicional significativa (sectores, delta, vuelta teórica) |
| ⛔ | No disponible con los datos actuales del `.acreplay` |

## Canales disponibles

Los datos por frame permiten:

- **Auto**: tiempo, `velocidad_kmh`, `vel_x/y/z`, `acc_x/y/z/total`, `rpm`,
  `marcha`, `gas`, `freno`, `steer_angle`, `pos_x/y/z`, `rot_x/y/z`,
  `bodywork_noise`, `drivetrain_speed`, `numero_vuelta`, `tiempo_vuelta_ms`,
  `fuel`, `fuel_por_vuelta`, `boost`, `dirt`, daños, `status`.
- **Ruedas** (FL/FR/RL/RR): `pos_x/y/z_*`, `rot_x/y/z_*`, `vel_angular_*`,
  `slip_angle_*`, `slip_ratio_*`, `nd_slip_*`, `carga_*`, `dirt_*`.

**No disponible** (⛔) desde un `.acreplay`: temperatura y presión de neumáticos,
embrague/handbrake/detalles CSP (solo captura en vivo). `slip_angle_*` da 0 en las
pruebas (offset a confirmar).

---

## 1. Gráficos de una vuelta (individual)

### 1.1 Series por distancia

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Velocidad | `velocidad_kmh` a lo largo del recorrido | `velocidad_kmh`, distancia | ✅ | — |
| Acelerador / Freno | Pedales en el tiempo (`gas`, `freno`) | `gas`, `freno` | ✅ | — |
| RPM | Régimen del motor vs distancia | `rpm` | 🟢 | Alta |
| Marcha | Escalones de cambio | `marcha` | 🟢 | Alta |
| Volante | Ángulo de dirección (correcciones) | `steer_angle` | 🟢 | Alta |
| Aceleración total | Módulo de aceleración (frenada/arranque) | `acc_total` | 🟢 | Media |


### 1.2 Mapas del trazado

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Mapa de pista | Trazada x/z con marcador + reproductor | `pos_x`, `pos_z` | ✅ | — |
| Mapa coloreado por canal | La línea pintada según velocidad/gas/freno/marcha | `pos_x/z` + canal | 🟡 | Alta |
| Mapa 3D | x/z + elevación (`pos_y`) coloreado | `pos_x/y/z` | 🟡 | Media |
| Marcadores de frenada | Puntos donde se frena fuerte | `freno`, `pos_x/z` | 🟢 | Media |
| Marcadores de cambio | ↑↓ de marcha sobre el trazado | `marcha` | 🟢 | Baja |

> **Trazada por vuelta**: cada vuelta se dibuja en su propio mini-mapa sobre una
> banda gris que es la **silueta de todas las vueltas visibles**. La banda se
> centra en la **posición media** de las vueltas (no en la REF), así cada trazada
> — incluida la de referencia — queda donde se condujo realmente y no forzada al
> centro de la pista.

### 1.3 Dinámica y ruedas

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Círculo de tracción | `acc_lat` vs `acc_long` (g usado) | `acc_x/y/z` | 🟢 | Alta |
| Rumbo / yaw | `rot_y` vs distancia (giro real del auto) | `rot_y` | 🟢 | Media |
| Carga por rueda | Fuerza vertical sobre cada neumático | `carga_*` | 🟢 | Media |



## 2. Gráficos del conjunto de vueltas (agregados)

Usan **todas** las vueltas cargadas para sacar estadísticas globales.

### 2.1 Tiempos y consistencia

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Barras de tiempos | Ranking horizontal de vueltas (mejor → peor) | tiemp+ | 🟢 | Alta |
| Delta vs mejor | Cada vuelta marcada como `+x.xx s` | tiempos | 🟢 | Alta |
| Consistencia | Desvío estándar de tiempos (barra / indicador) | tiempos | 🟢 | Media |
| Distribución de tiempos | Histograma de tiempos de vuelta | tiempos | 🟡 | Baja |

### 2.2 Velocidad y rendimiento

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Envolvente de velocidad | Banda min/avg/max por metro entre todas las vueltas | `velocidad_kmh`, dist | 🟡 | Alta |
| Vel. media por vuelta | Barra comparativa de media y máxima | `velocidad_kmh` | 🟢 | Alta |
| Histograma de velocidades | Distribución de velocidad (todas las vueltas) | `velocidad_kmh` | 🟡 | Baja |
| Media ± desvío (banda) | Perfil medio con banda de confianza | `velocidad_kmh`, dist | 🟡 | Media |

### 2.3 Pedales, motor y estilo

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Histograma de marchas | % de tiempo en cada marcha | `marcha` | 🟡 | Media |


### 2.5 Consistencia de trazada

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Desvío lateral por metro | Separación de cada vuelta vs línea mejor vuelta | `pos_x/z`, dist | 🔴 | Alta |

### 2.6 Sectores y vuelta teórica

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Sectores automáticos | Tramos definidos por curvatura/distancia con su tiempo | dist, `velocidad_kmh` | 🔴 | Alta |
| Tabla resumen por vuelta | Fila por vuelta: tiempo, media, máx, gas%, freno%, g, cambios, fuel | varios | 🟡 | Alta |
| Vuelta teórica ("perfecta") | Une el mejor tramo de cada vuelta | varios | 🔴 | Media |
| Mapa de mejores sectores | Trazada compuesta: junta el tramo del mejor sector de cada vuelta (coloreado por sector) sobre la pista gris de fondo y una base tenue de todas | `pos_x/z`, dist | 🟢 | Media |
| Fuel por vuelta | Consumo medio y desvío entre vueltas | `fuel`, `fuel_por_vuelta` | 🟢 | Baja |

---

## 3. Gráficos comparando 2 o más vueltas

Comparación directa entre vueltas elegidas (usar la vuelta de referencia "REF").

### 3.1 Diferenciales

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Delta de tiempo A–B | `+0.20 s` acumulado vs distancia entre dos vueltas | dist, `velocidad_kmh` | 🔴 | Alta |
| Diferencia de velocidad | `vel_A − vel_B` por metro | `velocidad_kmh`, dist | 🟡 | Alta |
| Diferencia de pedales | Dónde una vuelta frena/acelera antes | `gas`, `freno` | 🟡 | Media |

### 3.2 Superposición

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Volante superpuesto | Correcciones comparadas | `steer_angle` | 🟢 | Media |

### 3.3 Análisis por vuelta relativa

| Gráfico | Qué muestra | Datos | Estado | Prioridad |
|---|---|---|---|---|
| Mini-deltas por sector | Quién gana/pierde en cada tramo | dist, `velocidad_kmh` | 🔴 | Media |

---



Ver también: `doc/FormatoTelemetria.md` (offsets del `.acreplay`).
