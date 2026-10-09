# Manual de usuario

Guía de uso de **Telemetría AC**, tanto del script (línea de comandos) como de
la aplicación web. El documento describe el flujo previsto; se irá completando a
medida que se implemente cada fase.

---

## 1. Requisitos previos

- **Assetto Corsa** instalado (para generar los archivos de telemetría).
- **Python 3.10 o superior** (core, CLI y web usan el mismo lenguaje).
- **Flask** (solo para la aplicación web).
- Windows (donde el juego genera los archivos).

---

## 2. Generar el archivo de telemetría en Assetto Corsa

### Opción A — Replay `.acreplay` (recomendado)

1. Entrá a una sesión y completá una o más vueltas.
2. Al salir de la sesión, cuando el juego pregunte, elegí **Save Replay**.
3. El archivo queda en `Documents\Assetto Corsa\replay\`.

### Opción B — Export AiM `.nkt`

1. Verificá que la telemetría esté habilitada en
   `assettocorsa\system\cfg\assetto_corsa.ini` (`[TELEMETRY]`).
2. Corré la sesión.
3. El archivo queda en `Documents\Assetto Corsa\aim\telemetry_dump.nkt`.
4. **Copiá/renombrá** ese archivo antes de otra sesión (se sobreescribe).

> Nota: el `.nkt` es propietario. Si la app todavía no lo lee, importalo desde
> *AiM Race Studio* y exportá un CSV (ver `doc/FormatoTelemetria.md`, sección 3).

---

## 3. Uso del script (fase 1)

El CLI ya está implementado. Interfaz:

```bash
python -m telemetria <archivo> --out <carpeta>
```

Ejemplo:

```bash
python -m telemetria "Paquetes de telemetria/monza.acreplay" --out salida/
```

Resultado: un CSV por vuelta en la carpeta `salida/`.

Salida esperada por consola:

```
Archivo: monza.acreplay (12.4 MB)
Formato: acreplay v16
Pista:   monza
Auto:    ferrari_458_gt2
Piloto:  Matias
Vueltas: 5  (4 válidas)
 -> salida/monza_vuelta_02.csv
 -> salida/monza_vuelta_03.csv
 ...
```

---

## 4. Uso de la aplicación web (fase 3, Flask)

La web importa el core Python para generar los CSV (no hay que arrancar nada
aparte).

1. Instalá las dependencias y ejecutá la web:

   ```bash
   pip install -r web/requirements.txt
   python web/app.py
   ```

2. Abrí el navegador en `http://localhost:5000`.
3. En la página principal, **subí** el archivo `.acreplay` (o `.nkt`).
4. La app muestra la **lista de vueltas** con número, tiempo y validez.
5. Hacé clic en **Descargar CSV** para una vuelta, o **Descargar todas** (ZIP).
6. Opcional: eliminá la sesión para borrar los archivos temporales.

---

## 5. Qué contiene el CSV

Un archivo por vuelta. Columnas principales (nombres finales a definir):

| Columna | Descripción |
|---|---|
| `t` | Tiempo desde el inicio de la vuelta (s) |
| `speed` | Velocidad (km/h) |
| `rpm` | Revoluciones del motor |
| `gear` | Marcha |
| `gas` | Acelerador (0–100 %) |
| `brake` | Freno (0–100 %) |
| `steer` | Ángulo de dirección |
| `lap_time` | Tiempo de vuelta (ms) |
| `fuel` | Combustible |
| `boost` | Turbo/boost |
| `slip_angle_FL/FR/RL/RR` | Ángulo de deslizamiento por rueda |
| `slip_ratio_FL/FR/RL/RR` | Relación de deslizamiento por rueda |
| `load_FL/FR/RL/RR` | Carga por rueda |

---

## 6. Preguntas frecuentes

**¿Por qué no aparecen temperaturas de neumáticos?**
Porque el `.acreplay` no las guarda. Solo existen en captura en vivo
(shared memory / UDP), que está fuera del alcance actual.

**El juego dice que el replay es de otra versión.**
Solo se soporta `.acreplay` **versión 16**. Actualizá AC/CSP para regenerarlo.

**Se sobreescribió mi telemetría.**
Copiá siempre el `telemetry_dump.nkt` (o guardá el replay) antes de una nueva
sesión.

**El CSV no tiene las mismas columnas que otro archivo.**
Los frames extra de CSP (clutch, frenos, luces) solo están presentes si el
replay se grabó con CSP. Las columnas pueden variar según el archivo.

---

## 7. Resolución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Versión no soportada" | `.acreplay` ≠ v16 | Regenerar con AC/CSP actualizado |
| "Archivo truncado" | Copia incompleta | Volver a copiar el archivo |
| No detecta vueltas | Sesión sin vueltas completas | Correr al menos una vuelta lanzada |
| Error al leer `.nkt` | Formato propietario | Exportar CSV desde Race Studio |
