//! Proyección de posiciones al arco de pista `s` (RF-015, D-06).
//!
//! Cada muestra se busca sobre la línea central de `fast_lane.ai` y recibe el
//! arco del punto más cercano. La búsqueda es local alrededor del índice previo
//! (O(n·w)) con un barrido global de respaldo. Si el punto queda más lejos que
//! [`UMBRAL_ERROR_M`], no se inventa una `s`: la muestra queda como hueco
//! (`NaN`) para que el remuestreo la trate como faltante.
//!
//! El cruce de meta se resuelve sumando [`Pista::longitud_m`] cuando `s` cae más
//! de media pista respecto de la muestra anterior; al final la vuelta se re-basa
//! a 0 y `s` queda monótona no decreciente.

use crate::error::{ErrorFormato, Motivo};
use crate::modelo::Auto;
use crate::pista::Pista;
use crate::vuelta::{recalcular_metricas, Vuelta};

/// Puntos a cada lado del índice previo que revisa la ventana local.
pub const VENTANA_PUNTOS: usize = 64;
/// Distancia máxima a la línea central para aceptar una muestra (m).
pub const UMBRAL_ERROR_M: f32 = 20.0;
/// Fracción máxima de muestras descartadas antes de declarar la vuelta no
/// analizable.
pub const MUESTRAS_DESCARTADAS_MAX: f64 = 0.10;

/// Resultado de proyectar una sola muestra.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Proyeccion {
    /// Índice del punto más cercano de la línea central.
    pub indice: usize,
    /// Distancia al punto más cercano (m).
    pub error_m: f32,
    /// Arco de pista del punto más cercano (m); `None` si la muestra quedó
    /// fuera de pista.
    pub s: Option<f64>,
    /// Comparaciones de distancia realizadas (ventana + respaldo global).
    pub comparaciones: usize,
}

/// Resultado de proyectar una serie completa de posiciones.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProyeccionSerie {
    /// Arco de pista por muestra (m). Los huecos son `NaN`.
    pub s: Vec<f64>,
    /// Índice de pista más cercano por muestra, incluso en los huecos.
    pub indices: Vec<usize>,
    /// Distancia a la línea central por muestra (m).
    pub errores_m: Vec<f32>,
    /// Muestras descartadas por quedar fuera del umbral.
    pub descartadas: usize,
    /// Comparaciones de distancia acumuladas.
    pub comparaciones: usize,
}

impl ProyeccionSerie {
    /// Cantidad de muestras proyectadas.
    pub fn total(&self) -> usize {
        self.s.len()
    }
}

/// Proyecta `(x, z)` sobre la línea central de `pista`.
///
/// Si `idx_previo` es válido se busca primero en una ventana local; cuando esa
/// ventana no encuentra la pista (error mayor que [`UMBRAL_ERROR_M`]) se hace el
/// barrido global de respaldo.
pub fn proyectar(pista: &Pista, x: f32, z: f32, idx_previo: Option<usize>) -> Proyeccion {
    let puntos = pista.puntos();
    if puntos == 0 || !x.is_finite() || !z.is_finite() {
        return Proyeccion {
            indice: 0,
            error_m: f32::INFINITY,
            s: None,
            comparaciones: 0,
        };
    }

    let x = x as f64;
    let z = z as f64;
    let (indice, error, comparaciones) = match idx_previo {
        Some(centro) if centro < puntos => {
            let (indice_local, error_local, comparaciones_local) =
                buscar_ventana(pista, x, z, centro);
            if error_local <= UMBRAL_ERROR_M as f64 {
                (indice_local, error_local, comparaciones_local)
            } else {
                let (indice_global, error_global, comparaciones_global) =
                    buscar_global(pista, x, z);
                (
                    indice_global,
                    error_global,
                    comparaciones_local + comparaciones_global,
                )
            }
        }
        _ => buscar_global(pista, x, z),
    };

    Proyeccion {
        indice,
        error_m: error as f32,
        s: (error <= UMBRAL_ERROR_M as f64).then(|| pista.ns[indice] as f64),
        comparaciones,
    }
}

/// Proyecta todas las muestras de `x`/`z` en orden de recorrido.
///
/// Usa el índice de la muestra anterior como centro de la ventana local. Las
/// muestras fuera de pista se guardan como `NaN` y se cuentan en
/// [`ProyeccionSerie::descartadas`].
pub fn proyectar_serie(pista: &Pista, x: &[f32], z: &[f32]) -> ProyeccionSerie {
    let total = x.len().min(z.len());
    let mut serie = ProyeccionSerie {
        s: Vec::with_capacity(total),
        indices: Vec::with_capacity(total),
        errores_m: Vec::with_capacity(total),
        descartadas: 0,
        comparaciones: 0,
    };

    let mut previo: Option<usize> = None;
    for i in 0..total {
        let proyeccion = proyectar(pista, x[i], z[i], previo);
        serie.comparaciones += proyeccion.comparaciones;
        match proyeccion.s {
            Some(s) => serie.s.push(s),
            None => {
                serie.s.push(f64::NAN);
                serie.descartadas += 1;
            }
        }
        serie.indices.push(proyeccion.indice);
        serie.errores_m.push(proyeccion.error_m);
        previo = Some(proyeccion.indice);
    }

    serie
}

/// Proyecta las posiciones de un auto completo.
pub fn proyectar_auto(pista: &Pista, auto: &Auto) -> ProyeccionSerie {
    proyectar_serie(pista, &auto.muestras.x, &auto.muestras.z)
}

/// Desenrolla el cruce de meta y re-basa la serie para que arranque en 0.
///
/// `s` se modifica in situ: los valores finitos pasan a ser monótonos no
/// decrecientes y el primero queda en 0. Los huecos (`NaN`) se conservan.
/// Devuelve el arco que se restó a todas las muestras.
pub fn ajustar_meta(longitud_m: f64, s: &mut [f64]) -> f64 {
    let media_pista = if longitud_m.is_finite() && longitud_m > 0.0 {
        longitud_m / 2.0
    } else {
        0.0
    };
    let puede_desenrollar = media_pista > 0.0;

    let mut anterior: Option<f64> = None;
    let mut base: Option<f64> = None;

    for valor in s.iter_mut() {
        if !valor.is_finite() {
            continue;
        }

        let mut actual = *valor;
        if let Some(previo) = anterior {
            if puede_desenrollar {
                while actual < previo - media_pista {
                    actual += longitud_m;
                }
                while actual > previo + media_pista {
                    actual -= longitud_m;
                }
            }
            // La invariante de la v2 es que `s` no retrocede.
            if actual < previo {
                actual = previo;
            }
        }

        if base.is_none() {
            base = Some(actual);
        }
        *valor = actual;
        anterior = Some(actual);
    }

    let base = base.unwrap_or(0.0);
    for valor in s.iter_mut() {
        if valor.is_finite() {
            *valor -= base;
        }
    }
    base
}

/// Ajusta a la pista una vuelta ya construida (fase 3).
///
/// Desenrolla la meta, re-basa a 0, cuenta los huecos en
/// [`Vuelta::errores_proyeccion`] y recalcula tiempo, cobertura y velocidad
/// media. Si se descartó más de [`MUESTRAS_DESCARTADAS_MAX`] de las muestras,
/// la vuelta deja de ser válida y se devuelve el aviso
/// [`Motivo::ProyeccionDeficiente`].
pub fn ajustar_vuelta(pista: &Pista, vuelta: &mut Vuelta, archivo: &str) -> Option<ErrorFormato> {
    ajustar_meta(pista.longitud_m, &mut vuelta.muestras.s);

    let total = vuelta.muestras.s.len();
    let descartadas = vuelta
        .muestras
        .s
        .iter()
        .filter(|valor| !valor.is_finite())
        .count();
    vuelta.errores_proyeccion = descartadas;
    recalcular_metricas(vuelta);

    if proyeccion_deficiente(vuelta) {
        vuelta.valida = false;
        vuelta.seleccionable = false;
        return Some(ErrorFormato::nuevo(
            archivo,
            Motivo::ProyeccionDeficiente { descartadas, total },
        ));
    }

    None
}

/// Indica si una vuelta supera [`MUESTRAS_DESCARTADAS_MAX`].
///
/// La clasificación usa este criterio para no volver a marcar como válida una
/// vuelta que la proyección ya descartó.
pub fn proyeccion_deficiente(vuelta: &Vuelta) -> bool {
    let total = vuelta.muestras.s.len();
    total > 0 && vuelta.errores_proyeccion as f64 / total as f64 > MUESTRAS_DESCARTADAS_MAX
}

/// Mejor índice dentro de la ventana local alrededor de `centro`.
fn buscar_ventana(pista: &Pista, x: f64, z: f64, centro: usize) -> (usize, f64, usize) {
    let puntos = pista.puntos();
    let radio = VENTANA_PUNTOS.min(puntos / 2);
    let mut mejor = centro % puntos;
    let mut mejor_distancia = f64::INFINITY;
    let mut comparaciones = 0;

    for salto in -(radio as isize)..=(radio as isize) {
        let indice = (centro as isize + salto).rem_euclid(puntos as isize) as usize;
        let distancia = distancia_cuadrada(pista, indice, x, z);
        comparaciones += 1;
        if distancia < mejor_distancia {
            mejor_distancia = distancia;
            mejor = indice;
        }
    }

    (mejor, mejor_distancia.sqrt(), comparaciones)
}

/// Mejor índice del barrido completo de la línea central.
fn buscar_global(pista: &Pista, x: f64, z: f64) -> (usize, f64, usize) {
    let mut mejor = 0;
    let mut mejor_distancia = f64::INFINITY;

    for indice in 0..pista.puntos() {
        let distancia = distancia_cuadrada(pista, indice, x, z);
        if distancia < mejor_distancia {
            mejor_distancia = distancia;
            mejor = indice;
        }
    }

    (mejor, mejor_distancia.sqrt(), pista.puntos())
}

/// Distancia al cuadrado en el plano `x`/`z` (la altura no interviene).
fn distancia_cuadrada(pista: &Pista, indice: usize, x: f64, z: f64) -> f64 {
    let dx = pista.nx[indice] as f64 - x;
    let dz = pista.nz[indice] as f64 - z;
    dx * dx + dz * dz
}
