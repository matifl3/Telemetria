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

/// Invalida las vueltas que recorren menos de [`COBERTURA_MINIMA_REL`] del
/// largo de la pista.
///
/// Complementa a [`clasificar_vueltas`]: la mediana del auto no detecta cortes
/// cuando **todas** sus vueltas son parciales (autos que entran o salen de la
/// sesión). La primera y la última de cada auto quedan `Incompleta`; las del
/// medio, `Cortada`.
pub fn descartar_cortas_por_pista(vueltas: &mut [Vuelta], longitud_m: f64) {
    if !longitud_m.is_finite() || longitud_m <= 0.0 {
        return;
    }
    let minimo = COBERTURA_MINIMA_REL * longitud_m;

    for indice in 0..vueltas.len() {
        let vuelta = &vueltas[indice];
        let corta = vuelta.cobertura_s_m.is_finite() && vuelta.cobertura_s_m < minimo;
        if !vuelta.valida || !corta {
            continue;
        }
        let auto = vuelta.id.auto;
        let primera = !vueltas[..indice].iter().any(|v| v.id.auto == auto);
        let ultima = !vueltas[indice + 1..].iter().any(|v| v.id.auto == auto);
        let motivo = if primera || ultima {
            MotivoVuelta::Incompleta
        } else {
            MotivoVuelta::Cortada
        };
        marcar(vueltas, indice, false, motivo);
    }
}

/// Clasifica un grupo de vueltas de un mismo auto.
///
/// Una vuelta con proyección deficiente (fase 4) queda no analizable aunque su
/// cobertura alcance la mediana: esa decisión no se revierte acá.
///
/// Un auto con un único tramo nunca cruzó la meta dos veces: no tiene ninguna
/// vuelta completa y su tramo queda `Incompleta`.
fn clasificar_grupo(vueltas: &mut [Vuelta], indices: &[usize]) {
    if indices.len() < 2 {
        for &indice in indices {
            let motivo = if proyeccion_deficiente(&vueltas[indice]) {
                vueltas[indice].motivo
            } else {
                MotivoVuelta::Incompleta
            };
            marcar(vueltas, indice, false, motivo);
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
