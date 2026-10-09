"""Segmentacion de frames en vueltas.

Regla (a validar con datos reales): se corta al cambiar el numero de vuelta
(`current_lap`). La primera vuelta (salida) y la ultima (entrada) se marcan como
no validas. Ver doc/Arquitectura.md (seccion 6).
"""

from __future__ import annotations

from typing import List

from ..lector.modelos import Frame, Sesion, Vuelta


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
    """Devuelve las vueltas del auto indicado, con la marca de vueltas rapidas."""
    if not sesion.autos or auto_indice >= len(sesion.autos):
        return []

    grupos = _agrupar_por_vuelta(sesion.autos[auto_indice].frames)
    total = len(grupos)

    vueltas: List[Vuelta] = []
    for indice, (numero, grupo) in enumerate(grupos):
        vueltas.append(
            Vuelta(
                numero=numero,
                t_inicio=grupo[0].t,
                t_fin=grupo[-1].t,
                tiempo_ms=_tiempo_vuelta_ms(grupo),
                es_valida=not (indice == 0 or indice == total - 1),
                frames=grupo,
            )
        )
    _marcar_rapidas(vueltas, pct)
    return vueltas
