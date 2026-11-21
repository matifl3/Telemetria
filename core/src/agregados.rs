//! Agregados de la pestaña Conjunto (RF-011, RF-014).
//!
//! Todas las funciones reciben las vueltas ya seleccionadas. Para respetar
//! RF-014, [`conjunto`] filtra únicamente las vueltas válidas del auto dueño de
//! la REF; los gráficos de conjunto no deben mezclar autos.

use crate::alineado::{VueltaAlineada, alinear_vuelta};
use crate::grilla::Grilla;
use crate::vuelta::{G, Vuelta, VueltaId};

/// Cantidad de barras del histograma de velocidad.
pub const BINS_VELOCIDAD: usize = 30;

/// Vuelta ordenada por tiempo, con su diferencia respecto de la mejor.
#[derive(Debug, Clone, PartialEq)]
pub struct TiempoOrdenado {
    pub id: VueltaId,
    pub etiqueta: String,
    pub tiempo_s: f64,
    /// `tiempo_s - mejor` (s); la mejor vuelta vale 0.
    pub delta_s: f64,
}

/// Ordena de mejor a peor y calcula el delta contra la mejor.
///
/// Se ignoran las vueltas sin tiempo positivo. El orden es estable para tiempos
/// iguales.
pub fn tiempos_ordenados(vueltas: &[&Vuelta]) -> Vec<TiempoOrdenado> {
    let mut datos: Vec<TiempoOrdenado> = vueltas
        .iter()
        .filter(|vuelta| vuelta.tiempo_s.is_finite() && vuelta.tiempo_s > 0.0)
        .map(|vuelta| TiempoOrdenado {
            id: vuelta.id,
            etiqueta: vuelta.etiqueta.clone(),
            tiempo_s: vuelta.tiempo_s,
            delta_s: f64::NAN,
        })
        .collect();

    datos.sort_by(|a, b| a.tiempo_s.total_cmp(&b.tiempo_s));
    let mejor = datos.first().map(|dato| dato.tiempo_s);
    for dato in &mut datos {
        dato.delta_s = mejor.map_or(f64::NAN, |mejor| dato.tiempo_s - mejor);
    }
    datos
}

/// Velocidad media y máxima de una vuelta sobre la grilla.
#[derive(Debug, Clone, PartialEq)]
pub struct VelocidadVuelta {
    pub id: VueltaId,
    pub etiqueta: String,
    pub media_kmh: f64,
    pub maxima_kmh: f64,
}

/// Calcula velocidad media y máxima de una vuelta.
pub fn velocidad_media_max(vuelta: &Vuelta, grilla: &Grilla) -> VelocidadVuelta {
    resumen_velocidad(vuelta, &alinear_vuelta(vuelta, grilla))
}

/// Calcula velocidad media y máxima de cada vuelta.
pub fn velocidades(vueltas: &[&Vuelta], grilla: &Grilla) -> Vec<VelocidadVuelta> {
    vueltas
        .iter()
        .map(|vuelta| resumen_velocidad(vuelta, &alinear_vuelta(vuelta, grilla)))
        .collect()
}

fn resumen_velocidad(vuelta: &Vuelta, alineada: &VueltaAlineada) -> VelocidadVuelta {
    let valores: Vec<f64> = alineada
        .velocidad_kmh
        .iter()
        .flatten()
        .map(|&valor| valor as f64)
        .filter(|valor| valor.is_finite())
        .collect();
    let media_kmh = if valores.is_empty() {
        0.0
    } else {
        valores.iter().sum::<f64>() / valores.len() as f64
    };
    let maxima_kmh = valores.iter().copied().fold(0.0, f64::max);

    VelocidadVuelta {
        id: vuelta.id,
        etiqueta: vuelta.etiqueta.clone(),
        media_kmh,
        maxima_kmh,
    }
}

/// Banda mínima, promedio y máxima de velocidad por punto de la grilla.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EnvolventeVelocidad {
    pub s: Vec<f64>,
    pub minimo: Vec<Option<f64>>,
    pub promedio: Vec<Option<f64>>,
    pub maximo: Vec<Option<f64>>,
}

/// Construye la envolvente de velocidad de las vueltas recibidas.
pub fn envolvente_velocidad(vueltas: &[&Vuelta], grilla: &Grilla) -> EnvolventeVelocidad {
    let alineadas: Vec<VueltaAlineada> = vueltas
        .iter()
        .map(|vuelta| alinear_vuelta(vuelta, grilla))
        .collect();
    let puntos = grilla.puntos();
    let mut minimo = vec![None; puntos];
    let mut promedio = vec![None; puntos];
    let mut maximo = vec![None; puntos];

    for indice in 0..puntos {
        let mut suma = 0.0;
        let mut cantidad = 0usize;
        let mut minimo_punto = f64::INFINITY;
        let mut maximo_punto = f64::NEG_INFINITY;

        for alineada in &alineadas {
            let Some(valor) = alineada.velocidad_kmh.get(indice).copied().flatten() else {
                continue;
            };
            let valor = valor as f64;
            if !valor.is_finite() {
                continue;
            }
            suma += valor;
            cantidad += 1;
            minimo_punto = minimo_punto.min(valor);
            maximo_punto = maximo_punto.max(valor);
        }

        if cantidad > 0 {
            minimo[indice] = Some(minimo_punto);
            promedio[indice] = Some(suma / cantidad as f64);
            maximo[indice] = Some(maximo_punto);
        }
    }

    EnvolventeVelocidad {
        s: grilla.s.clone(),
        minimo,
        promedio,
        maximo,
    }
}

/// Histograma de velocidad con bins uniformes entre 0 y la máxima.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HistogramaVelocidad {
    pub maxima_kmh: f64,
    /// `BINS_VELOCIDAD` conteos.
    pub conteos: Vec<usize>,
    /// Muestras válidas contabilizadas.
    pub total: usize,
}

/// Histograma de las muestras crudas de velocidad de las vueltas.
pub fn histograma_velocidad(vueltas: &[&Vuelta]) -> HistogramaVelocidad {
    let valores: Vec<f64> = vueltas
        .iter()
        .flat_map(|vuelta| vuelta.muestras.speed_kmh.iter())
        .map(|&valor| valor as f64)
        .filter(|valor| valor.is_finite())
        .collect();

    let maxima_kmh = valores.iter().copied().fold(0.0, f64::max);
    let mut conteos = vec![0usize; BINS_VELOCIDAD];
    for valor in &valores {
        let proporcion = if maxima_kmh > 0.0 {
            valor / maxima_kmh
        } else {
            0.0
        };
        let bin = (proporcion * BINS_VELOCIDAD as f64).floor();
        let bin = bin.clamp(0.0, (BINS_VELOCIDAD - 1) as f64) as usize;
        conteos[bin] += 1;
    }

    HistogramaVelocidad {
        maxima_kmh,
        conteos,
        total: valores.len(),
    }
}

/// Histograma de marchas; hay una barra por marcha presente.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HistogramaMarchas {
    pub minima: u8,
    pub maxima: u8,
    pub conteos: Vec<usize>,
    /// Muestras válidas contabilizadas.
    pub total: usize,
}

/// Histograma de las muestras crudas de marcha de las vueltas.
pub fn histograma_marchas(vueltas: &[&Vuelta]) -> HistogramaMarchas {
    let marchas: Vec<u8> = vueltas
        .iter()
        .flat_map(|vuelta| vuelta.muestras.marcha.iter().copied())
        .collect();
    let Some(&minima) = marchas.iter().min() else {
        return HistogramaMarchas::default();
    };
    let maxima = *marchas.iter().max().unwrap();
    let mut conteos = vec![0usize; (maxima - minima + 1) as usize];
    for marcha in &marchas {
        conteos[(marcha - minima) as usize] += 1;
    }

    HistogramaMarchas {
        minima,
        maxima,
        conteos,
        total: marchas.len(),
    }
}

/// Combustible consumido durante una vuelta.
#[derive(Debug, Clone, PartialEq)]
pub struct ConsumoCombustible {
    pub id: VueltaId,
    pub etiqueta: String,
    /// `primera - última` muestra, acotado a 0 (unidades del juego).
    pub consumo: f64,
}

/// Consumo de una vuelta: diferencia entre la primera y la última muestra.
///
/// Se ignoran valores no finitos. Con menos de dos muestras no se puede
/// calcular y devuelve `NaN`; un aumento de combustible no produce consumo
/// negativo.
pub fn consumo_de_vuelta(vuelta: &Vuelta) -> f64 {
    let valores: Vec<f64> = vuelta
        .muestras
        .gasolina
        .iter()
        .map(|&valor| valor as f64)
        .filter(|valor| valor.is_finite())
        .collect();
    let Some(&primero) = valores.first() else {
        return f64::NAN;
    };
    let Some(&ultimo) = valores.last() else {
        return f64::NAN;
    };
    if valores.len() < 2 {
        return f64::NAN;
    }
    (primero - ultimo).max(0.0)
}

/// Consumo de combustible de cada vuelta.
pub fn consumos(vueltas: &[&Vuelta]) -> Vec<ConsumoCombustible> {
    vueltas
        .iter()
        .map(|vuelta| ConsumoCombustible {
            id: vuelta.id,
            etiqueta: vuelta.etiqueta.clone(),
            consumo: consumo_de_vuelta(vuelta),
        })
        .collect()
}

/// Separación lateral de una vuelta respecto de la REF en cada punto.
#[derive(Debug, Clone, PartialEq)]
pub struct DesvioLateral {
    pub id: VueltaId,
    pub etiqueta: String,
    /// Distancia en el plano `x`/`z` por punto de la grilla (m).
    pub valores: Vec<Option<f64>>,
}

/// Calcula la separación lateral de cada vuelta contra la REF.
///
/// La REF se excluye de la lista de comparadas. Un punto sin posición válida en
/// cualquiera de las dos vueltas queda `None`.
pub fn desvio_lateral(
    referencia: &Vuelta,
    comparadas: &[&Vuelta],
    grilla: &Grilla,
) -> Vec<DesvioLateral> {
    let ref_alineada = alinear_vuelta(referencia, grilla);

    comparadas
        .iter()
        .filter(|vuelta| vuelta.id != referencia.id)
        .map(|vuelta| {
            let alineada = alinear_vuelta(vuelta, grilla);
            let valores = (0..grilla.puntos())
                .map(|indice| {
                    let x_ref = ref_alineada.x.get(indice).copied().flatten()? as f64;
                    let z_ref = ref_alineada.z.get(indice).copied().flatten()? as f64;
                    let x = alineada.x.get(indice).copied().flatten()? as f64;
                    let z = alineada.z.get(indice).copied().flatten()? as f64;
                    Some((x - x_ref).hypot(z - z_ref))
                })
                .collect();
            DesvioLateral {
                id: vuelta.id,
                etiqueta: vuelta.etiqueta.clone(),
                valores,
            }
        })
        .collect()
}

/// Fila de la tabla resumen con las 9 columnas de v1 y el delta al mejor.
#[derive(Debug, Clone, PartialEq)]
pub struct FilaResumen {
    pub id: VueltaId,
    pub etiqueta: String,
    pub tiempo_s: f64,
    /// Diferencia contra la mejor vuelta de la lista (s).
    pub delta_mejor_s: f64,
    pub velocidad_media_kmh: f64,
    pub velocidad_maxima_kmh: f64,
    /// Acelerador medio 0..1.
    pub gas_medio: f64,
    /// Freno medio 0..1.
    pub freno_medio: f64,
    /// Máximo de `|acc_lat|` en g.
    pub g_lat_max: f64,
    pub rpm_medio: f64,
    /// Combustible consumido (unidades del juego); `NaN` sin datos suficientes.
    pub combustible_usado: f64,
}

/// Arma la tabla resumen preservando el orden de las vueltas recibidas.
pub fn tabla_resumen(vueltas: &[&Vuelta], grilla: &Grilla) -> Vec<FilaResumen> {
    let filas: Vec<FilaResumen> = vueltas
        .iter()
        .map(|vuelta| {
            let alineada = alinear_vuelta(vuelta, grilla);
            let velocidad = resumen_velocidad(vuelta, &alineada);
            FilaResumen {
                id: vuelta.id,
                etiqueta: vuelta.etiqueta.clone(),
                tiempo_s: vuelta.tiempo_s,
                delta_mejor_s: f64::NAN,
                velocidad_media_kmh: velocidad.media_kmh,
                velocidad_maxima_kmh: velocidad.maxima_kmh,
                gas_medio: promedio(&alineada.gas),
                freno_medio: promedio(&alineada.freno),
                g_lat_max: maximo_absoluto(&alineada.acc_lat) / G as f64,
                rpm_medio: promedio(&alineada.rpm),
                combustible_usado: consumo_de_vuelta(vuelta),
            }
        })
        .collect();

    let mejor = filas
        .iter()
        .map(|fila| fila.tiempo_s)
        .filter(|tiempo| tiempo.is_finite() && *tiempo > 0.0)
        .reduce(f64::min);

    filas
        .into_iter()
        .map(|mut fila| {
            fila.delta_mejor_s = mejor.map_or(f64::NAN, |mejor| fila.tiempo_s - mejor);
            fila
        })
        .collect()
}

/// Vueltas válidas del auto dueño de la REF, sin mezclar autos (RF-014).
pub fn conjunto(vueltas: &[Vuelta], referencia: VueltaId) -> Vec<&Vuelta> {
    let Some(vuelta_ref) = vueltas.iter().find(|vuelta| vuelta.id == referencia) else {
        return Vec::new();
    };
    let auto = vuelta_ref.id.auto;
    vueltas
        .iter()
        .filter(|vuelta| vuelta.valida && vuelta.id.auto == auto)
        .collect()
}

fn promedio(serie: &[Option<f32>]) -> f64 {
    let mut suma = 0.0;
    let mut cantidad = 0usize;
    for valor in serie.iter().flatten() {
        let valor = *valor as f64;
        if valor.is_finite() {
            suma += valor;
            cantidad += 1;
        }
    }
    if cantidad > 0 {
        suma / cantidad as f64
    } else {
        0.0
    }
}

fn maximo_absoluto(serie: &[Option<f32>]) -> f64 {
    serie
        .iter()
        .flatten()
        .map(|valor| (*valor as f64).abs())
        .filter(|valor| valor.is_finite())
        .fold(0.0, f64::max)
}
