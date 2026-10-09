"""Tests del core contra un replay real de `Paquetes de telemetria/`."""

from __future__ import annotations

import json
import os
import struct

import pytest

from telemetria.cli import ejecutar
from telemetria.errores import ErrorTelemetria
from telemetria.lector.acreplay import leer_acreplay
from telemetria.lector.detector import leer
from telemetria.procesamiento.exportador import exportar_vueltas
from telemetria.procesamiento.segmentador import segmentar


@pytest.fixture(scope="session")
def sesion(ruta_muestra):
    return leer_acreplay(ruta_muestra)


def test_parsea_encabezado(sesion):
    assert sesion.formato == "acreplay"
    assert sesion.metadatos.version_formato == 16
    assert sesion.metadatos.pista  # no vacio
    assert sesion.metadatos.intervalo_ms > 0
    assert sesion.autos  # al menos un auto


def test_frames_plausibles(sesion):
    auto = sesion.auto_principal
    assert auto.frames
    assert any(frame.velocidad > 0 for frame in auto.frames)
    assert any(frame.rpm > 0 for frame in auto.frames)


def test_segmenta_por_vuelta(sesion):
    vueltas = segmentar(sesion)
    assert vueltas
    assert all(vuelta.frames for vuelta in vueltas)
    # Los numeros de vuelta son consecutivos y sin saltos raros.
    numeros = [vuelta.numero for vuelta in vueltas]
    assert numeros == sorted(numeros)
    # Con varias vueltas, las del medio deben quedar como validas.
    if len(vueltas) >= 3:
        assert any(vuelta.es_valida for vuelta in vueltas)


def test_exporta_un_csv_por_vuelta(sesion, tmp_path):
    vueltas = segmentar(sesion)
    archivos = exportar_vueltas(vueltas, str(tmp_path), sesion.metadatos.pista)

    assert len(archivos) == len(vueltas)
    with open(archivos[0], encoding="utf-8") as archivo:
        lineas = archivo.read().splitlines()
    assert lineas[0].startswith("t,velocidad_kmh")
    assert len(lineas) == 1 + len(vueltas[0].frames)


def test_cli_json(ruta_muestra, tmp_path, capsys):
    codigo = ejecutar(ruta_muestra, str(tmp_path), como_json=True)

    assert codigo == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["ok"] is True
    assert salida["formato"] == "acreplay"
    assert salida["sesion"]["pista"]
    assert salida["vueltas"]
    assert all("archivo" in vuelta for vuelta in salida["vueltas"])


def test_version_no_soportada(tmp_path):
    ruta = tmp_path / "viejo.acreplay"
    ruta.write_bytes(struct.pack("<I", 15))
    with pytest.raises(ErrorTelemetria) as info:
        leer_acreplay(str(ruta))
    assert "version 16" in str(info.value)


def test_extension_no_soportada(tmp_path):
    ruta = tmp_path / "x.txt"
    ruta.write_text("hola", encoding="utf-8")
    assert os.path.isfile(str(ruta))
    with pytest.raises(ErrorTelemetria):
        leer(str(ruta))


def test_archivo_inexistente():
    with pytest.raises(ErrorTelemetria):
        leer("no_existe.acreplay")
