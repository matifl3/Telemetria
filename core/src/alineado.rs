//! Canales de una vuelta alineados a la grilla común de `s` (RF-013, RF-015).
//!
//! El remuestreo no extrapola: fuera de la cobertura de la vuelta, dentro de un
//! hueco de proyección o con un valor no finito, el resultado es `None`.

use crate::grilla::{Grilla, remuestrear_lineal};
use crate::vuelta::Vuelta;

/// Canales de una vuelta remuestreados a la grilla de la pista.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct VueltaAlineada {
    /// Arcos de la grilla (m).
    pub s: Vec<f64>,
    /// Tiempo relativo al inicio de la vuelta (s).
    pub tiempo: Vec<Option<f64>>,
    pub velocidad_kmh: Vec<Option<f32>>,
    /// Acelerador normalizado 0..1.
    pub gas: Vec<Option<f32>>,
    /// Freno normalizado 0..1.
    pub freno: Vec<Option<f32>>,
    pub rpm: Vec<Option<f32>>,
    pub acc_lat: Vec<Option<f32>>,
    pub x: Vec<Option<f32>>,
    pub z: Vec<Option<f32>>,
}

impl VueltaAlineada {
    /// Cantidad de puntos alineados.
    pub fn puntos(&self) -> usize {
        self.s.len()
    }
}

/// Remuestrea todos los canales usados por los agregados y la comparación.
pub fn alinear_vuelta(vuelta: &Vuelta, grilla: &Grilla) -> VueltaAlineada {
    let muestras = &vuelta.muestras;
    VueltaAlineada {
        s: grilla.s.clone(),
        tiempo: remuestrear_lineal(&muestras.s, &muestras.t_rel, grilla),
        velocidad_kmh: remuestrear_lineal(&muestras.s, &muestras.speed_kmh, grilla),
        gas: remuestrear_lineal(&muestras.s, &muestras.gas, grilla),
        freno: remuestrear_lineal(&muestras.s, &muestras.freno, grilla),
        rpm: remuestrear_lineal(&muestras.s, &muestras.rpm, grilla),
        acc_lat: remuestrear_lineal(&muestras.s, &muestras.acc_lat, grilla),
        x: remuestrear_lineal(&muestras.s, &muestras.x, grilla),
        z: remuestrear_lineal(&muestras.s, &muestras.z, grilla),
    }
}

/// Interpola linealmente una serie ya alineada en un arco arbitrario.
///
/// Devuelve `None` fuera de la grilla o si alguno de los extremos del tramo es
/// un hueco. En un punto exacto de la grilla devuelve ese valor sin interpolar.
pub fn interpolar_en(grilla: &Grilla, valores: &[Option<f64>], arco_m: f64) -> Option<f64> {
    let n = grilla.s.len().min(valores.len());
    if n == 0 || !arco_m.is_finite() {
        return None;
    }

    let inicio = grilla.s[0];
    let fin = grilla.s[n - 1];
    if arco_m < inicio || arco_m > fin {
        return None;
    }
    if (arco_m - inicio).abs() <= 1e-9 {
        return valores[0];
    }
    if (arco_m - fin).abs() <= 1e-9 {
        return valores[n - 1];
    }

    let posterior = grilla.s[..n].partition_point(|&valor| valor < arco_m);
    if posterior == 0 || posterior >= n {
        return None;
    }
    let anterior = posterior - 1;
    if (grilla.s[posterior] - arco_m).abs() <= 1e-9 {
        return valores[posterior];
    }

    let x0 = grilla.s[anterior];
    let x1 = grilla.s[posterior];
    let y0 = valores[anterior]?;
    let y1 = valores[posterior]?;
    let t = (arco_m - x0) / (x1 - x0);
    Some(y0 + (y1 - y0) * t)
}
