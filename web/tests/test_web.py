"""Tests de la capa web (Flask) usando el cliente de pruebas y un replay real."""

from __future__ import annotations

import io

import pytest

import app as app_mod
import sesion


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(app_mod, "CARPETA_TRABAJO", tmp_path)
    monkeypatch.setattr(sesion, "CARPETA_TRABAJO", tmp_path)
    aplicacion = app_mod.create_app()
    aplicacion.config.update(TESTING=True)
    return aplicacion.test_client()


def _subir(cliente, ruta: str):
    with open(ruta, "rb") as archivo:
        datos = archivo.read()
    return cliente.post(
        "/subir",
        data={"archivo": (io.BytesIO(datos), "muestra_monza.acreplay")},
        content_type="multipart/form-data",
        follow_redirects=True,
    )


def test_flujo_completo(cliente, ruta_muestra):
    respuesta = _subir(cliente, ruta_muestra)
    assert respuesta.status_code == 200
    assert b"Descargar todas" in respuesta.data

    descarga = cliente.get("/sesion/vuelta/1.csv")
    assert descarga.status_code == 200
    assert descarga.data.splitlines()[0].startswith(b"t,velocidad_kmh")

    comprimido = cliente.get("/sesion/todas.zip")
    assert comprimido.status_code == 200
    assert comprimido.data[:2] == b"PK"

    cliente.post("/sesion/borrar", follow_redirects=True)
    assert cliente.get("/sesion").status_code == 302


def test_extension_invalida(cliente):
    respuesta = cliente.post(
        "/subir",
        data={"archivo": (io.BytesIO(b"x"), "notas.txt")},
        content_type="multipart/form-data",
    )
    assert respuesta.status_code == 400


def test_version_no_soportada(cliente):
    respuesta = cliente.post(
        "/subir",
        data={"archivo": (io.BytesIO(b"\x0f\x00\x00\x00"), "viejo.acreplay")},
        content_type="multipart/form-data",
    )
    assert respuesta.status_code == 400
    assert b"version 16" in respuesta.data


def test_sin_sesion_redirige(cliente):
    assert cliente.get("/sesion").status_code == 302
