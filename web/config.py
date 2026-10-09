"""Configuracion de la aplicacion web."""

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_TRABAJO = RAIZ / "datos"
CORE_SRC = RAIZ / "core" / "src"

TAMANO_MAX_BYTES = 200 * 1024 * 1024  # 200 MB
EXTENSIONES = {".acreplay", ".nkt"}

# En produccion, reemplazar por una clave secreta real (variable de entorno).
SECRET_KEY = "telemetria-ac-dev"
