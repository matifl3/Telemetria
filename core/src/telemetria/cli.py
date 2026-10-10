"""Interfaz de linea de comandos del core.

Flujo: leer -> segmentar -> exportar. Por defecto imprime un resumen legible;
con --json emite un objeto JSON (util para scripts y pruebas).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import List

from .errores import ErrorTelemetria
from .lector.detector import leer
from .procesamiento.exportador import exportar_resumen, exportar_vueltas
from .procesamiento.segmentador import segmentar


def _salida_json(sesion, vueltas, archivos: List[str], resumen: str) -> dict:
    return {
        "ok": True,
        "formato": sesion.formato,
        "version": sesion.metadatos.version_formato,
        "sesion": {
            "pista": sesion.metadatos.pista,
            "config_pista": sesion.metadatos.config_pista,
            "clima": sesion.metadatos.clima,
            "intervalo_ms": sesion.metadatos.intervalo_ms,
        },
        "autos": [
            {"id": a.id, "piloto": a.piloto, "equipo": a.equipo, "skin": a.skin}
            for a in sesion.autos
        ],
        "resumen": os.path.basename(resumen),
        "vueltas": [
            {
                "numero": vuelta.numero,
                "tiempo_ms": vuelta.tiempo_ms,
                "valida": vuelta.es_valida,
                "rapida": vuelta.es_rapida,
                "motivo": vuelta.motivo_invalida,
                "archivo": os.path.basename(ruta),
            }
            for vuelta, ruta in zip(vueltas, archivos)
        ],
    }


def _resumen(ruta: str, sesion, vueltas, archivos: List[str], resumen: str) -> None:
    tamano_mb = os.path.getsize(ruta) / (1024 * 1024)
    auto = sesion.auto_principal
    validas = sum(1 for v in vueltas if v.es_valida)
    rapidas = sum(1 for v in vueltas if v.es_rapida)

    print(f"Archivo: {os.path.basename(ruta)} ({tamano_mb:.1f} MB)")
    print(f"Formato: {sesion.formato} v{sesion.metadatos.version_formato}")
    print(f"Pista:   {sesion.metadatos.pista or '-'}")
    print(f"Auto:    {auto.id or '-'}")
    print(f"Piloto:  {auto.piloto or '-'}")
    print(f"Vueltas: {len(vueltas)}  ({validas} validas, {rapidas} rapidas)")
    for ruta_csv in archivos:
        print(f" -> {ruta_csv}")
    print(f" -> {resumen}")


def ejecutar(
    ruta: str,
    carpeta: str,
    como_json: bool = False,
    auto: int = 0,
    solo_rapidas: bool = False,
    pct: float = 103.0,
) -> int:
    try:
        sesion = leer(ruta)
        vueltas = segmentar(sesion, auto_indice=auto, pct=pct)
        if solo_rapidas:
            vueltas = [v for v in vueltas if v.es_rapida]
        pista = sesion.metadatos.pista
        archivos = exportar_vueltas(vueltas, carpeta, pista)
        resumen = exportar_resumen(sesion, vueltas, carpeta, pista)
    except ErrorTelemetria as error:
        if como_json:
            print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        else:
            print(f"Error: {error}", file=sys.stderr)
        return 1

    if como_json:
        print(json.dumps(_salida_json(sesion, vueltas, archivos, resumen), ensure_ascii=False))
    else:
        _resumen(ruta, sesion, vueltas, archivos, resumen)
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="telemetria",
        description="Convierte un archivo de telemetria de Assetto Corsa en CSV por vuelta.",
    )
    parser.add_argument("archivo", help="ruta al .acreplay (o .nkt)")
    parser.add_argument("--out", required=True, help="carpeta de salida para los CSV")
    parser.add_argument("--json", action="store_true", help="imprime el resultado como JSON")
    parser.add_argument(
        "--auto",
        type=int,
        default=0,
        help="indice del auto a exportar (0 = el primero, por defecto)",
    )
    parser.add_argument(
        "--solo-rapidas",
        action="store_true",
        help="exporta unicamente las vueltas marcadas como rapidas",
    )
    parser.add_argument(
        "--pct",
        type=float,
        default=103.0,
        help="umbral de vuelta rapida: %% del mejor tiempo (por defecto 103)",
    )
    args = parser.parse_args(argv)
    return ejecutar(args.archivo, args.out, args.json, args.auto, args.solo_rapidas, args.pct)


if __name__ == "__main__":
    raise SystemExit(main())
