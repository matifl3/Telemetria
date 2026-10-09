"""Parser del formato .acreplay version 16.

Referencia de offsets y tipos: doc/FormatoTelemetria.md (seccion 2).
Todo es little-endian; los flotantes de media precision usan 'e' de struct.
"""

from __future__ import annotations

import math
import struct

from ..errores import ErrorTelemetria
from .modelos import Auto, Frame, Metadatos, Rueda, Sesion

VERSION_SOPORTADA = 16
TAM_FRAME = 256
MARCA_CSP = b"__AC_SHADERS_PATCH_v1__"


class _Lector:
    """Cursor binario con lectura tipada y verificacion de limites."""

    def __init__(self, datos: bytes):
        self.datos = datos
        self.pos = 0
        self.fin = len(datos)

    def bytes(self, cantidad: int) -> bytes:
        if cantidad < 0:
            raise ErrorTelemetria(f"Cantidad de bytes invalida ({cantidad})")
        if self.pos + cantidad > self.fin:
            raise ErrorTelemetria("Datos truncados: el archivo termina antes de lo esperado")
        parte = self.datos[self.pos:self.pos + cantidad]
        self.pos += cantidad
        return parte

    def saltar(self, cantidad: int) -> None:
        self.bytes(cantidad)

    def u8(self) -> int:
        return self.bytes(1)[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.bytes(2))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.bytes(4))[0]

    def f64(self) -> float:
        return struct.unpack("<d", self.bytes(8))[0]

    def cadena(self) -> str:
        largo = self.u32()
        if largo > 1_000_000:
            raise ErrorTelemetria(f"Longitud de texto invalida ({largo})")
        return self.bytes(largo).decode("utf-8", errors="replace")


def _leer_frame(bruto: bytes, indice: int, intervalo_ms: float) -> Frame:
    """Decodifica un CarFrame de 256 bytes (ver doc/FormatoTelemetria.md 2.4)."""
    velocidad = struct.unpack_from("<3e", bruto, 164)
    rapidez = math.sqrt(sum(v * v for v in velocidad)) * 3.6  # m/s -> km/h

    ruedas = [Rueda() for _ in range(4)]
    slip_angle = struct.unpack_from("<4e", bruto, 180)
    slip_ratio = struct.unpack_from("<4e", bruto, 188)
    nd_slip = struct.unpack_from("<4e", bruto, 196)
    carga = struct.unpack_from("<4e", bruto, 204)
    dirt = bruto[235:239]
    for i, rueda in enumerate(ruedas):
        rueda.slip_angle = slip_angle[i]
        rueda.slip_ratio = slip_ratio[i]
        rueda.nd_slip = nd_slip[i]
        rueda.carga = carga[i]
        rueda.dirt = dirt[i]

    return Frame(
        indice=indice,
        t=indice * intervalo_ms / 1000.0,
        velocidad=rapidez,
        rpm=struct.unpack_from("<e", bruto, 170)[0],
        marcha=bruto[234],
        gas=bruto[244],
        freno=bruto[245],
        steer_angle=struct.unpack_from("<e", bruto, 212)[0],
        numero_vuelta=bruto[246],
        tiempo_vuelta_ms=struct.unpack_from("<I", bruto, 220)[0],
        ultima_vuelta_ms=struct.unpack_from("<I", bruto, 224)[0],
        mejor_vuelta_ms=struct.unpack_from("<I", bruto, 228)[0],
        fuel=bruto[232],
        boost=bruto[254],
        ruedas=ruedas,
    )


def parsear_acreplay(datos: bytes) -> Sesion:
    """Convierte el contenido de un .acreplay v16 en una Sesion tipada."""
    lector = _Lector(datos)

    version = lector.u32()
    if version != VERSION_SOPORTADA:
        raise ErrorTelemetria(
            f"Solo se soporta .acreplay version {VERSION_SOPORTADA} (encontrado {version})"
        )

    intervalo_ms = lector.f64()
    clima = lector.cadena()
    pista = lector.cadena()
    config_pista = lector.cadena()

    num_cars = lector.u32()
    lector.u32()  # current_recording_index (no se usa)
    num_frames = lector.u32()
    num_track_objects = lector.u32()

    # Frames globales de objetos de pista: 4 bytes (angulos de sol) + 12 por objeto.
    lector.saltar((4 + 12 * num_track_objects) * num_frames)

    autos = []
    for _ in range(num_cars):
        car_id = lector.cadena()
        piloto = lector.cadena()
        lector.cadena()  # nation_code
        equipo = lector.cadena()
        skin = lector.cadena()

        car_frames = lector.u32()
        num_wings = lector.u32()

        lector.saltar(20)  # relleno previo a los frames

        frames = []
        for i in range(car_frames):
            bruto = lector.bytes(TAM_FRAME)
            frames.append(_leer_frame(bruto, i, intervalo_ms))
            if i < car_frames - 1:
                lector.saltar(20 + num_wings * 4)

        lector.saltar(num_wings * 4)
        extra_count = lector.u32()
        lector.saltar(extra_count * 8)

        autos.append(Auto(id=car_id, piloto=piloto, equipo=equipo, skin=skin, frames=frames))

    metadatos = Metadatos(
        pista=pista,
        config_pista=config_pista,
        clima=clima,
        version_formato=version,
        intervalo_ms=intervalo_ms,
    )
    return Sesion(metadatos=metadatos, autos=autos, formato="acreplay")


def leer_acreplay(ruta: str) -> Sesion:
    """Lee un archivo .acreplay desde disco."""
    with open(ruta, "rb") as archivo:
        return parsear_acreplay(archivo.read())
