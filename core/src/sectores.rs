//! Sectores fijos sobre el arco de pista y vuelta teórica (RF-011).
//!
//! La pista se divide en tres tramos iguales de `s`, independientes de la vuelta
//! y del auto. Un sector sin tiempos válidos en alguno de sus extremos queda
//! `NaN`; no se completa con el punto de grilla más cercano.

use crate::alineado::{alinear_vuelta, interpolar_en};
use crate::grilla::Grilla;
use crate::vuelta::Vuelta;

/// Cantidad de sectores de la pista.
pub const N_SECTORES: usize = 3;

/// Un tercio de la pista y su tiempo.
#[derive(Debug, Clone, PartialEq)]
pub struct Sector {
    /// Número visible `1..=N_SECTORES`.
    pub numero: usize,
    pub s_ini: f64,
    pub s_fin: f64,
    /// Tiempo del sector (s); `NaN` si falta un extremo o el orden es inválido.
    pub tiempo_s: f64,
}

/// Calcula los tres sectores de una vuelta sobre la grilla común.
pub fn sectores_de_vuelta(vuelta: &Vuelta, grilla: &Grilla) -> Vec<Sector> {
    let alineada = alinear_vuelta(vuelta, grilla);
    sectores_de_tiempo(grilla, &alineada.tiempo)
}

/// Calcula los tres sectores a partir de un canal de tiempo ya alineado.
pub fn sectores_de_tiempo(grilla: &Grilla, tiempo: &[Option<f64>]) -> Vec<Sector> {
    let Some(&longitud) = grilla.s.last() else {
        return (1..=N_SECTORES)
            .map(|numero| Sector {
                numero,
                s_ini: 0.0,
                s_fin: 0.0,
                tiempo_s: f64::NAN,
            })
            .collect();
    };

    if !longitud.is_finite() || longitud <= 0.0 {
        return (1..=N_SECTORES)
            .map(|numero| Sector {
                numero,
                s_ini: 0.0,
                s_fin: 0.0,
                tiempo_s: f64::NAN,
            })
            .collect();
    }

    let corte = longitud / N_SECTORES as f64;
    let mut cortes: Vec<f64> = (0..=N_SECTORES).map(|i| i as f64 * corte).collect();
    if let Some(ultimo) = cortes.last_mut() {
        *ultimo = longitud;
    }
    let tiempos: Vec<Option<f64>> = cortes
        .iter()
        .map(|&arco| interpolar_en(grilla, tiempo, arco))
        .collect();

    (0..N_SECTORES)
        .map(|indice| {
            let tiempo_s = match (tiempos[indice], tiempos[indice + 1]) {
                (Some(inicio), Some(fin)) if fin >= inicio => fin - inicio,
                _ => f64::NAN,
            };
            Sector {
                numero: indice + 1,
                s_ini: cortes[indice],
                s_fin: cortes[indice + 1],
                tiempo_s,
            }
        })
        .collect()
}

/// Tiempos de los tres sectores de una vuelta (s).
pub fn tiempos_por_sector(vuelta: &Vuelta, grilla: &Grilla) -> Vec<f64> {
    sectores_de_vuelta(vuelta, grilla)
        .into_iter()
        .map(|sector| sector.tiempo_s)
        .collect()
}

/// Mejor tiempo de cada sector y vuelta teórica resultante.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct VueltaTeorica {
    /// Mejor tiempo de cada sector; `NaN` si ninguna vuelta lo cubre.
    pub sectores: Vec<f64>,
    /// Suma de los mejores sectores (s); `NaN` si falta alguno.
    pub total_s: f64,
    /// Mejor tiempo real entre las vueltas consideradas (s).
    pub mejor_real_s: f64,
    /// `mejor_real_s - total_s` (s); positivo = margen a ganar.
    pub potencial_s: f64,
}

/// Combina el mejor tiempo de cada sector de las vueltas válidas.
///
/// Solo se consideran vueltas válidas y con tiempo finito, igual que el
/// selector de v1. Si falta un sector, el total y el potencial quedan `NaN`.
pub fn vuelta_teorica(vueltas: &[&Vuelta], grilla: &Grilla) -> VueltaTeorica {
    let mut mejores = vec![f64::NAN; N_SECTORES];
    let mut mejor_real = f64::NAN;

    for vuelta in vueltas.iter().filter(|vuelta| vuelta.valida) {
        if vuelta.tiempo_s.is_finite() && vuelta.tiempo_s > 0.0 {
            mejor_real = if mejor_real.is_finite() {
                mejor_real.min(vuelta.tiempo_s)
            } else {
                vuelta.tiempo_s
            };
        }

        for (indice, sector) in sectores_de_vuelta(vuelta, grilla).iter().enumerate() {
            if !sector.tiempo_s.is_finite() {
                continue;
            }
            mejores[indice] = if mejores[indice].is_finite() {
                mejores[indice].min(sector.tiempo_s)
            } else {
                sector.tiempo_s
            };
        }
    }

    let total_s = if mejores.iter().all(|valor| valor.is_finite()) {
        mejores.iter().sum()
    } else {
        f64::NAN
    };
    let potencial_s = if mejor_real.is_finite() && total_s.is_finite() {
        mejor_real - total_s
    } else {
        f64::NAN
    };

    VueltaTeorica {
        sectores: mejores,
        total_s,
        mejor_real_s: mejor_real,
        potencial_s,
    }
}
