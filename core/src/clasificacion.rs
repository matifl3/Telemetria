//! Clasificación de vueltas por auto (RF-004, RF-005, RF-016).
//!
//! Porta `clasificarVueltas` de v1, pero agrupando por auto: medianas, umbral y
//! velocidad de referencia se calculan solo con las vueltas de cada auto (D-11).
//! Mezclar autos produce falsos salida/entrada/cortada.

use crate::proyeccion::proyeccion_deficiente;
use crate::vuelta::{MotivoVuelta, Vuelta};

/// Una vuelta cortada recorre menos de este porcentaje de la mediana del auto.
pub const COBERTURA_MINIMA_REL: f64 = 0.90;
/// Una vuelta de borde es lenta si no llega a este porcentaje de la velocidad
/// de referencia del auto.
pub const VELOCIDAD_BORDE_REL: f64 = 0.75;

/// Clasifica **in situ** todas las vueltas, agrupadas por auto.
///
/// Cada grupo usa sus propias medianas y bordes. La primera y la última vuelta
/// de cada auto son bordes (salida y entrada); una vuelta cortada en un borde
/// queda como `Incompleta`. Las inválidas no son seleccionables (RF-016).
pub fn clasificar_vueltas(vueltas: &mut [Vuelta]) {
    let mut autos: Vec<usize> = Vec::new();
    for vuelta in vueltas.iter() {
        if !autos.contains(&vuelta.id.auto) {
            autos.push(vuelta.id.auto);
        }
    }

    for auto in autos {
        let indices: Vec<usize> = vueltas
            .iter()
            .enumerate()
            .filter(|(_, vuelta)| vuelta.id.auto == auto)
            .map(|(indice, _)| indice)
            .collect();
        clasificar_grupo(vueltas, &indices);
    }
}

/// Clasifica un grupo de vueltas de un mismo auto.
///
/// Una vuelta con proyección deficiente (fase 4) queda no analizable aunque su
/// cobertura alcance la mediana: esa decisión no se revierte acá.
fn clasificar_grupo(vueltas: &mut [Vuelta], indices: &[usize]) {
    if indices.len() < 2 {
        for &indice in indices {
            let deficiente = proyeccion_deficiente(&vueltas[indice]);
            let motivo = vueltas[indice].motivo;
            marcar(vueltas, indice, !deficiente, motivo);
        }
        return;
    }

    let referencia = cobertura_mediana(vueltas, indices);
    let velocidad_referencia = velocidad_de_referencia(vueltas, indices, referencia);
    let ultimo = indices.len() - 1;

    for (posicion, &indice) in indices.iter().enumerate() {
        if proyeccion_deficiente(&vueltas[indice]) {
            let motivo = vueltas[indice].motivo;
            marcar(vueltas, indice, false, motivo);
            continue;
        }

        let vuelta = &vueltas[indice];
        let cobertura = vuelta.cobertura_s_m;
        let velocidad = vuelta.vel_media_mps;

        let cortada = referencia > 0.0
            && cobertura.is_finite()
            && cobertura < COBERTURA_MINIMA_REL * referencia;
        let borde = posicion == 0 || posicion == ultimo;
        let lenta = borde
            && velocidad_referencia > 0.0
            && velocidad.is_finite()
            && velocidad < VELOCIDAD_BORDE_REL * velocidad_referencia;

        if lenta {
            let motivo = if posicion == 0 {
                MotivoVuelta::Salida
            } else {
                MotivoVuelta::Entrada
            };
            marcar(vueltas, indice, false, motivo);
        } else if cortada {
            let motivo = if borde {
                MotivoVuelta::Incompleta
            } else {
                MotivoVuelta::Cortada
            };
            marcar(vueltas, indice, false, motivo);
        } else {
            marcar(vueltas, indice, true, MotivoVuelta::Ninguno);
        }
    }
}

/// Mediana de coberturas del grupo, con el criterio de v1.
///
/// v1 tomaba el valor central superior con cantidad par; se conserva para no
/// cambiar qué vueltas se marcan como salida/entrada/cortada.
fn cobertura_mediana(vueltas: &[Vuelta], indices: &[usize]) -> f64 {
    let mut valores: Vec<f64> = indices
        .iter()
        .filter(|&&indice| !proyeccion_deficiente(&vueltas[indice]))
        .map(|&indice| vueltas[indice].cobertura_s_m)
        .filter(|valor| valor.is_finite())
        .collect();
    valores.sort_by(|a, b| a.total_cmp(b));
    valores.get(valores.len() / 2).copied().unwrap_or(0.0)
}

/// Mayor velocidad media entre las vueltas que cubren al menos el 90 % de la
/// mediana del auto. Con ninguna candidata, 0 (v1).
fn velocidad_de_referencia(vueltas: &[Vuelta], indices: &[usize], referencia: f64) -> f64 {
    if referencia <= 0.0 {
        return 0.0;
    }

    indices
        .iter()
        .filter_map(|&indice| {
            let vuelta = &vueltas[indice];
            (!proyeccion_deficiente(vuelta)
                && vuelta.cobertura_s_m >= COBERTURA_MINIMA_REL * referencia
                && vuelta.vel_media_mps.is_finite())
            .then_some(vuelta.vel_media_mps)
        })
        .fold(0.0, f64::max)
}

fn marcar(vueltas: &mut [Vuelta], indice: usize, valida: bool, motivo: MotivoVuelta) {
    let vuelta = &mut vueltas[indice];
    vuelta.valida = valida;
    vuelta.motivo = motivo;
    vuelta.seleccionable = valida;
}
