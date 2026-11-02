//! Comandos expuestos al front (RF-006, RF-008, RF-009, RF-013, RF-014).
//!
//! Las lecturas de disco ocurren solo acá y siempre sobre rutas elegidas por el
//! usuario. El parseo corre en `spawn_blocking` para no bloquear la ventana.

use std::path::Path;

use acreplay_core::dto::{
    self, DtoComparacion, DtoConjunto, DtoCurvas, DtoMapa, DtoResumen, DtoVuelta,
};
use acreplay_core::error::{ErrorFormato, Motivo};
use acreplay_core::mapa::Proyeccion;
use acreplay_core::sesion::Sesion;
use acreplay_core::vuelta::VueltaId;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error_comando::ErrorComando;
use crate::estado_app::EstadoApp;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TipoArchivo {
    Replay,
    Pista,
}

#[doc(hidden)]
pub struct ArchivoCargado {
    pub archivo: String,
    pub bytes: Vec<u8>,
}

#[doc(hidden)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pestana {
    Vuelta,
    Mapa,
    Conjunto,
    Comparacion,
    Curvas,
}

impl Pestana {
    pub fn desde(valor: &str) -> Result<Self, ErrorComando> {
        match valor.trim().to_lowercase().as_str() {
            "vuelta" => Ok(Self::Vuelta),
            "mapa" => Ok(Self::Mapa),
            "conjunto" => Ok(Self::Conjunto),
            "comparacion" | "comparación" => Ok(Self::Comparacion),
            "curvas" => Ok(Self::Curvas),
            _ => Err(ErrorComando::pestana(format!(
                "pestaña desconocida: \"{valor}\""
            ))),
        }
    }
}

/// DTO de la pestaña pedida (D-07).
#[derive(Debug, Serialize)]
#[serde(tag = "pestana", content = "datos", rename_all = "snake_case")]
pub enum DatosPestana {
    Vuelta(DtoVuelta),
    Mapa(DtoMapa),
    Conjunto(DtoConjunto),
    Comparacion(DtoComparacion),
    Curvas(DtoCurvas),
}

/// Abre el diálogo nativo y devuelve las rutas elegidas (T101).
#[tauri::command]
pub async fn abrir_dialogo(app: AppHandle) -> Result<Vec<String>, ErrorComando> {
    let seleccion = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Abrir replay o pista")
            .add_filter("Replay de Assetto Corsa", &["acreplay"])
            .add_filter("Pista (fast_lane.ai)", &["ai"])
            .blocking_pick_files()
    })
    .await
    .map_err(|error| ErrorComando::interno(format!("no se pudo abrir el diálogo: {error}")))?;

    let Some(rutas) = seleccion else {
        return Ok(Vec::new());
    };

    rutas
        .into_iter()
        .map(|ruta| {
            ruta.into_path()
                .map(|ruta| ruta.to_string_lossy().into_owned())
                .map_err(|error| ErrorComando::interno(format!("ruta inválida: {error}")))
        })
        .collect()
}

/// Carga atómica de un lote de archivos (T98). Replay y pista entran juntos o
/// no entra ninguno (D-08).
#[tauri::command]
pub async fn cargar_archivos(
    app: AppHandle,
    rutas: Vec<String>,
) -> Result<DtoResumen, ErrorComando> {
    en_bloqueo(move || {
        let (replay, pista) = preparar_lote(&rutas)?;
        let estado = app.state::<EstadoApp>();
        let mut sesion = estado.bloquear();
        aplicar_lote(&mut sesion, replay, pista)
    })
    .await
}

/// Carga una pista conservando la anterior si el archivo es inválido (T99).
#[tauri::command]
pub async fn cargar_pista(app: AppHandle, ruta: String) -> Result<DtoResumen, ErrorComando> {
    en_bloqueo(move || {
        let ruta = Path::new(&ruta);
        if clasificar(ruta)? != TipoArchivo::Pista {
            return Err(ErrorComando::lote("se esperaba un archivo .ai"));
        }
        let archivo = nombre_archivo(ruta);
        let bytes = leer(ruta)?;

        let estado = app.state::<EstadoApp>();
        let mut sesion = estado.bloquear();
        sesion
            .cargar_pista(&bytes, &archivo)
            .map_err(|error| ErrorComando::formato(&error))?;
        Ok(dto::resumen(&sesion))
    })
    .await
}

/// Devuelve el DTO de la pestaña activa (T100).
#[tauri::command]
pub async fn datos_pestana(
    app: AppHandle,
    pestana: String,
    rotacion: Option<f64>,
    elevacion: Option<f64>,
) -> Result<DatosPestana, ErrorComando> {
    en_bloqueo(move || {
        let pestana = Pestana::desde(&pestana)?;
        let proyeccion = Proyeccion::nueva(rotacion.unwrap_or(0.0), elevacion.unwrap_or(0.0));

        let estado = app.state::<EstadoApp>();
        let sesion = estado.bloquear();
        let datos = match pestana {
            Pestana::Vuelta => DatosPestana::Vuelta(dto::vuelta(&sesion)),
            Pestana::Mapa => DatosPestana::Mapa(dto::mapa_con_proyeccion(&sesion, proyeccion)),
            Pestana::Conjunto => DatosPestana::Conjunto(dto::conjunto(&sesion)),
            Pestana::Comparacion => DatosPestana::Comparacion(dto::comparacion(&sesion)),
            Pestana::Curvas => DatosPestana::Curvas(dto::curvas(&sesion)),
        };
        Ok(datos)
    })
    .await
}

/// Activa o desactiva una vuelta seleccionable (T100, RF-014/RF-016).
#[tauri::command]
pub fn alternar_vuelta(
    app: AppHandle,
    auto: usize,
    numero_local: usize,
) -> Result<DtoResumen, ErrorComando> {
    let estado = app.state::<EstadoApp>();
    let mut sesion = estado.bloquear();
    if !sesion.alternar_vuelta(VueltaId { auto, numero_local }) {
        return Err(ErrorComando::seleccion(
            "la vuelta no existe o no es seleccionable",
        ));
    }
    Ok(dto::resumen(&sesion))
}

/// Fija la vuelta de referencia (T100).
#[tauri::command]
pub fn fijar_referencia(
    app: AppHandle,
    auto: usize,
    numero_local: usize,
) -> Result<DtoResumen, ErrorComando> {
    let estado = app.state::<EstadoApp>();
    let mut sesion = estado.bloquear();
    if !sesion.fijar_referencia(VueltaId { auto, numero_local }) {
        return Err(ErrorComando::seleccion(
            "la vuelta no existe o no es seleccionable",
        ));
    }
    Ok(dto::resumen(&sesion))
}

/// Fija la vuelta B, distinta de la REF (T100).
#[tauri::command]
pub fn fijar_b(
    app: AppHandle,
    auto: usize,
    numero_local: usize,
) -> Result<DtoResumen, ErrorComando> {
    let estado = app.state::<EstadoApp>();
    let mut sesion = estado.bloquear();
    if !sesion.fijar_b(VueltaId { auto, numero_local }) {
        return Err(ErrorComando::seleccion(
            "la vuelta no existe, no es seleccionable o ya es la REF",
        ));
    }
    Ok(dto::resumen(&sesion))
}

/// Descarta la sesión en memoria (T100, RF-010).
#[tauri::command]
pub fn limpiar_sesion(app: AppHandle) -> DtoResumen {
    let estado = app.state::<EstadoApp>();
    let mut sesion = estado.bloquear();
    sesion.limpiar();
    dto::resumen(&sesion)
}

async fn en_bloqueo<T, F>(tarea: F) -> Result<T, ErrorComando>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ErrorComando> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(tarea)
        .await
        .map_err(|error| ErrorComando::interno(format!("la tarea de carga falló: {error}")))?
}

fn preparar_lote(
    rutas: &[String],
) -> Result<(Option<ArchivoCargado>, Option<ArchivoCargado>), ErrorComando> {
    if rutas.is_empty() {
        return Err(ErrorComando::lote("no se seleccionaron archivos"));
    }

    let mut replay = None;
    let mut pista = None;
    for ruta in rutas {
        let ruta = Path::new(ruta);
        let tipo = clasificar(ruta)?;
        let archivo = nombre_archivo(ruta);
        let bytes = leer(ruta)?;
        let cargado = ArchivoCargado { archivo, bytes };

        match tipo {
            TipoArchivo::Replay => {
                if replay.replace(cargado).is_some() {
                    return Err(ErrorComando::lote(
                        "el lote contiene más de un .acreplay",
                    ));
                }
            }
            TipoArchivo::Pista => {
                if pista.replace(cargado).is_some() {
                    return Err(ErrorComando::lote("el lote contiene más de una pista .ai"));
                }
            }
        }
    }

    Ok((replay, pista))
}

#[doc(hidden)]
pub fn aplicar_lote(
    sesion: &mut Sesion,
    replay: Option<ArchivoCargado>,
    pista: Option<ArchivoCargado>,
) -> Result<DtoResumen, ErrorComando> {
    let resultado = match (replay, pista) {
        (Some(replay), Some(pista)) => sesion.cargar_lote(
            &replay.bytes,
            &replay.archivo,
            &pista.bytes,
            &pista.archivo,
        ),
        (Some(replay), None) => sesion.cargar_replay(&replay.bytes, &replay.archivo),
        (None, Some(pista)) => sesion.cargar_pista(&pista.bytes, &pista.archivo),
        (None, None) => return Err(ErrorComando::lote("no se seleccionaron archivos")),
    };

    resultado.map_err(|error| ErrorComando::formato(&error))?;
    Ok(dto::resumen(sesion))
}

fn clasificar(ruta: &Path) -> Result<TipoArchivo, ErrorComando> {
    let extension = ruta
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_lowercase();

    match extension.as_str() {
        "acreplay" => Ok(TipoArchivo::Replay),
        "ai" => Ok(TipoArchivo::Pista),
        _ => Err(ErrorComando::formato(&ErrorFormato::nuevo(
            nombre_archivo(ruta),
            Motivo::ExtensionNoSoportada { extension },
        ))),
    }
}

fn leer(ruta: &Path) -> Result<Vec<u8>, ErrorComando> {
    std::fs::read(ruta).map_err(|error| ErrorComando::lectura(&nombre_archivo(ruta), error))
}

fn nombre_archivo(ruta: &Path) -> String {
    ruta.file_name()
        .map(|nombre| nombre.to_string_lossy().into_owned())
        .unwrap_or_else(|| ruta.to_string_lossy().into_owned())
}

