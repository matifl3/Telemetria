"""Fixtures de los tests web (usan un replay real de `Paquetes de telemetria/`)."""

from __future__ import annotations

from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
CARPETA_MUESTRAS = RAIZ / "Paquetes de telemetria"


@pytest.fixture(scope="session")
def ruta_muestra() -> str:
    archivos = sorted(CARPETA_MUESTRAS.glob("*.acreplay"))
    if not archivos:
        pytest.skip(f"No hay ningun .acreplay de muestra en '{CARPETA_MUESTRAS}'")
    return str(archivos[0])
