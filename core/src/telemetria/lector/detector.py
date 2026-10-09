"""Deteccion automatica de formato y seleccion del lector adecuado."""

from __future__ import annotations

import os

from ..errores import ErrorTelemetria
from .acreplay import leer_acreplay
from .modelos import Sesion
from .nkt import leer_nkt


def leer(ruta: str) -> Sesion:
    """Lee un archivo de telemetria reconociendo el formato por su extension."""
    if not os.path.isfile(ruta):
        raise ErrorTelemetria(f"No existe el archivo: {ruta}")

    extension = os.path.splitext(ruta)[1].lower()
    if extension == ".acreplay":
        return leer_acreplay(ruta)
    if extension == ".nkt":
        return leer_nkt(ruta)

    raise ErrorTelemetria(f"Extension no soportada: '{extension}' (.acreplay o .nkt)")
