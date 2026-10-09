"""Modelo de datos comun del core.

Todas las unidades quedan normalizadas:
- tiempos en segundos (`t`) o milisegundos cuando el nombre termina en `_ms`.
- velocidad en km/h.
- gas/freno en la escala original 0..255.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

# Orden de ruedas en el archivo (ver doc/FormatoTelemetria.md).
POSICIONES_RUEDA = ("FL", "FR", "RL", "RR")


@dataclass
class Rueda:
    slip_angle: float = 0.0
    slip_ratio: float = 0.0
    nd_slip: float = 0.0
    carga: float = 0.0
    dirt: float = 0.0


@dataclass
class Frame:
    indice: int = 0
    t: float = 0.0                 # segundos desde el inicio de la sesion
    velocidad: float = 0.0         # km/h
    rpm: float = 0.0
    marcha: int = 0
    gas: int = 0                   # 0..255
    freno: int = 0                 # 0..255
    steer_angle: float = 0.0
    numero_vuelta: int = 0         # current_lap
    tiempo_vuelta_ms: int = 0      # current_lap_time
    ultima_vuelta_ms: int = 0      # last_lap_time
    mejor_vuelta_ms: int = 0       # best_lap_time
    fuel: int = 0
    boost: int = 0
    ruedas: List[Rueda] = field(default_factory=lambda: [Rueda() for _ in range(4)])


@dataclass
class Auto:
    id: str = ""
    piloto: str = ""
    equipo: str = ""
    skin: str = ""
    frames: List[Frame] = field(default_factory=list)


@dataclass
class Metadatos:
    pista: str = ""
    config_pista: str = ""
    clima: str = ""
    version_formato: int = 0
    intervalo_ms: float = 0.0


@dataclass
class Sesion:
    metadatos: Metadatos = field(default_factory=Metadatos)
    autos: List[Auto] = field(default_factory=list)
    formato: str = ""

    @property
    def auto_principal(self) -> Auto:
        return self.autos[0] if self.autos else Auto()


@dataclass
class Vuelta:
    numero: int = 0
    t_inicio: float = 0.0
    t_fin: float = 0.0
    tiempo_ms: int = 0
    es_valida: bool = True
    frames: List[Frame] = field(default_factory=list)
