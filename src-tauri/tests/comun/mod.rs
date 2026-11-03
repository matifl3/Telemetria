//! Fixtures compartidos por los tests de integración de la capa Tauri.
//!
//! Reutiliza los constructores de bytes de `core/tests/soporte`: todo se genera
//! en memoria, sin archivos binarios ni escrituras en disco.

#![allow(dead_code)]

#[path = "../../../core/tests/soporte/mod.rs"]
mod soporte;

pub use soporte::{AutoFixture, ConstructorReplay, FrameFixture};

use acreplay_core::sesion::Sesion;
use soporte::pista::ConstructorPista;

const RADIO: f32 = 100.0;
const PUNTOS: usize = 60;

pub fn pista_bytes() -> Vec<u8> {
    ConstructorPista::circular(RADIO, PUNTOS)
        .con_semianchos(6.0, 6.0)
        .bytes()
}

/// Pista con una cantidad de puntos declarada fuera de rango (T103).
pub fn pista_invalida_bytes() -> Vec<u8> {
    let mut pista = ConstructorPista::circular(RADIO, PUNTOS).con_semianchos(6.0, 6.0);
    pista.n_declarado = Some(2);
    pista.bytes()
}

pub fn frames(numero: u8, cantidad: usize, paso_ms: u32) -> Vec<FrameFixture> {
    (0..cantidad)
        .map(|indice| {
            let angulo = std::f32::consts::TAU * indice as f32 / PUNTOS as f32;
            FrameFixture {
                x: RADIO * angulo.cos(),
                z: RADIO * angulo.sin(),
                vel_x: 27.8,
                vuelta: numero,
                tiempo_vuelta_ms: indice as u32 * paso_ms,
                ..FrameFixture::default()
            }
        })
        .collect()
}

pub fn auto(car_id: &str, piloto: &str, vueltas: &[(u8, usize, u32)]) -> AutoFixture {
    let mut auto = AutoFixture::nuevo(car_id, piloto, 0);
    auto.frames = vueltas
        .iter()
        .flat_map(|&(numero, cantidad, paso_ms)| frames(numero, cantidad, paso_ms))
        .collect();
    auto
}

pub fn auto_valido(car_id: &str, piloto: &str) -> AutoFixture {
    auto(car_id, piloto, &[(1, PUNTOS, 33), (2, PUNTOS, 33)])
}

pub fn replay_bytes(autos: Vec<AutoFixture>, indice_jugador: u32) -> Vec<u8> {
    ConstructorReplay {
        autos,
        indice_jugador,
        ..ConstructorReplay::default()
    }
    .bytes()
}

pub fn sesion_valida() -> Sesion {
    let mut sesion = Sesion::nueva();
    sesion
        .cargar_lote(
            &replay_bytes(vec![auto_valido("auto_0", "Jugador")], 0),
            "replay.acreplay",
            &pista_bytes(),
            "fast_lane.ai",
        )
        .expect("la sesión de prueba debe ser válida");
    sesion
}
