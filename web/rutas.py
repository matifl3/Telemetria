"""Rutas HTTP de Telemetria AC.

La web importa el core Python como libreria (sin subprocess).
"""

from __future__ import annotations

import io
import os
import zipfile
from pathlib import Path

from flask import (
    Blueprint,
    redirect,
    render_template,
    request,
    send_file,
    send_from_directory,
    session,
    url_for,
)

from telemetria.errores import ErrorTelemetria
from telemetria.lector.detector import leer
from telemetria.procesamiento.exportador import exportar_vueltas
from telemetria.procesamiento.segmentador import segmentar

import sesion as estado
from config import EXTENSIONES

bp = Blueprint("telemetria", __name__)


def _resultado_actual():
    ident = session.get("sesion_id")
    if not ident:
        return None
    return estado.leer_resultado(ident)


@bp.get("/")
def principal():
    return render_template("principal.html")


@bp.post("/subir")
def subir():
    archivo = request.files.get("archivo")
    if archivo is None or archivo.filename == "":
        return render_template("error.html", mensaje="No se selecciono ningun archivo."), 400

    extension = Path(archivo.filename).suffix.lower()
    if extension not in EXTENSIONES:
        return render_template("error.html", mensaje=f"Extension no soportada: '{extension}'."), 400

    ident = estado.nueva_sesion()
    destino = estado.carpeta(ident) / f"entrada{extension}"
    archivo.save(destino)

    try:
        datos = leer(str(destino))
        vueltas = segmentar(datos)
        archivos = exportar_vueltas(
            vueltas, str(estado.carpeta(ident) / "csv"), datos.metadatos.pista
        )
    except ErrorTelemetria as error:
        estado.borrar(ident)
        return render_template("error.html", mensaje=str(error)), 400

    auto = datos.auto_principal
    resultado = {
        "formato": datos.formato,
        "version": datos.metadatos.version_formato,
        "pista": datos.metadatos.pista,
        "config_pista": datos.metadatos.config_pista,
        "clima": datos.metadatos.clima,
        "auto": auto.id,
        "piloto": auto.piloto,
        "vueltas": [
            {
                "numero": vuelta.numero,
                "tiempo_ms": vuelta.tiempo_ms,
                "valida": vuelta.es_valida,
                "rapida": vuelta.es_rapida,
                "archivo": os.path.basename(ruta),
            }
            for vuelta, ruta in zip(vueltas, archivos)
        ],
    }
    estado.guardar_resultado(ident, resultado)
    session["sesion_id"] = ident
    return redirect(url_for("telemetria.ver_sesion"))


@bp.get("/sesion")
def ver_sesion():
    resultado = _resultado_actual()
    if resultado is None:
        return redirect(url_for("telemetria.principal"))
    return render_template("sesion.html", resultado=resultado)


@bp.get("/sesion/vuelta/<int:numero>.csv")
def descargar_vuelta(numero: int):
    resultado = _resultado_actual()
    if resultado is None:
        return redirect(url_for("telemetria.principal"))

    vuelta = next((v for v in resultado["vueltas"] if v["numero"] == numero), None)
    if vuelta is None:
        return render_template("error.html", mensaje="Vuelta no encontrada."), 404

    carpeta_csv = estado.carpeta(session["sesion_id"]) / "csv"
    return send_from_directory(str(carpeta_csv), vuelta["archivo"], as_attachment=True)


@bp.get("/sesion/todas.zip")
def descargar_todas():
    resultado = _resultado_actual()
    if resultado is None:
        return redirect(url_for("telemetria.principal"))

    carpeta_csv = estado.carpeta(session["sesion_id"]) / "csv"
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as comprimido:
        for vuelta in resultado["vueltas"]:
            ruta = carpeta_csv / vuelta["archivo"]
            if ruta.is_file():
                comprimido.write(ruta, arcname=vuelta["archivo"])
    memoria.seek(0)
    return send_file(
        memoria, mimetype="application/zip", as_attachment=True, download_name="vueltas.zip"
    )


@bp.post("/sesion/borrar")
def borrar_sesion():
    ident = session.pop("sesion_id", None)
    if ident:
        estado.borrar(ident)
    return redirect(url_for("telemetria.principal"))
