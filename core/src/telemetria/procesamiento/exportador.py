"""Exportacion de cada vuelta a un CSV (stdlib `csv`)."""

from __future__ import annotations

import csv
import os
from typing import List

from ..lector.modelos import POSICIONES_RUEDA, Vuelta

COLUMNAS_BASE = [
    "t",
    "velocidad_kmh",
    "rpm",
    "marcha",
    "gas",
    "freno",
    "steer_angle",
    "numero_vuelta",
    "tiempo_vuelta_ms",
    "ultima_vuelta_ms",
    "mejor_vuelta_ms",
    "fuel",
    "boost",
]
COLUMNAS_RUEDA = ["slip_angle", "slip_ratio", "nd_slip", "carga"]


def _columnas() -> List[str]:
    columnas = list(COLUMNAS_BASE)
    for base in COLUMNAS_RUEDA:
        for posicion in POSICIONES_RUEDA:
            columnas.append(f"{base}_{posicion}")
    return columnas


def nombre_archivo(pista: str, vuelta: Vuelta) -> str:
    pista = pista or "sesion"
    return f"{pista}_vuelta_{vuelta.numero:02d}.csv"


def exportar_vuelta(vuelta: Vuelta, carpeta: str, pista: str = "sesion") -> str:
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, nombre_archivo(pista, vuelta))

    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(_columnas())
        for frame in vuelta.frames:
            fila = [
                f"{frame.t:.3f}",
                f"{frame.velocidad:.2f}",
                f"{frame.rpm:.1f}",
                frame.marcha,
                frame.gas,
                frame.freno,
                f"{frame.steer_angle:.4f}",
                frame.numero_vuelta,
                frame.tiempo_vuelta_ms,
                frame.ultima_vuelta_ms,
                frame.mejor_vuelta_ms,
                frame.fuel,
                frame.boost,
            ]
            for base in COLUMNAS_RUEDA:
                for rueda in frame.ruedas:
                    fila.append(f"{getattr(rueda, base):.4f}")
            escritor.writerow(fila)

    return ruta


def exportar_vueltas(vueltas: List[Vuelta], carpeta: str, pista: str = "sesion") -> List[str]:
    return [exportar_vuelta(vuelta, carpeta, pista) for vuelta in vueltas]
