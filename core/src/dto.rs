//! DTOs de salida para la UI (RF-012, RF-013, RF-014, RF-015).
//!
//! Cada pestaña pide solo los datos que dibuja (D-07). Los valores no finitos
//! se representan como `None` para que el JSON nunca contenga `NaN` (T95).

use serde::Serialize;

use crate::agregados::{self, BINS_VELOCIDAD};
use crate::alineado::alinear_vuelta;
use crate::comparacion;
use crate::curvas::{self, CanalesAlineados};
use crate::grilla::{grilla_de_pista, Grilla};
use crate::mapa::{self, Bounds, Proyeccion};
use crate::pista::Pista;
use crate::sectores::{sectores_de_vuelta, vuelta_teorica, N_SECTORES};
use crate::sesion::{CodigoAviso, Sesion};
use crate::vuelta::{MotivoVuelta, Vuelta, VueltaId};

const G: f64 = 9.806_65;

/// Identificador estable de una vuelta en el JSON.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DtoIdVuelta {
    pub auto: usize,
    pub numero_local: usize,
}

impl From<VueltaId> for DtoIdVuelta {
    fn from(id: VueltaId) -> Self {
        Self {
            auto: id.auto,
            numero_local: id.numero_local,
        }
    }
}

/// Código estable de aviso para la UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DtoCodigoAviso {
    VersionNoSoportada,
    ReplaySinVueltas,
    PistaInvalida,
    SinPista,
    ReferenciaFallback,
    ArchivoCorrupto,
    ExtensionNoSoportada,
    ProyeccionDeficiente,
}

impl From<CodigoAviso> for DtoCodigoAviso {
    fn from(codigo: CodigoAviso) -> Self {
        match codigo {
            CodigoAviso::VersionNoSoportada => Self::VersionNoSoportada,
            CodigoAviso::ReplaySinVueltas => Self::ReplaySinVueltas,
            CodigoAviso::PistaInvalida => Self::PistaInvalida,
            CodigoAviso::SinPista => Self::SinPista,
            CodigoAviso::ReferenciaFallback => Self::ReferenciaFallback,
            CodigoAviso::ArchivoCorrupto => Self::ArchivoCorrupto,
            CodigoAviso::ExtensionNoSoportada => Self::ExtensionNoSoportada,
            CodigoAviso::ProyeccionDeficiente => Self::ProyeccionDeficiente,
        }
    }
}

/// Aviso legible para la UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DtoAviso {
    pub codigo: DtoCodigoAviso,
    pub archivo: Option<String>,
    pub mensaje: String,
}

/// Selección actual de vueltas.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct DtoSeleccion {
    pub visibles: Vec<DtoIdVuelta>,
    pub referencia: Option<DtoIdVuelta>,
    pub b: Option<DtoIdVuelta>,
}

/// Datos de la pista usados por el encabezado.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoPistaResumen {
    pub puntos: usize,
    pub longitud_m: Option<f64>,
    pub ancho_m: Option<f64>,
    pub curvas: usize,
}

/// Resumen de un auto del replay.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoAutoResumen {
    pub indice: usize,
    pub car_id: String,
    pub piloto: String,
    pub equipo: String,
    pub vueltas: usize,
    pub vueltas_validas: usize,
    pub es_referencia: bool,
}

/// Resumen de una vuelta para el selector.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoVueltaResumen {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub tiempo_s: Option<f64>,
    pub valida: bool,
    pub motivo: String,
    pub visible: bool,
}

/// Respuesta inicial de una carga (T89).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoResumen {
    pub autos: Vec<DtoAutoResumen>,
    pub vueltas: Vec<DtoVueltaResumen>,
    pub avisos: Vec<DtoAviso>,
    pub seleccion: DtoSeleccion,
    pub pista: Option<DtoPistaResumen>,
    pub puede_analizar: bool,
    pub falta_pista: bool,
}

/// Carga de ruedas por posición.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoCargaRuedas {
    pub delantera_izquierda: Vec<Option<f64>>,
    pub delantera_derecha: Vec<Option<f64>>,
    pub trasera_izquierda: Vec<Option<f64>>,
    pub trasera_derecha: Vec<Option<f64>>,
}

/// Canales alineados de una vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoVueltaCanales {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub tiempo: Vec<Option<f64>>,
    pub velocidad_kmh: Vec<Option<f64>>,
    pub acelerador: Vec<Option<f64>>,
    pub freno: Vec<Option<f64>>,
    pub rpm: Vec<Option<f64>>,
    pub marcha: Vec<Option<u8>>,
    pub volante: Vec<Option<f64>>,
    pub rumbo_grados: Vec<Option<f64>>,
    pub acc_long_g: Vec<Option<f64>>,
    pub acc_lat_g: Vec<Option<f64>>,
    pub acc_total_g: Vec<Option<f64>>,
    pub gasolina: Vec<Option<f64>>,
    pub carga: DtoCargaRuedas,
    pub slip_ratio_delantera_izquierda: Vec<Option<f64>>,
    pub slip_ratio_delantera_derecha: Vec<Option<f64>>,
    pub x: Vec<Option<f64>>,
    pub y: Vec<Option<f64>>,
    pub z: Vec<Option<f64>>,
}

/// Readouts fijos de la vuelta de referencia.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoLecturasReferencia {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub tiempo_s: Option<f64>,
    pub velocidad_media_kmh: Option<f64>,
    pub velocidad_maxima_kmh: Option<f64>,
    pub acelerador_medio: Option<f64>,
    pub freno_medio: Option<f64>,
    pub g_lat_max: Option<f64>,
    pub rpm_medio: Option<f64>,
    pub combustible_usado: Option<f64>,
}

/// Datos de la pestaña Vuelta (T90).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoVuelta {
    pub grilla: Vec<f64>,
    pub referencia: Option<DtoLecturasReferencia>,
    pub vueltas: Vec<DtoVueltaCanales>,
}

/// Parámetros de proyección del mapa.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct DtoProyeccion {
    pub rotacion_grados: f64,
    pub elevacion: f64,
}

impl From<Proyeccion> for DtoProyeccion {
    fn from(proyeccion: Proyeccion) -> Self {
        Self {
            rotacion_grados: numero(proyeccion.rotacion_grados).unwrap_or(0.0),
            elevacion: numero(proyeccion.elevacion).unwrap_or(0.0),
        }
    }
}

/// Caja del mapa; `None` cuando no hay puntos válidos.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoBounds {
    pub min_x: Option<f64>,
    pub max_x: Option<f64>,
    pub min_y: Option<f64>,
    pub max_y: Option<f64>,
}

impl From<Option<Bounds>> for DtoBounds {
    fn from(bounds: Option<Bounds>) -> Self {
        match bounds {
            Some(bounds) => Self {
                min_x: numero(bounds.min_x),
                max_x: numero(bounds.max_x),
                min_y: numero(bounds.min_y),
                max_y: numero(bounds.max_y),
            },
            None => Self::default(),
        }
    }
}

/// Curva canónica para dibujar y etiquetar.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoCurvaPista {
    pub n: usize,
    pub nombre: String,
    pub s_ini: Option<f64>,
    pub s_apex: Option<f64>,
    pub s_fin: Option<f64>,
    pub largo: Option<f64>,
    pub radio_min: Option<f64>,
    pub giro: Option<f64>,
    pub sentido: String,
}

impl From<&curvas::CurvaPista> for DtoCurvaPista {
    fn from(curva: &curvas::CurvaPista) -> Self {
        Self {
            n: curva.n,
            nombre: curva.nombre.clone(),
            s_ini: numero(curva.s_ini),
            s_apex: numero(curva.s_apex),
            s_fin: numero(curva.s_fin),
            largo: numero(curva.largo),
            radio_min: numero(curva.radio_min),
            giro: numero(curva.giro),
            sentido: curva.sentido.etiqueta().to_string(),
        }
    }
}

/// Banda de pista y línea central proyectadas.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoPistaMapa {
    pub centro: Vec<Option<[f64; 2]>>,
    pub izquierda: Vec<Option<[f64; 2]>>,
    pub derecha: Vec<Option<[f64; 2]>>,
    pub longitud_m: Option<f64>,
    pub ancho_m: Option<f64>,
    pub puntos: usize,
}

/// Traza proyectada de una vuelta con sus canales crudos para colorear.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoTrazaMapa {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub puntos: Vec<Option<[f64; 2]>>,
    pub s: Vec<Option<f64>>,
    pub velocidad_kmh: Vec<Option<f64>>,
    pub acelerador: Vec<Option<f64>>,
    pub freno: Vec<Option<f64>>,
    pub marcha: Vec<Option<u8>>,
    pub altura: Vec<Option<f64>>,
    pub acc_lat_g: Vec<Option<f64>>,
    pub acc_long_g: Vec<Option<f64>>,
}

/// Datos de la pestaña Mapa (T91).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoMapa {
    pub proyeccion: DtoProyeccion,
    pub pista: Option<DtoPistaMapa>,
    pub trazas: Vec<DtoTrazaMapa>,
    pub bounds: DtoBounds,
    pub curvas: Vec<DtoCurvaPista>,
}

/// Vuelta ordenada por tiempo.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoTiempoVuelta {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub tiempo_s: Option<f64>,
    pub delta_s: Option<f64>,
}

/// Velocidad media y máxima de una vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoVelocidadVuelta {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub media_kmh: Option<f64>,
    pub maxima_kmh: Option<f64>,
}

/// Envolvente de velocidad del conjunto.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoEnvolvente {
    pub s: Vec<f64>,
    pub minimo: Vec<Option<f64>>,
    pub promedio: Vec<Option<f64>>,
    pub maximo: Vec<Option<f64>>,
}

/// Histograma de velocidad.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoHistogramaVelocidad {
    pub maxima_kmh: Option<f64>,
    pub conteos: Vec<usize>,
    pub total: usize,
}

/// Histograma de marchas.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoHistogramaMarchas {
    pub minima: Option<u8>,
    pub maxima: Option<u8>,
    pub conteos: Vec<usize>,
    pub total: usize,
}

/// Combustible consumido por vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoConsumo {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub consumo: Option<f64>,
}

/// Desvío lateral contra la REF.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoDesvio {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub valores: Vec<Option<f64>>,
}

/// Sector de una vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoSector {
    pub numero: usize,
    pub s_ini: Option<f64>,
    pub s_fin: Option<f64>,
    pub tiempo_s: Option<f64>,
}

/// Sectores de una vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoSectoresVuelta {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub sectores: Vec<DtoSector>,
}

/// Vuelta teórica del conjunto.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoVueltaTeorica {
    pub sectores: Vec<Option<f64>>,
    pub total_s: Option<f64>,
    pub mejor_real_s: Option<f64>,
    pub potencial_s: Option<f64>,
}

/// Fila de la tabla resumen.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoFilaResumen {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub tiempo_s: Option<f64>,
    pub delta_mejor_s: Option<f64>,
    pub velocidad_media_kmh: Option<f64>,
    pub velocidad_maxima_kmh: Option<f64>,
    pub acelerador_medio: Option<f64>,
    pub freno_medio: Option<f64>,
    pub g_lat_max: Option<f64>,
    pub rpm_medio: Option<f64>,
    pub combustible_usado: Option<f64>,
}

/// Datos de la pestaña Conjunto (T92).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoConjunto {
    pub auto: Option<usize>,
    pub grilla: Vec<f64>,
    pub vuelta_referencia: Option<DtoIdVuelta>,
    pub vueltas: Vec<DtoIdVuelta>,
    pub tiempos: Vec<DtoTiempoVuelta>,
    pub velocidades: Vec<DtoVelocidadVuelta>,
    pub envolvente: DtoEnvolvente,
    pub histograma_velocidad: DtoHistogramaVelocidad,
    pub histograma_marchas: DtoHistogramaMarchas,
    pub consumos: Vec<DtoConsumo>,
    pub desvios: Vec<DtoDesvio>,
    pub sectores: Vec<DtoSectoresVuelta>,
    pub tabla: Vec<DtoFilaResumen>,
    pub teorica: DtoVueltaTeorica,
    pub mapa: DtoMapa,
}

/// Cabecera de una vuelta comparada.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoCabeceraVuelta {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub piloto: String,
    pub car_id: String,
    pub tiempo_s: Option<f64>,
}

/// Delta de pedales A − B.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoDeltaPedales {
    pub gas: Vec<Option<f64>>,
    pub freno: Vec<Option<f64>>,
}

/// Datos de la pestaña Comparación (T93).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoComparacion {
    pub grilla: Vec<f64>,
    pub a: Option<DtoCabeceraVuelta>,
    pub b: Option<DtoCabeceraVuelta>,
    pub delta_tiempo: Vec<Option<f64>>,
    pub delta_velocidad_kmh: Vec<Option<f64>>,
    pub delta_pedales: DtoDeltaPedales,
    pub delta_sectores: Vec<Option<f64>>,
}

/// Métricas de una vuelta dentro de una curva.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoMetricasCurva {
    pub n: usize,
    pub nombre: String,
    pub v_min: Option<f64>,
    pub v_ini: Option<f64>,
    pub v_apex: Option<f64>,
    pub v_fin: Option<f64>,
    pub t_curva: Option<f64>,
    pub d_fren: Option<f64>,
    pub d_acel: Option<f64>,
}

/// Métricas por curva de una vuelta.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoCurvasVuelta {
    pub id: DtoIdVuelta,
    pub etiqueta: String,
    pub metricas: Vec<DtoMetricasCurva>,
}

/// Delta por curva entre A y B.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoDeltaCurva {
    pub n: usize,
    pub nombre: String,
    pub d_t: Option<f64>,
    pub d_v_min: Option<f64>,
    pub d_v_apex: Option<f64>,
    pub d_fren: Option<f64>,
    pub d_acel: Option<f64>,
}

/// Delta de curvas A/B.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DtoDeltaCurvas {
    pub a: DtoCabeceraVuelta,
    pub b: DtoCabeceraVuelta,
    pub curvas: Vec<DtoDeltaCurva>,
}

/// Datos de la pestaña Curvas (T94).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DtoCurvas {
    pub curvas: Vec<DtoCurvaPista>,
    pub vueltas: Vec<DtoCurvasVuelta>,
    pub delta: Option<DtoDeltaCurvas>,
    pub mapa: DtoMapa,
}

/// Construye el resumen de la sesión.
pub fn resumen(sesion: &Sesion) -> DtoResumen {
    let mut autos = Vec::new();
    let mut vueltas = Vec::new();

    if let Some(replay) = sesion.replay() {
        let referencia = sesion.auto_referencia();
        for auto in &replay.autos {
            autos.push(DtoAutoResumen {
                indice: auto.indice,
                car_id: auto.car_id.clone(),
                piloto: auto.piloto.clone(),
                equipo: auto.equipo.clone(),
                vueltas: auto.vueltas.len(),
                vueltas_validas: auto.vueltas.iter().filter(|vuelta| vuelta.valida).count(),
                es_referencia: referencia == Some(auto.indice),
            });

            for vuelta in &auto.vueltas {
                vueltas.push(DtoVueltaResumen {
                    id: vuelta.id.into(),
                    etiqueta: vuelta.etiqueta.clone(),
                    tiempo_s: numero(vuelta.tiempo_s),
                    valida: vuelta.valida,
                    motivo: motivo(vuelta.motivo),
                    visible: sesion.seleccion().es_visible(vuelta.id),
                });
            }
        }
    }

    DtoResumen {
        autos,
        vueltas,
        avisos: sesion.avisos().iter().map(dto_aviso).collect(),
        seleccion: DtoSeleccion {
            visibles: sesion
                .seleccion()
                .visibles
                .iter()
                .map(|&id| id.into())
                .collect(),
            referencia: sesion.seleccion().ref_id.map(Into::into),
            b: sesion.seleccion().b_id.map(Into::into),
        },
        pista: sesion.pista().map(|pista| DtoPistaResumen {
            puntos: pista.puntos(),
            longitud_m: numero(pista.longitud_m),
            ancho_m: numero(pista.ancho_m() as f64),
            curvas: pista.curvas().len(),
        }),
        puede_analizar: sesion.puede_analizar(),
        falta_pista: sesion.falta_pista(),
    }
}

/// Construye los canales de las vueltas visibles y la REF (T90).
pub fn vuelta(sesion: &Sesion) -> DtoVuelta {
    let Some(pista) = sesion.pista() else {
        return DtoVuelta::default();
    };
    let grilla = grilla_de_pista(pista.longitud_m);
    let mut vueltas = Vec::new();
    for vuelta in sesion.vueltas_visibles() {
        vueltas.push(canales(vuelta, &grilla));
    }

    let referencia = sesion.referencia().and_then(|vuelta| {
        let fila = agregados::tabla_resumen(&[vuelta], &grilla)
            .into_iter()
            .next()?;
        Some(DtoLecturasReferencia {
            id: vuelta.id.into(),
            etiqueta: vuelta.etiqueta.clone(),
            tiempo_s: numero(fila.tiempo_s),
            velocidad_media_kmh: numero(fila.velocidad_media_kmh),
            velocidad_maxima_kmh: numero(fila.velocidad_maxima_kmh),
            acelerador_medio: numero(fila.gas_medio),
            freno_medio: numero(fila.freno_medio),
            g_lat_max: numero(fila.g_lat_max),
            rpm_medio: numero(fila.rpm_medio),
            combustible_usado: numero(fila.combustible_usado),
        })
    });

    DtoVuelta {
        grilla: grilla.s,
        referencia,
        vueltas,
    }
}

/// Construye el mapa con la proyección plana por defecto (T91).
pub fn mapa(sesion: &Sesion) -> DtoMapa {
    mapa_con_proyeccion(sesion, Proyeccion::default())
}

/// Construye el mapa con una proyección explícita.
pub fn mapa_con_proyeccion(sesion: &Sesion, proyeccion: Proyeccion) -> DtoMapa {
    mapa_de_vueltas(sesion.pista(), &sesion.vueltas_visibles(), proyeccion)
}

/// Construye los agregados del auto de la REF (T92).
pub fn conjunto(sesion: &Sesion) -> DtoConjunto {
    let Some(pista) = sesion.pista() else {
        return conjunto_vacio(sesion.auto_referencia(), None);
    };
    let Some(vuelta_ref) = sesion.referencia() else {
        return conjunto_vacio(sesion.auto_referencia(), None);
    };

    let grilla = grilla_de_pista(pista.longitud_m);
    let auto = vuelta_ref.id.auto;
    let vueltas: Vec<&Vuelta> = sesion
        .vueltas()
        .into_iter()
        .filter(|vuelta| vuelta.valida && vuelta.id.auto == auto)
        .collect();

    let tiempos = agregados::tiempos_ordenados(&vueltas)
        .into_iter()
        .map(|fila| DtoTiempoVuelta {
            id: fila.id.into(),
            etiqueta: fila.etiqueta,
            tiempo_s: numero(fila.tiempo_s),
            delta_s: numero(fila.delta_s),
        })
        .collect();

    let velocidades = agregados::velocidades(&vueltas, &grilla)
        .into_iter()
        .map(|fila| DtoVelocidadVuelta {
            id: fila.id.into(),
            etiqueta: fila.etiqueta,
            media_kmh: numero(fila.media_kmh),
            maxima_kmh: numero(fila.maxima_kmh),
        })
        .collect();

    let envolvente = agregados::envolvente_velocidad(&vueltas, &grilla);
    let histograma_velocidad = agregados::histograma_velocidad(&vueltas);
    let histograma_marchas = agregados::histograma_marchas(&vueltas);
    let teorica = vuelta_teorica(&vueltas, &grilla);

    let consumos = agregados::consumos(&vueltas)
        .into_iter()
        .map(|fila| DtoConsumo {
            id: fila.id.into(),
            etiqueta: fila.etiqueta,
            consumo: numero(fila.consumo),
        })
        .collect();

    let desvios = agregados::desvio_lateral(vuelta_ref, &vueltas, &grilla)
        .into_iter()
        .map(|fila| DtoDesvio {
            id: fila.id.into(),
            etiqueta: fila.etiqueta,
            valores: fila.valores,
        })
        .collect();

    let sectores = vueltas
        .iter()
        .map(|vuelta| DtoSectoresVuelta {
            id: vuelta.id.into(),
            etiqueta: vuelta.etiqueta.clone(),
            sectores: sectores_de_vuelta(vuelta, &grilla)
                .into_iter()
                .map(|sector| DtoSector {
                    numero: sector.numero,
                    s_ini: numero(sector.s_ini),
                    s_fin: numero(sector.s_fin),
                    tiempo_s: numero(sector.tiempo_s),
                })
                .collect(),
        })
        .collect();

    let tabla = agregados::tabla_resumen(&vueltas, &grilla)
        .into_iter()
        .map(fila)
        .collect();

    DtoConjunto {
        auto: sesion.auto_referencia(),
        grilla: grilla.s.clone(),
        vuelta_referencia: Some(vuelta_ref.id.into()),
        vueltas: vueltas.iter().map(|vuelta| vuelta.id.into()).collect(),
        tiempos,
        velocidades,
        envolvente: DtoEnvolvente {
            s: envolvente.s,
            minimo: envolvente.minimo,
            promedio: envolvente.promedio,
            maximo: envolvente.maximo,
        },
        histograma_velocidad: DtoHistogramaVelocidad {
            maxima_kmh: numero(histograma_velocidad.maxima_kmh),
            conteos: histograma_velocidad.conteos,
            total: histograma_velocidad.total,
        },
        histograma_marchas: DtoHistogramaMarchas {
            minima: (histograma_marchas.total > 0).then_some(histograma_marchas.minima),
            maxima: (histograma_marchas.total > 0).then_some(histograma_marchas.maxima),
            conteos: histograma_marchas.conteos,
            total: histograma_marchas.total,
        },
        consumos,
        desvios,
        sectores,
        tabla,
        teorica: DtoVueltaTeorica {
            sectores: teorica.sectores.into_iter().map(numero).collect(),
            total_s: numero(teorica.total_s),
            mejor_real_s: numero(teorica.mejor_real_s),
            potencial_s: numero(teorica.potencial_s),
        },
        mapa: mapa_de_vueltas(Some(pista), &vueltas, Proyeccion::default()),
    }
}

/// Construye la comparación A/B (T93).
pub fn comparacion(sesion: &Sesion) -> DtoComparacion {
    let Some(pista) = sesion.pista() else {
        return DtoComparacion::default();
    };
    let grilla = grilla_de_pista(pista.longitud_m);
    let a = sesion.referencia();
    let b = sesion.b();

    let mut dto = DtoComparacion {
        grilla: grilla.s.clone(),
        a: a.map(|vuelta| cabecera(sesion, vuelta)),
        b: b.map(|vuelta| cabecera(sesion, vuelta)),
        ..DtoComparacion::default()
    };

    let (Some(a), Some(b)) = (a, b) else {
        return dto;
    };

    dto.delta_tiempo = comparacion::delta_acumulado(a, b, &grilla);
    dto.delta_velocidad_kmh = comparacion::delta_velocidad(a, b, &grilla);
    let pedales = comparacion::delta_pedales(a, b, &grilla);
    dto.delta_pedales = DtoDeltaPedales {
        gas: pedales.gas,
        freno: pedales.freno,
    };
    dto.delta_sectores = comparacion::delta_por_sector(a, b, &grilla)
        .into_iter()
        .map(numero)
        .collect();
    dto
}

/// Construye curvas, métricas y delta por curva (T94).
pub fn curvas(sesion: &Sesion) -> DtoCurvas {
    let Some(pista) = sesion.pista() else {
        return DtoCurvas::default();
    };
    let grilla = grilla_de_pista(pista.longitud_m);
    let curvas = pista.curvas();
    let visibles = sesion.vueltas_visibles();

    let vueltas = visibles
        .iter()
        .map(|vuelta| {
            let alineada = alinear_vuelta(vuelta, &grilla);
            let canales = CanalesAlineados {
                s: &alineada.s,
                velocidad: &alineada.velocidad_kmh,
                freno: &alineada.freno,
                gas: &alineada.gas,
                tiempo: &alineada.tiempo,
            };
            DtoCurvasVuelta {
                id: vuelta.id.into(),
                etiqueta: vuelta.etiqueta.clone(),
                metricas: curvas
                    .iter()
                    .map(|curva| {
                        let metricas = curvas::metricas_curva(&canales, curva);
                        DtoMetricasCurva {
                            n: curva.n,
                            nombre: curva.nombre.clone(),
                            v_min: numero(metricas.v_min),
                            v_ini: numero(metricas.v_ini),
                            v_apex: numero(metricas.v_apex),
                            v_fin: numero(metricas.v_fin),
                            t_curva: numero(metricas.t_curva),
                            d_fren: numero(metricas.d_fren),
                            d_acel: numero(metricas.d_acel),
                        }
                    })
                    .collect(),
            }
        })
        .collect();

    let delta = sesion.referencia().zip(sesion.b()).map(|(a, b)| {
        let alineada_a = alinear_vuelta(a, &grilla);
        let alineada_b = alinear_vuelta(b, &grilla);
        let canales_a = CanalesAlineados {
            s: &alineada_a.s,
            velocidad: &alineada_a.velocidad_kmh,
            freno: &alineada_a.freno,
            gas: &alineada_a.gas,
            tiempo: &alineada_a.tiempo,
        };
        let canales_b = CanalesAlineados {
            s: &alineada_b.s,
            velocidad: &alineada_b.velocidad_kmh,
            freno: &alineada_b.freno,
            gas: &alineada_b.gas,
            tiempo: &alineada_b.tiempo,
        };
        DtoDeltaCurvas {
            a: cabecera(sesion, a),
            b: cabecera(sesion, b),
            curvas: curvas::delta_curvas(curvas, &canales_a, &canales_b)
                .into_iter()
                .map(|delta| DtoDeltaCurva {
                    n: delta.n,
                    nombre: delta.nombre,
                    d_t: numero(delta.d_t),
                    d_v_min: numero(delta.d_v_min),
                    d_v_apex: numero(delta.d_v_apex),
                    d_fren: numero(delta.d_fren),
                    d_acel: numero(delta.d_acel),
                })
                .collect(),
        }
    });

    DtoCurvas {
        curvas: curvas.iter().map(Into::into).collect(),
        vueltas,
        delta,
        mapa: mapa_de_vueltas(Some(pista), &visibles, Proyeccion::default()),
    }
}

fn conjunto_vacio(auto: Option<usize>, grilla: Option<Grilla>) -> DtoConjunto {
    DtoConjunto {
        auto,
        grilla: grilla.map_or_else(Vec::new, |grilla| grilla.s),
        vuelta_referencia: None,
        vueltas: Vec::new(),
        tiempos: Vec::new(),
        velocidades: Vec::new(),
        envolvente: DtoEnvolvente::default(),
        histograma_velocidad: DtoHistogramaVelocidad {
            conteos: vec![0; BINS_VELOCIDAD],
            ..DtoHistogramaVelocidad::default()
        },
        histograma_marchas: DtoHistogramaMarchas::default(),
        consumos: Vec::new(),
        desvios: Vec::new(),
        sectores: Vec::new(),
        tabla: Vec::new(),
        teorica: DtoVueltaTeorica {
            sectores: vec![None; N_SECTORES],
            ..DtoVueltaTeorica::default()
        },
        mapa: DtoMapa {
            proyeccion: Proyeccion::default().into(),
            pista: None,
            trazas: Vec::new(),
            bounds: DtoBounds::default(),
            curvas: Vec::new(),
        },
    }
}

fn canales(vuelta: &Vuelta, grilla: &Grilla) -> DtoVueltaCanales {
    let alineada = alinear_vuelta(vuelta, grilla);
    DtoVueltaCanales {
        id: vuelta.id.into(),
        etiqueta: vuelta.etiqueta.clone(),
        tiempo: f64s(&alineada.tiempo),
        velocidad_kmh: f32s(&alineada.velocidad_kmh),
        acelerador: f32s(&alineada.gas),
        freno: f32s(&alineada.freno),
        rpm: f32s(&alineada.rpm),
        marcha: alineada.marcha,
        volante: f32s(&alineada.volante),
        rumbo_grados: alineada
            .yaw
            .iter()
            .map(|valor| valor.and_then(|valor| numero(valor.to_degrees() as f64)))
            .collect(),
        acc_long_g: f32s_g(&alineada.acc_long),
        acc_lat_g: f32s_g(&alineada.acc_lat),
        acc_total_g: f32s_g(&alineada.acc_total),
        gasolina: f32s(&alineada.gasolina),
        carga: DtoCargaRuedas {
            delantera_izquierda: f32s(&alineada.carga[0]),
            delantera_derecha: f32s(&alineada.carga[1]),
            trasera_izquierda: f32s(&alineada.carga[2]),
            trasera_derecha: f32s(&alineada.carga[3]),
        },
        slip_ratio_delantera_izquierda: f32s(&alineada.slip_ratio[0]),
        slip_ratio_delantera_derecha: f32s(&alineada.slip_ratio[1]),
        x: f32s(&alineada.x),
        y: f32s(&alineada.y),
        z: f32s(&alineada.z),
    }
}

fn mapa_de_vueltas(pista: Option<&Pista>, vueltas: &[&Vuelta], proyeccion: Proyeccion) -> DtoMapa {
    let vista = mapa::proyectar_vista(pista, vueltas, proyeccion);
    let trazas = vista
        .trazas
        .iter()
        .zip(vueltas)
        .map(|(traza, vuelta)| dto_traza(traza, vuelta))
        .collect::<Vec<_>>();

    let pista_dto = pista.map(|pista| dto_pista_map(pista, &vista, proyeccion));

    let mut puntos = Vec::new();
    for traza in &trazas {
        puntos.extend(traza.puntos.iter().flatten().map(|&[x, y]| (x, y)));
    }
    if let Some(pista_dto) = &pista_dto {
        for lado in [&pista_dto.centro, &pista_dto.izquierda, &pista_dto.derecha] {
            puntos.extend(lado.iter().flatten().map(|&[x, y]| (x, y)));
        }
    }
    let bounds = Bounds::de_puntos(puntos);

    DtoMapa {
        proyeccion: vista.proyeccion.into(),
        pista: pista_dto,
        trazas,
        bounds: bounds.into(),
        curvas: pista
            .map(|pista| pista.curvas().iter().map(Into::into).collect())
            .unwrap_or_default(),
    }
}

fn dto_traza(traza: &mapa::TrazaProyectada, vuelta: &Vuelta) -> DtoTrazaMapa {
    let series = &vuelta.muestras;
    let n = traza
        .puntos
        .len()
        .min(series.s.len())
        .min(series.speed_kmh.len())
        .min(series.gas.len())
        .min(series.freno.len())
        .min(series.marcha.len())
        .min(series.y.len())
        .min(series.acc_lat.len())
        .min(series.acc_long.len());

    DtoTrazaMapa {
        id: vuelta.id.into(),
        etiqueta: vuelta.etiqueta.clone(),
        puntos: traza.puntos[..n]
            .iter()
            .map(|&(x, y)| punto(x, y))
            .collect(),
        s: series.s[..n].iter().map(|&valor| numero(valor)).collect(),
        velocidad_kmh: series.speed_kmh[..n]
            .iter()
            .map(|&valor| numero(valor as f64))
            .collect(),
        acelerador: series.gas[..n]
            .iter()
            .map(|&valor| numero(valor as f64))
            .collect(),
        freno: series.freno[..n]
            .iter()
            .map(|&valor| numero(valor as f64))
            .collect(),
        marcha: series.marcha[..n].iter().copied().map(Some).collect(),
        altura: series.y[..n]
            .iter()
            .map(|&valor| numero(valor as f64))
            .collect(),
        acc_lat_g: series.acc_lat[..n]
            .iter()
            .map(|&valor| numero(valor as f64 / G))
            .collect(),
        acc_long_g: series.acc_long[..n]
            .iter()
            .map(|&valor| numero(valor as f64 / G))
            .collect(),
    }
}

fn dto_pista_map(
    pista: &Pista,
    vista: &mapa::ProyeccionMapa,
    proyeccion: Proyeccion,
) -> DtoPistaMapa {
    let n = pista.nx.len().min(pista.ny.len()).min(pista.nz.len());
    let centro = (0..n)
        .map(|indice| {
            let (x, y) = proyeccion.proyectar(
                pista.nx[indice] as f64,
                pista.ny[indice] as f64,
                pista.nz[indice] as f64,
            );
            punto(x, y)
        })
        .collect();

    let (izquierda, derecha) = vista.banda.as_ref().map_or_else(
        || (Vec::new(), Vec::new()),
        |banda| {
            (
                banda.izquierda.iter().map(|&(x, y)| punto(x, y)).collect(),
                banda.derecha.iter().map(|&(x, y)| punto(x, y)).collect(),
            )
        },
    );

    DtoPistaMapa {
        centro,
        izquierda,
        derecha,
        longitud_m: numero(pista.longitud_m),
        ancho_m: numero(pista.ancho_m() as f64),
        puntos: pista.puntos(),
    }
}

fn cabecera(sesion: &Sesion, vuelta: &Vuelta) -> DtoCabeceraVuelta {
    let auto = sesion
        .replay()
        .and_then(|replay| replay.autos.get(vuelta.id.auto));
    DtoCabeceraVuelta {
        id: vuelta.id.into(),
        etiqueta: vuelta.etiqueta.clone(),
        piloto: auto.map_or_else(String::new, |auto| auto.piloto.clone()),
        car_id: auto.map_or_else(String::new, |auto| auto.car_id.clone()),
        tiempo_s: numero(vuelta.tiempo_s),
    }
}

fn fila(fila: agregados::FilaResumen) -> DtoFilaResumen {
    DtoFilaResumen {
        id: fila.id.into(),
        etiqueta: fila.etiqueta,
        tiempo_s: numero(fila.tiempo_s),
        delta_mejor_s: numero(fila.delta_mejor_s),
        velocidad_media_kmh: numero(fila.velocidad_media_kmh),
        velocidad_maxima_kmh: numero(fila.velocidad_maxima_kmh),
        acelerador_medio: numero(fila.gas_medio),
        freno_medio: numero(fila.freno_medio),
        g_lat_max: numero(fila.g_lat_max),
        rpm_medio: numero(fila.rpm_medio),
        combustible_usado: numero(fila.combustible_usado),
    }
}

fn dto_aviso(aviso: &crate::sesion::Aviso) -> DtoAviso {
    DtoAviso {
        codigo: aviso.codigo.into(),
        archivo: aviso.archivo.clone(),
        mensaje: aviso.mensaje.clone(),
    }
}

fn motivo(motivo: MotivoVuelta) -> String {
    motivo.etiqueta().to_string()
}

fn f64s(valores: &[Option<f64>]) -> Vec<Option<f64>> {
    valores.iter().map(|valor| valor.and_then(numero)).collect()
}

fn f32s(valores: &[Option<f32>]) -> Vec<Option<f64>> {
    valores
        .iter()
        .map(|valor| valor.and_then(|valor| numero(valor as f64)))
        .collect()
}

fn f32s_g(valores: &[Option<f32>]) -> Vec<Option<f64>> {
    valores
        .iter()
        .map(|valor| valor.and_then(|valor| numero(valor as f64 / G)))
        .collect()
}

fn punto(x: f64, y: f64) -> Option<[f64; 2]> {
    let x = numero(x)?;
    let y = numero(y)?;
    Some([x, y])
}

fn numero(valor: f64) -> Option<f64> {
    valor.is_finite().then_some(valor)
}
