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
from telemetria.procesamiento.exportador import exportar_resumen, exportar_vueltas
from telemetria.procesamiento.segmentador import _motivo_vuelta, segmentar


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


def test_decodifica_canales_extra(sesion):
    frame = next(f for f in sesion.auto_principal.frames if f.velocidad > 0)
    assert any(abs(componente) > 0 for componente in frame.posicion)
    assert any(abs(componente) > 0 for componente in frame.vel_vector)
    assert any(abs(rueda.carga) > 0 for rueda in frame.ruedas)
    assert any(rueda.posicion != (0.0, 0.0, 0.0) for rueda in frame.ruedas)
    assert frame.status >= 0
    assert frame.engine_health >= 0
    assert frame.damage_front >= 0


def test_marca_vueltas_rapidas(sesion):
    vueltas = segmentar(sesion)
    validas = [v for v in vueltas if v.es_valida and v.tiempo_ms > 0]
    if validas:
        mejor = min(v.tiempo_ms for v in validas)
        for vuelta in validas:
            assert vuelta.es_rapida == (vuelta.tiempo_ms <= mejor * 1.03)
        assert any(vuelta.es_rapida for vuelta in vueltas)
    estricto = segmentar(sesion, pct=100.0)
    assert sum(v.es_rapida for v in estricto) <= sum(v.es_rapida for v in vueltas)


def test_motivo_vuelta_clasifica():
    casos = [
        # (dist, vel, indice, total, ref_dist, ref_vel) -> motivo
        (5579, 121, 0, 7, 5737, 173, "salida"),  # outlap lenta al inicio
        (492, 73, 6, 7, 5737, 173, "entrada"),  # inlap lenta al final
        (3343, 171, 0, 15, 5742, 171, "incompleta"),  # arranca a mitad de vuelta
        (2000, 176, 1, 7, 5747, 171, "cortada"),  # corte de pista en el medio
        (5742, 163, 1, 15, 5742, 171, ""),  # vuelta completa normal
        (5742, 133, 5, 16, 5737, 171, ""),  # lenta por trafico pero completa
        (5742, 171, 0, 1, 5742, 171, ""),  # archivo de una sola vuelta completa
    ]
    for dist, vel, indice, total, ref_dist, ref_vel, esperado in casos:
        assert _motivo_vuelta(dist, vel, indice, total, ref_dist, ref_vel) == esperado


def test_clasifica_salida_largada_y_cortada(sesion):
    vueltas = segmentar(sesion)
    if len(vueltas) < 3:
        pytest.skip("Se necesita un replay con varias vueltas")
    # La primera vuelta (salida o incompleta) no cuenta nunca.
    assert not vueltas[0].es_valida
    assert vueltas[0].motivo_invalida in ("salida", "incompleta")
    # La ultima (entrada o incompleta) tampoco.
    assert vueltas[-1].es_valida is False
    assert vueltas[-1].motivo_invalida in ("entrada", "incompleta")
    # Las del medio son validas salvo que haya un corte.
    for vuelta in vueltas[1:-1]:
        assert vuelta.es_valida == (vuelta.motivo_invalida == "")


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


def test_exporta_muchas_columnas_y_derivadas(sesion, tmp_path):
    vueltas = segmentar(sesion)
    archivos = exportar_vueltas(vueltas, str(tmp_path), sesion.metadatos.pista)
    with open(archivos[0], encoding="utf-8") as archivo:
        encabezado = archivo.readline().strip().split(",")

    assert len(encabezado) > 60
    for columna in (
        "acc_total",
        "pos_x",
        "vel_x",
        "bodywork_noise",
        "damage_front",
        "status",
        "carga_FL",
        "vel_angular_FL",
        "dirt_RR",
    ):
        assert columna in encabezado
    # Alguna derivada de aceleracion debe ser distinta de cero en marcha.
    assert any(abs(frame.acc_total) > 0 for frame in vueltas[0].frames)


def test_resumen_csv(sesion, tmp_path):
    vueltas = segmentar(sesion)
    ruta = exportar_resumen(sesion, vueltas, str(tmp_path), sesion.metadatos.pista)

    assert os.path.isfile(ruta)
    with open(ruta, encoding="utf-8") as archivo:
        lineas = archivo.read().splitlines()
    assert lineas[0].startswith("vuelta,tiempo_ms")
    assert len(lineas) == 1 + len(vueltas)


def test_cli_json(ruta_muestra, tmp_path, capsys):
    codigo = ejecutar(ruta_muestra, str(tmp_path), como_json=True)

    assert codigo == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["ok"] is True
    assert salida["formato"] == "acreplay"
    assert salida["sesion"]["pista"]
    assert salida["vueltas"]
    assert salida["resumen"].endswith("_resumen.csv")
    assert all("archivo" in vuelta for vuelta in salida["vueltas"])
    assert all("rapida" in vuelta for vuelta in salida["vueltas"])
    assert all("motivo" in vuelta for vuelta in salida["vueltas"])


def test_cli_solo_rapidas(ruta_muestra, tmp_path, capsys):
    codigo = ejecutar(ruta_muestra, str(tmp_path), como_json=True, solo_rapidas=True)

    assert codigo == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["vueltas"]
    assert all(vuelta["rapida"] for vuelta in salida["vueltas"])



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
