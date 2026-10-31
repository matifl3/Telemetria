# Tareas post-migración — Plan B: semianchos por punto

Trabajo **diferido**. No implementar hasta cerrar la migración Tauri + Rust
(fases 0–13 de `spec/migracion-tauri-rust/tareas.md`).

Origen: discusión sobre `core/src/pista.rs::leer_semiancho`, que hoy lee el
bloque opcional de 72 B pero colapsa todo a un único semiancho constante.

---

## 1. Contexto

`fast_lane.ai` guarda la **línea de carrera** (posiciones del CoG del auto), no
el eje geométrico de la pista. Por eso el archivo trae, punto a punto, los
límites izquierdo y derecho.

Comportamiento actual (v1 y `core`):

- Se toma `(izq + der) / 2` de cada punto válido, se calcula la mediana y ese
  único valor se repite en `wl` y `wr` para toda la pista.
- Es la decisión de v1 y está documentada en `doc/FormatoTelemetria.md` §3.3.

Problema: una banda de ancho constante alrededor de la línea de carrera no
coincide con el asfalto real. En curva la línea va pegada al interior, así que
la banda pinta pista donde hay pasto/bordillo adentro y no llega al borde
externo. Además se pierde la asimetría real (`izq ≠ der`) en curvas, entradas
de boxes y rectas anchas.

Plan B: conservar los semianchos **por punto y por lado**, con la constante
solo como *fallback*.

---

## 2. Bloqueante previo: revisar el `fast_lane.ai` real

Sin esto no se implementa nada. El spline del servidor puede ser el original de
Kunos, uno regenerado por la comunidad, una línea de tráfico o uno optimizado
con `FastLaneUtils --optimize`; cada caso puede traer o no el bloque de 72 B.

Checklist (manual, con el archivo exacto que usa el servidor):

- [ ] Obtener el `fast_lane.ai` del **layout y versión** que corre el servidor.
- [ ] Registrar `n` (segundo `i32` del encabezado), tamaño del archivo y si se
      cumple `tamaño - 16 - n×20 >= n×72`.
- [ ] Porcentaje de registros con ambos semianchos válidos en `(0, 200)` m, con
      uno solo válido y con ninguno.
- [ ] Estadística de `izq`, `der` e `izq + der`: mínimo, p5, mediana, p95, máximo.
- [ ] Variación a lo largo de `s`: saltos entre puntos consecutivos y presencia
      de ceros, `NaN` o valores repetidos.
- [ ] Plausibilidad contra el ancho real de la pista (¿`izq + der` coincide con
      el asfalto medido?).
- [ ] Descartar que sea una línea de tráfico desplazada al 25 %/75 % del ancho.
- [ ] Confirmar si el archivo fue optimizado o generado por AssettoServer,
      `FastLaneUtils` o TreCorsa.

Criterio de decisión:

- **Bloque completo y valores plausibles** → implementar PM01–PM06.
- **Bloque ausente, en ceros o no plausible** → no implementar. Mantener el
  ancho constante, documentar el hallazgo en §3.3 y cerrar este archivo.

---

## 3. Tareas (solo si el bloqueante da luz verde)

- [ ] **PM01 · Modelo por punto** — `Pista.wl`/`wr` guardan el valor de cada
      punto, sin aplanar. `ancho_m()` pasa a ser derivado (mediana de `wl+wr`)
      para quien necesite un número único. *Hecho cuando:* un fixture con
      anchos distintos por punto conserva la diferencia.
- [ ] **PM02 · Validez independiente por lado** — cada lado se valida por
      separado (finito y en `(0, 200)` m). *Hecho cuando:* un punto con solo un
      lado válido conserva el lado bueno.
- [ ] **PM03 · Fallback por punto y global** — lado inválido → vecino más
      cercano; sin ningún válido → mediana global; sin bloque → 6 m. *Hecho
      cuando:* tests cubren punto aislado inválido, bloque parcial y bloque
      ausente.
- [ ] **PM04 · Banda asimétrica** — mapa y cualquier consumidor usan
      `wl[i]`/`wr[i]` (el render de v1 ya lo hace). *Hecho cuando:* la banda
      respeta lados distintos en un fixture asimétrico.
- [ ] **PM05 · Ruido** — decidir si hace falta suavizado **solo de dibujo**
      (nunca del dato). *Hecho cuando:* queda documentado y, si aplica,
      implementado con test de que el dato crudo no cambia.
- [ ] **PM06 · Documentación** — `doc/FormatoTelemetria.md` §3.3 (quitar "ancho
      constante"), `spec/migracion-tauri-rust/plan.md` (struct `Pista`),
      `tareas.md` (T25 y T79: la banda deja de ser simétrica), `MEMORY.md`.
      *Hecho cuando:* doc y código dicen lo mismo (principio 2).

## 4. Fuera de alcance

- La alineación por `s` sigue sobre la línea de carrera: no se cambia.
- La detección de curvas y sus umbrales no dependen del ancho: no se tocan.
- No se agregan dependencias ni pasos de build.

## 5. Riesgos

- Semianchos ruidosos o sintéticos: peor banda que la constante. Por eso el
  bloqueante es obligatorio.
- Splines optimizados sin bloque: se cae siempre al fallback y el plan B no
  aporta nada; hay que aceptarlo y no forzarlo.
- Costo real bajo: el render de v1 ya consume `wl[i]`/`wr[i]` por punto.
