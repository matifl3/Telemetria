//! Comparación A/B alineada por arco de pista (RF-015).
//!
//! Los deltas son siempre `A - B`: positivo significa que A es más lento (en
//! tiempo) o mayor (en velocidad, gas o freno). A y B pueden ser de autos
//! distintos.

use crate::alineado::alinear_vuelta;
use crate::grilla::Grilla;
use crate::sectores::sectores_de_vuelta;
use crate::vuelta::Vuelta;

/// Delta acumulado de tiempo A − B por punto de la grilla (s).
pub fn delta_acumulado(a: &Vuelta, b: &Vuelta, grilla: &Grilla) -> Vec<Option<f64>> {
    let a = alinear_vuelta(a, grilla);
    let b = alinear_vuelta(b, grilla);
    a.tiempo
        .iter()
        .zip(&b.tiempo)
        .map(|(&tiempo_a, &tiempo_b)| restar_f64(tiempo_a, tiempo_b))
        .collect()
}

/// Delta de velocidad A − B por punto de la grilla (km/h).
pub fn delta_velocidad(a: &Vuelta, b: &Vuelta, grilla: &Grilla) -> Vec<Option<f64>> {
    let a = alinear_vuelta(a, grilla);
    let b = alinear_vuelta(b, grilla);
    restar_canal(&a.velocidad_kmh, &b.velocidad_kmh)
}

/// Delta de acelerador y freno A − B por punto de la grilla (0..1).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DeltaPedales {
    pub gas: Vec<Option<f64>>,
    pub freno: Vec<Option<f64>>,
}

/// Calcula los deltas de pedal A − B.
pub fn delta_pedales(a: &Vuelta, b: &Vuelta, grilla: &Grilla) -> DeltaPedales {
    let a = alinear_vuelta(a, grilla);
    let b = alinear_vuelta(b, grilla);
    DeltaPedales {
        gas: restar_canal(&a.gas, &b.gas),
        freno: restar_canal(&a.freno, &b.freno),
    }
}

/// Delta de tiempo A − B por sector (s).
///
/// La suma de los tres valores coincide con el delta acumulado al final de la
/// pista cuando ambos extremos tienen tiempos válidos.
pub fn delta_por_sector(a: &Vuelta, b: &Vuelta, grilla: &Grilla) -> Vec<f64> {
    let sectores_a = sectores_de_vuelta(a, grilla);
    let sectores_b = sectores_de_vuelta(b, grilla);
    sectores_a
        .iter()
        .zip(&sectores_b)
        .map(|(a, b)| restar_f64(Some(a.tiempo_s), Some(b.tiempo_s)).unwrap_or(f64::NAN))
        .collect()
}

fn restar_canal(a: &[Option<f32>], b: &[Option<f32>]) -> Vec<Option<f64>> {
    a.iter()
        .zip(b)
        .map(|(&valor_a, &valor_b)| restar_f32(valor_a, valor_b))
        .collect()
}

fn restar_f32(a: Option<f32>, b: Option<f32>) -> Option<f64> {
    Some(a? as f64 - b? as f64)
}

fn restar_f64(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    Some(a? - b?)
}
