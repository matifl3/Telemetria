"""Exportacion de cada vuelta a un CSV (stdlib `csv`).

Se exporta la mayor cantidad posible de canales por frame: estado del auto,
vector de posicion/velocidad/rotacion, danos, tiempos y las cuatro ruedas
(posicion, rotacion, velocidad angular, slips, carga y suciedad). Ademas se
calculan derivadas del movimiento (aceleracion en ejes del mundo) por vuelta.
"""

from __future__ import annotations

import csv
import os
from typing import List, Sequence

from ..lector.modelos import Frame, POSICIONES_RUEDA, Sesion, Vuelta

COLUMNAS_BASE = [
    "t",
    "velocidad_kmh",
    "acc_x",
    "acc_y",
    "acc_z",
    "acc_total",
    "rpm",
    "marcha",
    "gas",
    "freno",
    "steer_angle",
    "pos_x",
    "pos_y",
    "pos_z",
    "rot_x",
    "rot_y",
    "rot_z",
    "vel_x",
    "vel_y",
    "vel_z",
    "bodywork_noise",
    "drivetrain_speed",
    "numero_vuelta",
    "tiempo_vuelta_ms",
    "ultima_vuelta_ms",
    "mejor_vuelta_ms",
    "fuel",
    "fuel_por_vuelta",
    "boost",
    "dirt",
    "engine_health",
    "damage_front_deformation",
    "damage_rear",
    "damage_left",
    "damage_right",
    "damage_front",
    "status",
]
COLUMNAS_RUEDA = [
    "pos_x",
    "pos_y",
    "pos_z",
    "rot_x",
    "rot_y",
    "rot_z",
    "vel_angular",
    "slip_angle",
    "slip_ratio",
    "nd_slip",
    "carga",
    "dirt",
]

COLUMNAS_RESUMEN = [
    "vuelta",
    "tiempo_ms",
    "tiempo",
    "valida",
    "rapida",
    "frames",
    "auto",
    "piloto",
    "pista",
]


def _columnas() -> List[str]:
    columnas = list(COLUMNAS_BASE)
    for base in COLUMNAS_RUEDA:
        for posicion in POSICIONES_RUEDA:
            columnas.append(f"{base}_{posicion}")
    return columnas


def calcular_derivadas(frames: Sequence[Frame]) -> None:
    """Completa acc_x/acc_y/acc_z (m/s^2) derivando el vector de velocidad."""
    previo: Frame | None = None
    for frame in frames:
        if previo is not None:
            dt = frame.t - previo.t
            if dt > 0:
                frame.acc_x = (frame.vel_vector[0] - previo.vel_vector[0]) / dt
                frame.acc_y = (frame.vel_vector[1] - previo.vel_vector[1]) / dt
                frame.acc_z = (frame.vel_vector[2] - previo.vel_vector[2]) / dt
        previo = frame


def nombre_archivo(pista: str, vuelta: Vuelta) -> str:
    pista = pista or "sesion"
    return f"{pista}_vuelta_{vuelta.numero:02d}.csv"


def _fila(frame: Frame) -> List:
    fila = [
        f"{frame.t:.3f}",
        f"{frame.velocidad:.2f}",
        f"{frame.acc_x:.3f}",
        f"{frame.acc_y:.3f}",
        f"{frame.acc_z:.3f}",
        f"{frame.acc_total:.3f}",
        f"{frame.rpm:.1f}",
        frame.marcha,
        frame.gas,
        frame.freno,
        f"{frame.steer_angle:.4f}",
        f"{frame.posicion[0]:.3f}",
        f"{frame.posicion[1]:.3f}",
        f"{frame.posicion[2]:.3f}",
        f"{frame.rotacion[0]:.4f}",
        f"{frame.rotacion[1]:.4f}",
        f"{frame.rotacion[2]:.4f}",
        f"{frame.vel_vector[0]:.3f}",
        f"{frame.vel_vector[1]:.3f}",
        f"{frame.vel_vector[2]:.3f}",
        f"{frame.bodywork_noise:.3f}",
        f"{frame.drivetrain_speed:.3f}",
        frame.numero_vuelta,
        frame.tiempo_vuelta_ms,
        frame.ultima_vuelta_ms,
        frame.mejor_vuelta_ms,
        frame.fuel,
        frame.fuel_por_vuelta,
        frame.boost,
        frame.dirt,
        frame.engine_health,
        frame.damage_front_deformation,
        frame.damage_rear,
        frame.damage_left,
        frame.damage_right,
        frame.damage_front,
        frame.status,
    ]
    for rueda in frame.ruedas:
        fila.extend(
            [
                f"{rueda.posicion[0]:.3f}",
                f"{rueda.posicion[1]:.3f}",
                f"{rueda.posicion[2]:.3f}",
                f"{rueda.rotacion[0]:.4f}",
                f"{rueda.rotacion[1]:.4f}",
                f"{rueda.rotacion[2]:.4f}",
                f"{rueda.vel_angular:.4f}",
                f"{rueda.slip_angle:.4f}",
                f"{rueda.slip_ratio:.4f}",
                f"{rueda.nd_slip:.4f}",
                f"{rueda.carga:.4f}",
                f"{rueda.dirt:.4f}",
            ]
        )
    return fila


def exportar_vuelta(vuelta: Vuelta, carpeta: str, pista: str = "sesion") -> str:
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, nombre_archivo(pista, vuelta))
    calcular_derivadas(vuelta.frames)

    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(_columnas())
        for frame in vuelta.frames:
            escritor.writerow(_fila(frame))

    return ruta


def exportar_vueltas(vueltas: List[Vuelta], carpeta: str, pista: str = "sesion") -> List[str]:
    return [exportar_vuelta(vuelta, carpeta, pista) for vuelta in vueltas]


def _formato_tiempo(tiempo_ms: int) -> str:
    if tiempo_ms <= 0:
        return ""
    minutos, resto = divmod(tiempo_ms, 60_000)
    segundos, milisegundos = divmod(resto, 1000)
    return f"{minutos}:{segundos:02d}.{milisegundos:03d}"


def exportar_resumen(
    sesion: Sesion, vueltas: List[Vuelta], carpeta: str, pista: str = "sesion"
) -> str:
    """Escribe un CSV con una fila por vuelta (tiempos y marcas)."""
    os.makedirs(carpeta, exist_ok=True)
    pista = pista or "sesion"
    ruta = os.path.join(carpeta, f"{pista}_resumen.csv")
    auto = sesion.auto_principal

    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(COLUMNAS_RESUMEN)
        for vuelta in vueltas:
            escritor.writerow(
                [
                    vuelta.numero,
                    vuelta.tiempo_ms,
                    _formato_tiempo(vuelta.tiempo_ms),
                    int(bool(vuelta.es_valida)),
                    int(bool(vuelta.es_rapida)),
                    len(vuelta.frames),
                    auto.id,
                    auto.piloto,
                    pista,
                ]
            )

    return ruta
