# AC Telemetry Lab

Aplicación de escritorio para **analizar y comparar** la telemetría de **Assetto
Corsa (AC1)** a partir de los replays `.acreplay` (versión 16) y del archivo de
pista `fast_lane.ai`.

> Estado: v2 funcional con las pestañas **Vuelta**, **Vueltas**, **Mapa**,
> **Conjunto**, **Comparación** y **Curvas**. Parseo y cálculos en Rust, interfaz
> HTML/JS plana sobre Tauri 2. `cargo test --workspace` en verde (123 tests).

---

## 1. Qué hace

- **Parsea `.acreplay` v16** y separa la sesión en vueltas, para todos los autos
  del replay.
- **Proyecta cada muestra sobre la pista** (`fast_lane.ai`) y alinea por arco de
  pista `s`, no por distancia recorrida.
- **Detecta las curvas una sola vez** sobre la pista, con numeración estable
  `C1..Cn` independiente de la vuelta o del auto elegido.
- Dibuja gráficos sincronizados (uPlot), mapa de trazadas, comparación A/B,
  agregados de conjunto y métricas por curva.
- Identifica al **jugador real** con `current_recording_index` y permite cambiar
  la vuelta de referencia (REF) y la de comparación (B).

## 2. Requisitos

- **Windows 10/11** con WebView2 (incluido en el sistema).
- **Rust estable** con el toolchain MSVC.
- **Node.js** solo si se usa `npx tauri`; `cargo run` no lo necesita.
- No requiere servidor, build del front ni conexión a internet: uPlot está
  vendorizado en `front/vendor/`.

## 3. Cómo ejecutar

```bash
cargo run -p ac-telemetry-lab
```

o, con la CLI de Tauri:

```bash
cd src-tauri
npx tauri dev
```

No hay paso de build propio del front: Tauri **embebe `front/` al compilar**.
Después de editar `front/`, hay que recompilar (`cargo build -p ac-telemetry-lab`);
recargar la ventana no alcanza.

## 4. Uso

1. En Assetto Corsa, correr la sesión y **guardar el replay** (queda en
   `Documents\Assetto Corsa\replay\`).
2. Abrir la aplicación y **cargar el replay** (`.acreplay`).
3. **Cargar la pista** (`fast_lane.ai`), en la carpeta `ai\` de la pista (por
   ejemplo `...\content\tracks\monza\lfmv2\ai\fast_lane.ai`). Es **obligatoria**
   para entrar al análisis.
4. Elegir vueltas, fijar REF/B y recorrer las pestañas.

Los archivos se pueden cargar con los botones del encabezado o arrastrándolos a
la zona de carga. **No hay persistencia**: los datos viven solo en memoria durante
la sesión; al cerrar o limpiar se pierden y hay que volver a cargar los archivos.

## 5. Pestañas

| Pestaña | Contenido |
|---|---|
| **Vuelta** | Gráficos por vuelta (velocidad, pedales, marchas, RPM, G, cargas, etc.), sincronizados y con cursor. |
| **Vueltas** | Listado de vueltas válidas en dos secciones: **Tus vueltas** (jugador real, en su orden) y **Otros autos** (ordenados por tiempo, de más rápida a más lenta). Permite fijar REF/B y mostrar u ocultar cada vuelta. |
| **Mapa** | Trazada sobre la pista, canales (velocidad, frenada, cambios…), vista 3D rotable, zoom/pan. |
| **Conjunto** | Estadísticas de las vueltas válidas del auto de la REF + mapa por sectores (vista 3D). |
| **Comparación** | Diferencias entre dos vueltas (A/B). |
| **Curvas** | Curvas detectadas desde `fast_lane.ai`, tracción (g-g) por curva con marcadores de slip y **delta A/B por curva**. |

### Pestaña Vueltas

- Solo se listan **vueltas válidas**.
- **Tus vueltas** usa el jugador real del replay, no el primer auto. Si no se
  puede identificar, muestra un aviso y todas las vueltas válidas pasan a
  **Otros autos**.
- El orden es fijo: no hay botón de ascendente/descendente.
- **REF** y **B** son excluyentes: una vuelta no puede tener los dos roles.
- El ojo muestra u oculta la vuelta. Si se oculta la REF o la B, el backend
  normaliza la selección y asigna un reemplazo cuando hace falta.

## 6. Arquitectura

```
front/       HTML + JS plano, uPlot local
   │         invoke() → DTO JSON ya calculado
src-tauri/   comandos Tauri + sesión en memoria
   │         llamadas Rust
core/        parseo, modelo, cálculos y tests (sin Tauri)
```

Regla de dependencia: `front → src-tauri → core`, nunca al revés. `core` no
conoce Tauri, rutas, ventanas ni el JSON de la UI.

- **Sin persistencia:** `core` recibe bytes, no rutas; la capa Tauri solo lee los
  archivos elegidos por el usuario. Nada se escribe en disco.
- **La lógica vive en `core`:** el front solo dibuja los DTO ya calculados.

## 7. Estructura

```
Telemetria/
├─ core/                    # crate Rust: parser, modelo, cálculos y tests
│  ├─ src/
│  └─ tests/
├─ src-tauri/               # capa Tauri: comandos, estado y ventana
│  ├─ src/
│  ├─ tests/
│  └─ tauri.conf.json
├─ front/                   # interfaz (HTML/JS/CSS plano)
│  ├─ index.html
│  ├─ estilos.css
│  ├─ app/
│  └─ vendor/               # uPlot
├─ doc/                     # especificación y catálogos
├─ spec/                    # planes y tareas de cada cambio
└─ visualizador/            # v1 legada, solo referencia histórica
```

## 8. Verificación

```bash
cargo test --workspace          # tests de core y de la capa Tauri
cargo build -p ac-telemetry-lab # compila la app y embebe front/
node --check front/app/main.js  # chequeo de sintaxis del front (opcional)
```

El repositorio no tiene lint, tests de front ni CI. Los tests de lógica viven en
`core/tests/` y `src-tauri/tests/`.

## 9. Documentación

- [`doc/FormatoTelemetria.md`](doc/FormatoTelemetria.md) — offsets y señales del
  `.acreplay` v16 y de `fast_lane.ai`.
- [`doc/constitucion.md`](doc/constitucion.md) — principios innegociables del
  proyecto.
- [`doc/PLAN_CURVAS.md`](doc/PLAN_CURVAS.md) — detección de curvas y delta A/B.
- [`doc/Catalogo_Graficos.md`](doc/Catalogo_Graficos.md) — catálogo de gráficos.
- [`spec/migracion-tauri-rust/`](spec/migracion-tauri-rust/) — plan y requisitos
  de la v2.
- [`spec/pestana-vueltas/`](spec/pestana-vueltas/) — diseño y tareas de la
  pestaña Vueltas.
