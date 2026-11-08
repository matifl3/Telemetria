# Tareas — Primera distribución para Windows

## Objetivo

Preparar un instalador Windows de AC Telemetry Lab y publicar versiones
descargables en GitHub Releases. La actualización será manual: quien use la app
descargará y ejecutará el instalador de la nueva versión. El actualizador
integrado de Tauri queda para una tarea posterior.

## Decisiones

- Plataforma inicial: Windows x64.
- Formato: instalador NSIS (`.exe`).
- Canal de publicación: GitHub Releases del repositorio.
- Las versiones se construyen y publican manualmente desde un entorno Windows.
- No se guardan replays ni análisis entre sesiones; cerrar la app descarta los
  datos cargados.

## Alcance y reglas

- Habilitar el empaquetado Tauri para generar el instalador NSIS.
- Mantener los assets de `front/` embebidos en la aplicación; no agregar servidor
  ni depender de una conexión a Internet para analizar.
- Documentar las herramientas necesarias para compilar y el comando exacto para
  producir el instalador desde un checkout limpio.
- Definir un flujo manual de release: versión coherente en la configuración y
  manifiestos, etiqueta/tag, notas de versión y adjuntar el instalador a GitHub
  Releases.
- Documentar cómo descargar, instalar y reemplazar una versión instalada por
  una más reciente.
- Comprobar la instalación y apertura en un Windows sin el entorno de desarrollo
  del proyecto, además de carga del replay y `fast_lane.ai`.
- Revisar si la distribución requiere firma Authenticode. Si no hay certificado
  disponible, indicar claramente que el instalador no está firmado y que Windows
  podría mostrar una advertencia; no adquirir certificados sin aprobación.
- No guardar instaladores ni otros artefactos generados en el repositorio.
- No commitear claves, certificados, contraseñas ni secretos.

## Tareas

- [ ] **DIST01 · Habilitar el bundle NSIS** — *Hecho cuando:* la configuración
  de Tauri genera un instalador NSIS x64 desde el proyecto y conserva el nombre,
  identificador, icono y versión de la app; el empaquetado no altera el modo de
  desarrollo.
- [ ] **DIST02 · Verificar la compilación reproducible** — *Hecho cuando:* se
  documentan requisitos y comando, y el instalador puede generarse desde un
  checkout limpio de Windows con las herramientas declaradas. Se confirma qué
  runtime de Windows necesita el usuario final.
- [ ] **DIST03 · Validar instalación y uso** — *Hecho cuando:* en un Windows
  sin toolchain de desarrollo se instala y abre la app, y se comprueba la carga
  de un replay v16 y su `fast_lane.ai`; también se valida instalar una versión
  posterior sobre la anterior y desinstalarla.
- [ ] **DIST04 · Preparar publicación manual** — *Hecho cuando:* queda definido
  el procedimiento para actualizar la versión, crear el tag y publicar notas
  junto con el `.exe` en GitHub Releases; una persona sin Rust ni Node puede
  descargar el instalador desde la release.
- [ ] **DIST05 · Documentar distribución y límites** — *Hecho cuando:* el
  README explica requisitos, descarga, instalación, actualización manual,
  posibles advertencias de firma y que no existe actualización automática ni
  persistencia de análisis.

## Fuera de alcance

- Plugin `tauri-plugin-updater`, endpoint/JSON de actualizaciones y avisos o
  instalación desde dentro de la app.
- Generar o configurar claves de firma del updater. Cuando se implemente esa
  fase, la clave privada deberá permanecer fuera del repositorio y respaldarse
  de forma segura.
- Releases automáticas mediante CI, publicación para macOS/Linux o migración de
  la versión web histórica `visualizador/`.

## Verificación

- `cargo test --workspace`.
- Generar el bundle con la CLI de Tauri en Windows y comprobar la salida NSIS.
- Prueba manual de instalación, apertura, carga de archivos, actualización
  instalando una release posterior y desinstalación.
- Revisar que el repositorio no contenga instaladores ni secretos.
