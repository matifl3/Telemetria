# Especificación: Migración AC Telemetry Lab a Tauri + Rust (v2)

## 1. Objetivo
Migrar el visualizador actual (`visualizador/`) a una aplicación de escritorio con **Tauri + Rust**, manteniendo **paridad funcional total** con la v1, respetando estrictamente `doc/constitucion.md` y el formato definido en `doc/FormatoTelemetria.md`.

Además, la v2 permite comparar vueltas de cualquier auto presente en el replay con las del auto del jugador, sin salir de la misma sesión de análisis.

## 2. Alcance
- **Paridad total:** Las 5 pestañas existentes: `Vuelta`, `Mapa`, `Conjunto`, `Comparación` y `Curvas`. Se deben mantener los ~30 gráficos implementados hoy.
- **Parser:** Únicamente `.acreplay` **versión 16**.
- **Pista:** Uso obligatorio de `fast_lane.ai` para entrar al análisis.
- **Carga de archivos:** Diálogo nativo de Tauri + arrastrar y soltar.
- **Multi-auto:** Se parsean todos los autos del replay. El auto del jugador (`current_recording_index`) es la referencia por defecto; sus vueltas se muestran seleccionadas al cargar. El usuario puede activar vueltas de otros autos y compararlas entre sí o contra las propias en `Vuelta`, `Mapa`, `Comparación` y `Curvas`. La pestaña `Conjunto` agrega solo las vueltas válidas del auto dueño de la REF.
- **Lógica separada:** Parseo, clasificación de vueltas, detección de curvas y cálculos en crate `core` sin dependencia de Tauri. La UI solo recibe datos ya calculados.
- **Sin persistencia:** Todo vive únicamente en memoria durante la sesión. Nada se guarda en disco.

## 3. Requisitos Funcionales (EARS)

### Carga y validación de replay
- **RF-001** *When* el usuario carga un archivo `.acreplay`, *the system shall* validar que `version == 16`. *If* `version != 16`, *the system shall* rechazar el archivo mostrando en español el nombre del archivo y el motivo, sin modificar el estado cargado previamente.  
  **Por qué:** Solo se soporta la versión 16 tal como está especificado en `doc/FormatoTelemetria.md` y en el comportamiento actual.

- **RF-002** *When* se parsea el encabezado de un `.acreplay` válido, *the system shall* leer todos los autos del archivo. *The system shall* determinar el auto del jugador usando `current_recording_index`; *if* ese índice es inválido o el auto no produce vueltas analizables, *the system shall* usar el primer auto con vueltas analizables como auto de referencia por defecto.  
  **Por qué:** El jugador sigue siendo la referencia natural, pero ya no es el único auto analizable.

- **RF-003** *If* ningún auto del replay produce vueltas analizables (0 frames utilizables o todas descartadas por `clasificarVueltas`), *the system shall* mostrar el mensaje en español `"El replay no contiene vueltas analizables"`, no permitir entrar al análisis y conservar el estado cargado previamente. *If* solo el auto del jugador no tiene vueltas pero otro auto sí, *the system shall* cargar el replay, usar el primer auto con vueltas como referencia y avisar en español qué auto se usó.  
  **Por qué:** El replay sigue siendo útil si otro auto tiene datos; solo se rechaza cuando no hay nada que analizar.

- **RF-004** *When* se extraen las vueltas de cada auto, *the system shall* aplicar la clasificación de v1 (salida/largada, entrada a *pits*, recorrido < 90% de la distancia mediana) de forma independiente por auto, calculando medianas y bordes solo con las vueltas de ese auto.  
  **Por qué:** Mezclar autos en la mediana y en los bordes produce falsos salida/entrada/cortada.

- **RF-005** *When* el replay contiene varios autos, *the system shall* disponer de las vueltas de todos ellos. Cada vuelta *shall* llevar la etiqueta visible `piloto · car_id · V{nVuelta}`. Las vueltas no válidas *shall* mostrarse con su motivo y no ser seleccionables.  
  **Por qué:** Identifica el origen de cada vuelta y evita comparar contra datos que la propia app descartó.

### Carga y validación de pista
- **RF-006** *When* el usuario carga `fast_lane.ai`, *the system shall* validarlo como pista válida para el contexto de análisis. *If* el archivo es inválido o no es utilizable para geometría/detección de curvas, *the system shall* rechazarlo mostrando un mensaje claro en español, bloquear el acceso al análisis si no existe ninguna pista válida cargada y, *if* ya existe una pista válida cargada, conservarla sin modificarla.  
  **Por qué:** La pista es obligatoria (RF-007) y debe seguir siendo una condición dura para entrar al análisis, igual que en v1.

- **RF-007** *If* no hay un archivo `fast_lane.ai` válido cargado, *the system shall* impedir la entrada al análisis. *The system shall* mostrar el motivo `FALTA_PISTA`/equivalente en español hasta que se cargue una pista válida.  
  **Por qué:** Sin banda de pista no existe detección de curvas, no existe mapa fiable ni el resto del flujo de análisis definido en v1.

### Interfaz de carga y comportamiento general
- **RF-008** *The system shall* permitir cargar `.acreplay` y `fast_lane.ai` mediante diálogo nativo de Tauri y mediante *arrastrar y soltar* en la ventana.  
  **Por qué:** Define el método de carga solicitado para la v2.

- **RF-009** *If* la carga de cualquier archivo falla por formato/lectura/truncado/corrupción, *the system shall* rechazarlo, mostrar un mensaje en español con nombre del archivo y motivo, no aplicar cambios parciales al estado en memoria y conservar el último estado válido cargado.  
  **Por qué:** Un archivo inválido no debe "vaciar" la sesión; el usuario debe poder corregir sin perder lo ya cargado.

- **RF-010** *The system shall* mantener **todos los datos únicamente en memoria durante la sesión**. *The system shall not* escribir ajustes, listas de archivos, rutas recientes ni ningún otro dato a disco.  
  **Por qué:** Obligatorio por `doc/constitucion.md` (principio 5) y por `AGENTS.md`/`MEMORY.md` (regla dura "sin persistencia").

- **RF-011** *The system shall* exponer exactamente las mismas capacidades funcionales que v1: detección de curvas desde `fast_lane.ai`, tracción por curva con marcadores de *slip*, delta A/B por curva, mapa con trazada, comparación entre vueltas, conjunto y vuelta.  
  **Por qué:** Requisito de paridad total.

- **RF-012** *The system shall* implementar la lógica en crate `core` testeable sin Tauri. *The system shall* leer los offsets/campos únicamente desde lo definido en `doc/FormatoTelemetria.md`. *If* hubiera discrepancia entre código y spec, *the system shall* corregir el spec en el mismo cambio.  
  **Por qué:** Principios 2 y 3 de `doc/constitucion.md`.

### Comparación entre autos
- **RF-013** *When* termina la carga de un replay, *the system shall* seleccionar por defecto solo las vueltas válidas del auto de referencia (jugador o *fallback*). Las vueltas de otros autos *shall* quedar listadas pero desmarcadas.  
  **Por qué:** Evita saturar los gráficos y mapas al abrir replays con muchos autos.

- **RF-014** *The system shall* permitir activar y desactivar vueltas de cualquier auto desde el selector de vueltas. Las vueltas activas de distintos autos *shall* poder convivir en `Vuelta`, `Mapa`, `Comparación` y `Curvas`. La pestaña `Conjunto` *shall* agregar solo las vueltas válidas del auto dueño de la REF, sin mezclar autos.  
  **Por qué:** Es el mecanismo concreto para comparar lo propio con otro auto; las estadísticas de consistencia, fuel y vuelta teórica solo tienen sentido dentro de un mismo auto.

- **RF-015** *When* el usuario elige las vueltas A y B, *the system shall* permitir que A y B pertenezcan a autos distintos. El delta acumulado, el delta por curva y los gráficos comparativos *shall* alinearse por **arco de pista** (`s` sobre la línea central de `fast_lane.ai`), no por distancia recorrida por cada vuelta.  
  **Por qué:** El arco de pista identifica el mismo punto físico para dos trazadas distintas; la distancia recorrida sesga la comparación entre autos.

- **RF-016** *If* un auto no tiene vueltas válidas, *the system shall* mantener sus vueltas visibles con el motivo y no permitir seleccionarlas.  
  **Por qué:** Evita comparaciones contra datos que la propia app descartó.

## 4. Fuera de alcance
- **FO-001** Persistencia: `localStorage`, `IndexedDB`, archivos de configuración, historial/rutas recientes o auto-carga.
- **FO-002** Captura en vivo: *shared memory*, UDP, integraciones con apps de terceros.
- **FO-003** Soporte a otros formatos de telemetría: `.nkt` (AiM), `.ct`, `.ld` (MoTeC), JSON/CSV de resultados.
- **FO-004** Sincronización por reloj absoluto de sesión o por tiempo real entre autos. La alineación es por arco de pista (`s` sobre `fast_lane.ai`).
- **FO-004b** Comparación simultánea de más de dos vueltas en el delta acumulado; el delta sigue siendo A/B (las superposiciones de gráficos sí admiten más).
- **FO-005** Tolerancia a versiones distintas de `.acreplay`. Cualquier versión != 16 es rechazada (RF-001).
- **FO-006** Permitir entrar al análisis sin `fast_lane.ai`. Queda bloqueado (RF-007).
- **FO-007** Parseo "lo que se pueda" ante archivos truncados/corruptos. Se rechaza y se conserva estado previo (RF-009).
- **FO-008** Migración a frameworks de UI pesados, CLI de build propio o adición de crates sin justificación clara.
- **FO-009** Internacionalización. Toda la UI, mensajes, logs y nombres de archivo deben permanecer en **español** (salvo strings originales del formato `.acreplay` o `CSP`).

## 5. Criterios de finalización
- [ ] **Arquitectura:** `core` compila y es testeable sin Tauri. Frontend HTML/JS plano con Tauri bindings mínimos.
- [ ] **Parser v16:** Cumple RF-001/RF-002/RF-004/RF-005 usando `doc/FormatoTelemetria.md` como fuente, incluyendo todos los autos y la selección de referencia con `current_recording_index` y *fallback*.
- [ ] **Vueltas inválidas:** RF-003 implementado (rechazo solo si ningún auto tiene vueltas; si el jugador no tiene, se usa el primer auto con vueltas y se avisa).
- [ ] **Pista:** RF-006/RF-007 obligatorios (rechazo con mensaje, bloqueo sin pista válida).
- [ ] **Carga:** RF-008/RF-009 con diálogo nativo + *drag & drop* y política "rechazar y conservar lo anterior".
- [ ] **Multi-auto:** RF-013/RF-014/RF-015/RF-016 implementados: vueltas de otros autos listadas, activables y comparables en `Vuelta`, `Mapa`, `Comparación` y `Curvas` (`Conjunto` solo con el auto de la REF), con A/B de autos distintos.
- [ ] **Sin persistencia:** Verificado RF-010 (sin escrituras a disco).
- [ ] **Paridad:** Las 5 pestañas (`Vuelta`, `Mapa`, `Conjunto`, `Comparación`, `Curvas`) y funcionalidades críticas (detección de curvas, *slip*, delta A/B) presentes.
- [ ] **Tests:** `cargo test` en verde con tests de regresión para fixes de lógica (principio 4). Al menos cubiertos: rechazo v!=16, selección por `current_recording_index` con *fallback*, jugador sin vueltas pero otro auto con vueltas, clasificación independiente por auto, A/B de autos distintos, auto sin vueltas válidas no seleccionable, pista inválida/faltante.
- [ ] **Calidad:** Sin escrituras a disco, sin dependencias injustificadas, todo en español, sin persistencia entre ejecuciones.
