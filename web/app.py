"""Punto de entrada de la aplicacion web (Flask).

Ejecutar:

    python web/app.py

y abrir http://localhost:5000
"""

from __future__ import annotations

import sys
from pathlib import Path

from flask import Flask, render_template

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
CORE_SRC = RAIZ / "core" / "src"
if str(CORE_SRC) not in sys.path:
    sys.path.insert(0, str(CORE_SRC))

from config import CARPETA_TRABAJO, SECRET_KEY, TAMANO_MAX_BYTES  # noqa: E402
from rutas import bp  # noqa: E402


def formato_tiempo(ms) -> str:
    if not ms:
        return "-"
    minutos, resto = divmod(int(ms), 60000)
    segundos, milesimas = divmod(resto, 1000)
    return f"{minutos}:{segundos:02d}.{milesimas:03d}"


def create_app() -> Flask:
    app = Flask(__name__, template_folder="plantillas", static_folder="estatico")
    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = TAMANO_MAX_BYTES
    app.jinja_env.filters["tiempo"] = formato_tiempo
    app.register_blueprint(bp)
    CARPETA_TRABAJO.mkdir(parents=True, exist_ok=True)

    @app.errorhandler(413)
    def archivo_demasiado_grande(_error):
        return render_template("error.html", mensaje="El archivo supera el tamano maximo permitido."), 413

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
