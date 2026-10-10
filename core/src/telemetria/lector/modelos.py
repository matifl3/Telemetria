"""Modelo de datos comun del core.

Unidades normalizadas:
- tiempos: `t` en segundos; los nombres que terminan en `_ms` en milisegundos.
- velocidad escalar `velocidad` en km/h; `vel_vector` en m/s (x, y, z).
- aceleraciones derivadas en m/s^2 (x, y, z del mundo).
- gas/freno en la escala original 0..255.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

# Orden de ruedas en el archivo (ver doc/FormatoTelemetria.md).
POSICIONES_RUEDA = ("FL", "FR", "RL", "RR")

Cero3: Tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass
class Rueda:
    posicion: Tuple[float, float, float] = Cero3
    rotacion: Tuple[float, float, float] = Cero3
    vel_angular: float = 0.0
    slip_angle: float = 0.0
    slip_ratio: float = 0.0
    nd_slip: float = 0.0
    carga: float = 0.0
    dirt: float = 0.0


@dataclass
class Frame:
    indice: int = 0
    t: float = 0.0                                  # segundos
    velocidad: float = 0.0                          # km/h (rapidez)
    vel_vector: Tuple[float, float, float] = Cero3  # m/s
    acc_x: float = 0.0
    acc_y: float = 0.0
    acc_z: float = 0.0
    posicion: Tuple[float, float, float] = Cero3
    rotacion: Tuple[float, float, float] = Cero3    # normalizada a X-Y-Z
    rpm: float = 0.0
    marcha: int = 0
    gas: int = 0                                    # 0..255
    freno: int = 0                                  # 0..255
    steer_angle: float = 0.0
    bodywork_noise: float = 0.0
    drivetrain_speed: float = 0.0
    numero_vuelta: int = 0                          # current_lap
    tiempo_vuelta_ms: int = 0                       # current_lap_time
    ultima_vuelta_ms: int = 0                       # last_lap_time
    mejor_vuelta_ms: int = 0                        # best_lap_time
    fuel: int = 0
    fuel_por_vuelta: int = 0
    boost: int = 0
    dirt: int = 0
    engine_health: int = 0
    damage_front_deformation: int = 0
    damage_rear: int = 0
    damage_left: int = 0
    damage_right: int = 0
    damage_front: int = 0
    status: int = 0
    ruedas: List[Rueda] = field(default_factory=lambda: [Rueda() for _ in range(4)])

    @property
    def acc_total(self) -> float:
        return math.sqrt(self.acc_x ** 2 + self.acc_y ** 2 + self.acc_z ** 2)


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
    es_rapida: bool = False
    motivo_invalida: str = ""  # "salida" | "entrada" | "cortada" | "incompleta" | "" si es valida
    frames: List[Frame] = field(default_factory=list)
