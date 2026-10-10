"""Segmentacion de frames en vueltas.

Regla de segmentacion: se corta al cambiar el numero de vuelta (`current_lap`).

Regla de validez (ver doc/Arquitectura.md, seccion 6): una vuelta NO cuenta si

- es de salida/largada (outlap o vuelta de formacion) o de entrada a pits:
  primera o ultima vuelta Y velocidad media (distancia/duracion) menor al 75%
  de la velocidad de referencia (maxima de las vueltas largas >= 90% de la
  distancia mediana); o
- esta cortada o incompleta: recorrido menor al 90% de la distancia mediana
  (cubre cortes de pista y grabaciones que empiezan/terminan a mitad de vuelta).
"""

from __future__ import annotations

import math
from typing import Iterable, List

from ..lector.modelos import Frame, Sesion, Vuelta

# Fraccion de la distancia mediana por debajo de la cual una vuelta es cortada.
_DISTANCIA_CORTADA = 0.90
# Fraccion de la velocidad de referencia por debajo de la cual un borde lento
# (primera o ultima vuelta) se descarta como salida o entrada.
_VELOCIDAD_BORDE_LENTA = 0.75


def _agrupar_por_vuelta(frames: List[Frame]) -> List[tuple[int, List[Frame]]]:
    grupos: List[tuple[int, List[Frame]]] = []
    numero_actual = None
    actual: List[Frame] = []
    for frame in frames:
        if numero_actual is None:
            numero_actual = frame.numero_vuelta
        if frame.numero_vuelta != numero_actual:
            grupos.append((numero_actual, actual))
            numero_actual = frame.numero_vuelta
            actual = []
        actual.append(frame)
    if actual:
        grupos.append((numero_actual, actual))
    return grupos


def _tiempo_vuelta_ms(grupo: List[Frame]) -> int:
    ultimo = grupo[-1]
    if ultimo.tiempo_vuelta_ms > 0:
        return ultimo.tiempo_vuelta_ms
    if ultimo.ultima_vuelta_ms > 0:
        return ultimo.ultima_vuelta_ms
    return int((ultimo.t - grupo[0].t) * 1000)


def _distancia_recorrida(grupo: List[Frame]) -> float:
    """Longitud del recorrido (metros) sobre el plano horizontal x-z."""
    total = 0.0
    previo: Frame | None = None
    for frame in grupo:
        if previo is not None:
            total += math.hypot(
                frame.posicion[0] - previo.posicion[0],
                frame.posicion[2] - previo.posicion[2],
            )
        previo = frame
    return total


def _velocidad_media(grupo: List[Frame], dist: float) -> float:
    """Velocidad media de la vuelta = distancia (m) / duracion (s) -> m/s.

    Se calcula desde posiciones/tiempos (no desde el campo `velocidad` del
    frame), que en tramos lentos o al cerrarse el replay puede quedar desfajado.
    Al usarse solo en cocientes contra un umbral, las unidades dan igual.
    """
    duracion = grupo[-1].t - grupo[0].t
    return dist / duracion if duracion > 0 else 0.0


def _mediana(valores: Iterable[float]) -> float:
    ordenados = sorted(valores)
    return ordenados[len(ordenados) // 2] if ordenados else 0.0


def _motivo_vuelta(
    dist: float,
    vel_media: float,
    indice: int,
    total: int,
    ref_dist: float,
    ref_vel: float,
) -> str:
    """Motivo de invalidez o "" si la vuelta cuenta.

    `ref_dist` es la distancia mediana; `ref_vel` la velocidad de referencia
    (maxima de las velocidades medias de las vueltas largas).
    """
    cortada = ref_dist > 0 and dist < _DISTANCIA_CORTADA * ref_dist
    borde = indice == 0 or indice == total - 1
    lenta = borde and ref_vel > 0 and vel_media < _VELOCIDAD_BORDE_LENTA * ref_vel
    if lenta:
        return "salida" if indice == 0 else "entrada"
    if cortada:
        return "incompleta" if borde else "cortada"
    return ""


def _marcar_rapidas(vueltas: List[Vuelta], pct: float) -> None:
    """Marca `es_rapida` en las vueltas validas dentro del `pct`% del mejor tiempo."""
    validas = [v for v in vueltas if v.es_valida and v.tiempo_ms > 0]
    if not validas:
        return
    mejor = min(v.tiempo_ms for v in validas)
    umbral = mejor * pct / 100.0
    for vuelta in vueltas:
        vuelta.es_rapida = vuelta.es_valida and 0 < vuelta.tiempo_ms <= umbral


def segmentar(sesion: Sesion, auto_indice: int = 0, pct: float = 103.0) -> List[Vuelta]:
    """Devuelve las vueltas del auto indicado, con validez y marca de rapidas."""
    if not sesion.autos or auto_indice >= len(sesion.autos):
        return []

    grupos = _agrupar_por_vuelta(sesion.autos[auto_indice].frames)
    total = len(grupos)
    if total == 0:
        return []

    info: List[tuple[float, float]] = []
    for _numero, grupo in grupos:
        dist = _distancia_recorrida(grupo)
        info.append((dist, _velocidad_media(grupo, dist)))
    ref_dist = _mediana(dist for dist, _ in info)
    largas = [
        vel
        for dist, vel in info
        if ref_dist > 0 and dist >= _DISTANCIA_CORTADA * ref_dist
    ]
    ref_vel = max(largas) if largas else 0.0

    vueltas: List[Vuelta] = []
    for indice, ((numero, grupo), (dist, vel_media)) in enumerate(zip(grupos, info)):
        motivo = _motivo_vuelta(dist, vel_media, indice, total, ref_dist, ref_vel)
        vueltas.append(
            Vuelta(
                numero=numero,
                t_inicio=grupo[0].t,
                t_fin=grupo[-1].t,
                tiempo_ms=_tiempo_vuelta_ms(grupo),
                es_valida=not bool(motivo),
                motivo_invalida=motivo,
                frames=grupo,
            )
        )
    _marcar_rapidas(vueltas, pct)
    return vueltas