# AC Telemetry Lab

Aplicación de escritorio para analizar y comparar replays de **Assetto Corsa
(AC1)**. Lee archivos `.acreplay` versión 16 y requiere el `fast_lane.ai`
correspondiente a la pista.

La aplicación actual usa **Tauri 2**, una interfaz HTML/CSS/JavaScript y un
backend de análisis en Rust. `visualizador/` contiene la versión web anterior y
se conserva solo como referencia; no forma parte de la aplicación de escritorio.

## Funcionalidades

- Parseo de replays v16 con varios autos y segmentación de vueltas.
- Proyección sobre `fast_lane.ai` y alineación de las vueltas por distancia de
  pista.
- Gráficos sincronizados de velocidad, acelerador, freno, RPM, marchas,
  aceleraciones, cargas y otros canales disponibles.
- Lista de vueltas válidas, con selección de REF/B y visibilidad individual o
  global. Al ocultar todas, la REF se mantiene visible para conservar el
  análisis.
- Mapas de pista y trazadas, comparación A/B y estadísticas de conjunto.
- Detección de curvas desde `fast_lane.ai`, círculos de tracción y delta A/B por
  curva.
- En el mapa de mejores sectores, `fast_lane.ai` es la base y los tramos más
  rápidos de cada sector se superponen sobre ella.

## Requisitos

### Para ejecutar una compilación existente

- Windows 10/11 de 64 bits.
- WebView2 Runtime, normalmente incluido en Windows 10/11.

### Para compilar desde el código fuente

- Rust estable con el toolchain **MSVC** y las herramientas de compilación de
  Visual Studio para C++.
- Windows SDK.
- Node.js y npm para ejecutar la CLI de Tauri.

La interfaz y uPlot están incluidos en el repositorio: no hace falta servidor ni
conexión a Internet para analizar. Si Windows no tiene WebView2 Runtime, el
instalador lo descarga durante la instalación; en ese caso se necesita Internet.

## Ejecutar desde el código fuente

Desde la raíz del repositorio:

```powershell
cargo run -p ac-telemetry-lab
```

Tauri carga y embebe `front/` directamente; no hay un paso de build separado
para el frontend. Después de editar archivos de `front/`, reinicia o recompila
la aplicación para ver los cambios.

## Usar la aplicación

1. Guarda el replay desde Assetto Corsa. Normalmente queda en
   `Documentos\Assetto Corsa\replay\`.
2. Abre la aplicación y carga el archivo `.acreplay`.
3. Carga el `fast_lane.ai` de esa pista. Suele estar dentro de
   `...\content\tracks\<pista>\<configuración>\ai\fast_lane.ai`.
4. Selecciona las vueltas y recorre las pestañas de análisis.

El replay y la pista se pueden cargar con los botones de la aplicación o
arrastrando los archivos a la ventana. El análisis requiere ambos archivos. No
se guardan replays, selecciones ni resultados: los datos permanecen en memoria
durante la sesión y se pierden al cerrar la aplicación o limpiar la sesión.

## Pestañas

| Pestaña | Contenido |
|---|---|
| **Vuelta** | Gráficos sincronizados de los canales de las vueltas visibles y lecturas de la REF. |
| **Vueltas** | Vueltas válidas del jugador y de otros autos; permite elegir REF/B y mostrar u ocultar vueltas. |
| **Mapa** | Trazadas sobre la pista, visualización por canal y controles de zoom, paneo y vista 3D. |
| **Conjunto** | Estadísticas, sectores, vuelta teórica y mapa de mejores sectores sobre `fast_lane.ai`. |
| **Comparación** | Diferencias entre la vuelta REF (A) y la vuelta B. |
| **Curvas** | Curvas detectadas en la pista, tiempos, tracción y diferencias A/B por curva. |

En **Vueltas**, las vueltas válidas del jugador aparecen primero en orden de
replay. Las de otros autos se ordenan de más rápida a más lenta. El botón global
selecciona todas las vueltas válidas o deja solo la REF visible.

## Formatos compatibles

- **Replay:** `.acreplay`, versión 16. Otras versiones no están soportadas.
- **Pista:** `fast_lane.ai` de Assetto Corsa. Es obligatorio para analizar y
  comparar las vueltas.

Los detalles de los campos y sus offsets están documentados en
[`doc/FormatoTelemetria.md`](doc/FormatoTelemetria.md).

## Compilar y verificar

Desde la raíz del repositorio:

```powershell
cargo test --workspace
cargo build -p ac-telemetry-lab
```

Para compilar la aplicación de desarrollo, Tauri embebe los archivos de
`front/`. Para generar el instalador Windows NSIS desde un checkout limpio:

```powershell
cd src-tauri
npm ci
npx tauri build --bundles nsis
```

El instalador `.exe` se genera en `target\release\bundle\nsis\`. La configuración
de empaquetado está en `src-tauri/tauri.conf.json`; la versión debe coincidir
con la de `src-tauri/Cargo.toml`.

## Distribución e instalación

Las versiones se publican manualmente en
[GitHub Releases](https://github.com/matifl3/Telemetria/releases). Para instalar,
descarga el `.exe` de la versión elegida y ejecútalo. Para actualizar, descarga
y ejecuta el instalador de la nueva versión sobre la anterior. También puedes
desinstalarla desde **Configuración de Windows → Aplicaciones**.

Antes de publicar una versión:

1. Actualiza la versión semántica en `src-tauri/tauri.conf.json` y
   `src-tauri/Cargo.toml`; verifica que `Cargo.lock` quede sincronizado.
2. Ejecuta las pruebas y genera el instalador con el comando indicado arriba.
3. Crea y sube un tag que coincida con la versión, por ejemplo `v0.2.1`.
4. Crea una release de GitHub desde ese tag, añade notas breves de cambios y
   adjunta el instalador `.exe` de `target\release\bundle\nsis\`.
5. Prueba la descarga e instalación del archivo publicado.

El instalador no tiene firma Authenticode configurada. Windows puede mostrar una
advertencia de seguridad al ejecutarlo. No hay actualizaciones automáticas: para
recibir una versión nueva hay que descargarla de GitHub Releases e instalarla
manualmente. La aplicación tampoco guarda replays ni análisis al cerrarse.

El proyecto no tiene lint, pruebas automatizadas de interfaz ni CI. Las pruebas
de Rust están en `core/tests/` y `src-tauri/tests/`.

## Estructura del proyecto

```text
core/       Parser, modelo, análisis y pruebas Rust; no depende de Tauri
src-tauri/  Ventana, comandos y estado en memoria de Tauri
front/      Interfaz HTML, CSS y JavaScript; uPlot vendorizado
doc/        Especificaciones y catálogo de gráficos
spec/       Planes y requisitos de funcionalidades
visualizador/  Versión web anterior, solo referencia histórica
```

La lógica de parseo y análisis vive en `core/`; la interfaz recibe DTOs a través
de los comandos de Tauri. La aplicación no persiste datos en disco.

## Documentación

- [`doc/FormatoTelemetria.md`](doc/FormatoTelemetria.md): formato del replay v16
  y de `fast_lane.ai`.
- [`doc/constitucion.md`](doc/constitucion.md): principios del proyecto.
- [`doc/PLAN_CURVAS.md`](doc/PLAN_CURVAS.md): detección y calibración de curvas.
- [`doc/Catalogo_Graficos.md`](doc/Catalogo_Graficos.md): gráficos de la app.
- [`spec/migracion-tauri-rust/`](spec/migracion-tauri-rust/): especificación de
  la versión Tauri + Rust.
- [`spec/pestana-vueltas/`](spec/pestana-vueltas/): diseño y tareas de la
  pestaña Vueltas.
- [`spec/distribucion/tareas.md`](spec/distribucion/tareas.md): primera
  distribución para Windows mediante instalador NSIS y GitHub Releases.
