//! Consistencia entre vueltas del mismo auto (ING36–ING40).
//!
//! Ámbito: las vueltas válidas del auto de la REF, como "Conjunto". Las vueltas
//! más lentas que [`CONSISTENCIA_CORTE`] × la mejor se excluyen para que un
//! trompo o un tráfico no arruinen la estadística.

use crate::alineado::VueltaAlineada;
use crate::curvas::CurvaPista;
use crate::fases::FasesCurva;
use crate::senales::{
    desvio_estandar, envolver_distancia, puntos_de_tramo, tiempo_en_tramo, valor,
};

/// Tiempo máximo relativo a la mejor vuelta para entrar en la estadística.
pub const CONSISTENCIA_CORTE: f64 = 1.07;
/// Vueltas útiles mínimas para calcular consistencia.
pub const CONSISTENCIA_VUELTAS_MIN: usize = 3;
/// Rangos de referencia para elegir la explicación de cada curva.
pub const REFERENCIA_FRENADA_M: f64 = 10.0;
pub const REFERENCIA_GAS_M: f64 = 15.0;
pub const REFERENCIA_V_MIN_KMH: f64 = 3.0;

/// Una vuelta candidata.
pub struct VueltaConsistencia<'a> {
    pub tiempo_s: f64,
    pub alineada: &'a VueltaAlineada,
    pub fases: &'a [FasesCurva],
}

/// Dispersión de una curva entre vueltas.
#[derive(Debug, Clone, PartialEq)]
pub struct ConsistenciaCurva {
    pub n: usize,
    pub nombre: String,
    /// Desvío del tiempo dentro del arco geométrico de la curva (s).
    pub desvio_t_curva_s: f64,
    pub desvio_inicio_frenada_m: f64,
    pub rango_inicio_frenada_m: f64,
    pub desvio_v_min_kmh: f64,
    pub rango_v_min_kmh: f64,
    pub desvio_gas_fondo_m: f64,
    pub rango_gas_fondo_m: f64,
    /// La métrica que más varía, en palabras.
    pub explicacion: String,
}

/// Consistencia de la sesión.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Consistencia {
    pub vueltas_usadas: usize,
    pub vueltas_excluidas: usize,
    /// Mensaje en lugar de estadística cuando faltan vueltas (ING39).
    pub aviso: Option<String>,
    /// Curvas de la más inconsistente a la más consistente (ING38).
    pub curvas: Vec<ConsistenciaCurva>,
    /// Desvío de la velocidad por punto de la grilla (km/h) (ING37).
    pub desvio_velocidad: Vec<Option<f64>>,
}

/// Calcula la consistencia (ING36–ING39).
pub fn consistencia(vueltas: &[VueltaConsistencia<'_>], curvas: &[CurvaPista]) -> Consistencia {
    let mejor = vueltas
        .iter()
        .map(|v| v.tiempo_s)
        .filter(|t| t.is_finite() && *t > 0.0)
        .fold(f64::INFINITY, f64::min);
    let usadas: Vec<&VueltaConsistencia<'_>> = vueltas
        .iter()
        .filter(|v| v.tiempo_s.is_finite() && v.tiempo_s <= mejor * CONSISTENCIA_CORTE + 1e-9)
        .collect();
    let excluidas = vueltas.len() - usadas.len();

    if usadas.len() < CONSISTENCIA_VUELTAS_MIN {
        return Consistencia {
            vueltas_usadas: usadas.len(),
            vueltas_excluidas: excluidas,
            aviso: Some(format!(
                "Hacen falta al menos {CONSISTENCIA_VUELTAS_MIN} vueltas válidas del mismo auto \
                 (dentro del {:.0} % de la mejor) para medir consistencia; hay {}.",
                CONSISTENCIA_CORTE * 100.0,
                usadas.len()
            )),
            ..Consistencia::default()
        };
    }

    let s = &usadas[0].alineada.s;
    let longitud = s.last().copied().unwrap_or(0.0);

    let mut filas: Vec<ConsistenciaCurva> = curvas
        .iter()
        .map(|curva| {
            let tiempos: Vec<f64> = usadas
                .iter()
                .map(|v| {
                    let puntos = puntos_de_tramo(&v.alineada.s, curva.s_ini, curva.s_fin);
                    if puntos.len() < 2 {
                        f64::NAN
                    } else {
                        tiempo_en_tramo(&puntos, &v.alineada.tiempo, 0, puntos.len() - 1)
                    }
                })
                .collect();
            let fases: Vec<Option<&FasesCurva>> = usadas
                .iter()
                .map(|v| v.fases.iter().find(|f| f.n == curva.n))
                .collect();
            let posiciones = |campo: fn(&FasesCurva) -> f64| -> Vec<f64> {
                let crudos: Vec<f64> = fases.iter().map(|f| f.map_or(f64::NAN, campo)).collect();
                desenrollar_posiciones(&crudos, longitud)
            };
            let frenadas = posiciones(|f| f.s_inicio_frenada);
            let gases = posiciones(|f| f.s_gas_fondo);
            let minimas: Vec<f64> = fases
                .iter()
                .map(|f| f.map_or(f64::NAN, |f| f.v_min))
                .collect();

            let rango_frenada = rango(&frenadas);
            let rango_gas = rango(&gases);
            let rango_v_min = rango(&minimas);
            let candidatos = [
                (
                    rango_frenada / REFERENCIA_FRENADA_M,
                    format!("Frena en un rango de {rango_frenada:.0} m"),
                ),
                (
                    rango_gas / REFERENCIA_GAS_M,
                    format!("Gas a fondo en un rango de {rango_gas:.0} m"),
                ),
                (
                    rango_v_min / REFERENCIA_V_MIN_KMH,
                    format!("La velocidad mínima varía {rango_v_min:.1} km/h"),
                ),
            ];
            let explicacion = candidatos
                .iter()
                .filter(|(peso, _)| peso.is_finite() && *peso >= 1.0)
                .max_by(|x, y| x.0.total_cmp(&y.0))
                .map_or_else(
                    || "Variación pequeña y repartida".to_string(),
                    |c| c.1.clone(),
                );

            ConsistenciaCurva {
                n: curva.n,
                nombre: curva.nombre.clone(),
                desvio_t_curva_s: desvio_estandar(&tiempos),
                desvio_inicio_frenada_m: desvio_estandar(&frenadas),
                rango_inicio_frenada_m: rango_frenada,
                desvio_v_min_kmh: desvio_estandar(&minimas),
                rango_v_min_kmh: rango_v_min,
                desvio_gas_fondo_m: desvio_estandar(&gases),
                rango_gas_fondo_m: rango_gas,
                explicacion,
            }
        })
        .collect();
    filas.sort_by(|x, y| {
        let a = if x.desvio_t_curva_s.is_finite() {
            x.desvio_t_curva_s
        } else {
            -1.0
        };
        let b = if y.desvio_t_curva_s.is_finite() {
            y.desvio_t_curva_s
        } else {
            -1.0
        };
        b.total_cmp(&a).then(x.n.cmp(&y.n))
    });

    let desvio_velocidad = (0..s.len())
        .map(|i| {
            let valores: Vec<f64> = usadas
                .iter()
                .filter_map(|v| valor(&v.alineada.velocidad_kmh, i))
                .collect();
            (valores.len() >= CONSISTENCIA_VUELTAS_MIN)
                .then(|| desvio_estandar(&valores))
                .filter(|d| d.is_finite())
        })
        .collect();

    Consistencia {
        vueltas_usadas: usadas.len(),
        vueltas_excluidas: excluidas,
        aviso: None,
        curvas: filas,
        desvio_velocidad,
    }
}

/// Posiciones en la pista sin el salto de la meta: relativas a la primera.
fn desenrollar_posiciones(valores: &[f64], longitud: f64) -> Vec<f64> {
    let Some(&primera) = valores.iter().find(|v| v.is_finite()) else {
        return valores.to_vec();
    };
    valores
        .iter()
        .map(|&v| {
            if v.is_finite() {
                primera + envolver_distancia(v - primera, longitud)
            } else {
                v
            }
        })
        .collect()
}

fn rango(valores: &[f64]) -> f64 {
    let finitos: Vec<f64> = valores.iter().copied().filter(|v| v.is_finite()).collect();
    if finitos.len() < 2 {
        return f64::NAN;
    }
    let min = finitos.iter().copied().fold(f64::INFINITY, f64::min);
    let max = finitos.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    max - min
}
