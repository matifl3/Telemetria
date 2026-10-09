"""Gestion de las carpetas de trabajo y del resultado de cada sesion.

Cada subida usa una carpeta unica `datos/<uuid>/` con:
- el archivo de entrada (`entrada.acreplay` / `.nkt`),
- la subcarpeta `csv/` con los CSV generados,
- `resultado.json` con los metadatos y la lista de vueltas.
"""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Optional

from config import CARPETA_TRABAJO


def carpeta(ident: str) -> Path:
    return CARPETA_TRABAJO / ident


def nueva_sesion() -> str:
    ident = uuid.uuid4().hex
    carpeta(ident).mkdir(parents=True, exist_ok=True)
    return ident


def guardar_resultado(ident: str, resultado: dict) -> None:
    (carpeta(ident) / "resultado.json").write_text(
        json.dumps(resultado, ensure_ascii=False), encoding="utf-8"
    )


def leer_resultado(ident: str) -> Optional[dict]:
    ruta = carpeta(ident) / "resultado.json"
    if not ruta.is_file():
        return None
    return json.loads(ruta.read_text(encoding="utf-8"))


def borrar(ident: str) -> None:
    shutil.rmtree(carpeta(ident), ignore_errors=True)
