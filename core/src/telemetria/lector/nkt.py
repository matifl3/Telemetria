""".nkt (AiM Race Studio) - fase 2 / a investigar.

El formato es propietario; por ahora solo se informa al usuario la via de menor
riesgo: exportar a CSV desde AiM Race Studio (ver doc/FormatoTelemetria.md 3).
"""

from __future__ import annotations

from ..errores import ErrorTelemetria
from .modelos import Sesion


def leer_nkt(ruta: str) -> Sesion:
    raise ErrorTelemetria(
        "El formato .nkt (AiM Race Studio) todavia no esta soportado. "
        "Exportalo a CSV desde Race Studio (ver doc/FormatoTelemetria.md, seccion 3)."
    )
