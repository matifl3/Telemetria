# Plan: detección y análisis de curvas desde el `.ai`

Estado: **propuesto** (pendiente de implementación)
Ámbito: `visualizador/app.js`, `visualizador/index.html`
Base: pista de referencia `fast_lane.ai` (Monza noDRS, `lfmv2`)

## Objetivo
Detectar las curvas de la pista a partir de la línea central del `.ai` y usarlas para:
- panel/tab **"Curvas"** con métricas por curva (por vuelta),
- **pintar/etiquetar el mapa** por curva (`C1..Cn`),
- **comparación por curva** entre dos vueltas (delta de tiempo y de velocidad mínima).

Decisiones acordadas: cada arco por separado (sin unir chicanes); nombres automáticos `C1..Cn`; incluir curvas rápidas con segundo umbral.

---

## 1. Detección (núcleo, geometría del `.ai`)

Nueva función `detectarCurvas(ai)` en `visualizador/app.js`, junto a `parsearAi`.

- Entrada: línea central `nx,nz` y distancia acumulada `s` (ya vienen del `.ai`: 3750 pts, paso ≈1,54 m, largo ≈5757 m).
- Remuestreo a paso uniforme ~1,5 m; suavizado de `x,z` (media móvil ~7 pts).
- Rumbo `θ(s) = atan2(dz, dx)` desenrollado (`θ[i]` sin saltos de 2π).
- Curvatura `κ(s) = dθ/ds`, suavizada (ventana ~9). Radio `R = 1/|κ|`.
- Umbrales con histéresis para evitar parpadeo:
  - `R_CURVA ≈ 300 m` (entra a "curva")
  - `R_RECTA ≈ 1200 m` (sale de "curva")
  - descartar tramos menores a ~20 m.
- **Cada arco por separado** (no se unen chicanes/complejos).
- Signo de `κ` → izquierda/derecha.
- Nombre automático `C1..Cn` por orden de aparición.

**Salida** (por curva): `{ i0, i1, apex, sEntry, sApex, sExit, largo, rmin, dir, dTheta, nombre }`.

**Validación ya hecha contra Monza** (11 curvas reales: 7 der / 4 izq), umbral `R<300`:
- `899–947` (R22, +) y `950–1008` (R24, −) → **Variante del Rettifilo** (chicane R-L).
- `2100–2157` (R34, −) y `2161–2219` (R40, +) → **Variante della Roggia** (chicane).
- `2457–2632` (R81, +) → **Lesmo 1**; `2818–2921` (R65, +) → **Lesmo 2**.
- `3894–3976` (R66, −), `3989–4073` (R102, +), `4099–4184` (R115, −) → **Variante Ascari** (L-R-L).
- `5071–5407` (R80, +) → **Parabólica**.
- `~1288–1464` (R~270) → **Curva Grande** (requiere `R<300`; se parte en 2 arcos, aceptable por "cada arco separado").

Nota: el campo `[4]` del `AiPointExtra` correlaciona con la curvatura calculada (r ≈ −0,857) pero su escala no es `1/R`; se usa solo como chequeo opcional, no como fuente.

### Constantes a exponer (calibración sin tocar lógica)
`R_CURVA`, `R_RECTA`, largo mínimo, ventana de suavizado.

### 2. Mapear curvas al eje de distancia común
Riesgo clave: el `.ai` mide ~5757 m y **no comparte origen de distancia con las vueltas**.
- Construir mapa `s_ai → d_grid` proyectando cada punto del `.ai` al punto más cercano de la línea central de la vuelta de referencia (`lapRef().grid.x/z`), búsqueda coarse→fine.
- Guardar `state.curvas` ya expresado en distancia de `state.grid`, para reutilizar todo el andamiaje existente (sectores, charts, mapas).
- Recalcular el mapa si cambia la vuelta de referencia.
- Se computa una vez al cargar el `.ai` en `cargarPistaAi`, después de `parsearAi`.

### 3. Métricas por curva (por vuelta, sobre `l.grid`)
Para cada curva y cada vuelta válida:
- velocidad mínima (`vMin`), v en entrada/apex/salida.
- tiempo dentro de la curva (`time[sExit] − time[sEntry]`).
- punto de frenada (primer `brake` > umbral antes de la entrada) y de reaceleración (`throttle` > umbral a la salida).
- `rmin`, longitud, Δ rumbo (`dTheta`).

### 4. UI
- **Nuevo tab "Curvas"**:
  - botón en `index.html` (nav de tabs, ~línea 85–90) + panel `id="panel-curvas"`.
  - rama nueva en `renderTabActiva` (`app.js:744`); `activarTab` ya es genérico por `data-tab`.
  - tabla de métricas por curva (patrón `tabla-resumen`, `app.js:1459+`).
  - gráfico de barras "tiempo por curva" (patrón `drawSectores`, `app.js:1131`).
- **Mapa coloreado/etiquetado por curva**: modo nuevo en `drawMapaSectores` / `construirTrazada` reutilizando `colorMap`, con etiquetas `C1..Cn` sobre el apex.
- **Comparación por curva** entre vuelta A y B: delta de tiempo y delta de `vMin` por curva (patrón A/B de `app.js:1532`).

### 5. Verificación
- Extender `ai_smoke.js`: `detectarCurvas` → nº de curvas esperado, presencia de Curva Grande, Ascari con signos −,+,−, intervalos crecientes; mapeo `s_ai→d_grid` monótono y sin saltos.
- `node --check` + smokes node existentes (sin automatización de navegador).

### Riesgos / decisiones abiertas
1. **Mapeo geométrico `s_ai → grid`** es lo más delicado (secciones casi paralelas). Propuesta: proyección al punto más cercano de la vuelta de referencia.
2. **Curva Grande como 2 arcos** (por "cada arco separado"). Alternativa: unir arcos del mismo signo con recta corta entre medio.

### Archivos afectados
- `visualizador/app.js`: `detectarCurvas` (nueva), `parsearAi`, `cargarPistaAi`, `state.curvas`, `renderTabActiva`, `drawMapaSectores`/`construirTrazada`, comparación.
- `visualizador/index.html`: tab + panel "Curvas".
- `ai_smoke.js` (temp de verificación): aserciones de `detectarCurvas`.
