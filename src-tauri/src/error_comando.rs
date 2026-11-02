//! Errores de los comandos Tauri, serializables y en español.

use std::fmt;

use acreplay_core::error::{ErrorFormato, Motivo};
use serde::Serialize;

/// Error devuelto a la UI por cualquier comando.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErrorComando {
    /// Código estable para que la UI distinga la causa sin mirar el texto.
    pub codigo: String,
    pub archivo: Option<String>,
    pub mensaje: String,
    pub offset: Option<usize>,
}

impl ErrorComando {
    /// Convierte un rechazo de `core`, conservando archivo, motivo y offset.
    pub fn formato(error: &ErrorFormato) -> Self {
        Self {
            codigo: codigo(&error.motivo).to_string(),
            archivo: Some(error.archivo.clone()),
            mensaje: error.motivo.descripcion(),
            offset: error.offset,
        }
    }

    /// Error de lectura del archivo elegido por el usuario.
    pub fn lectura(archivo: &str, error: std::io::Error) -> Self {
        Self {
            codigo: "lectura".to_string(),
            archivo: Some(archivo.to_string()),
            mensaje: format!("{archivo}: no se pudo leer el archivo ({error})"),
            offset: None,
        }
    }

    /// Lote de archivos inválido (vacío, repetido o con extensión incorrecta).
    pub fn lote(mensaje: impl Into<String>) -> Self {
        Self {
            codigo: "lote_invalido".to_string(),
            archivo: None,
            mensaje: mensaje.into(),
            offset: None,
        }
    }

    /// Vuelta inexistente o no seleccionable (RF-016).
    pub fn seleccion(mensaje: impl Into<String>) -> Self {
        Self {
            codigo: "seleccion_invalida".to_string(),
            archivo: None,
            mensaje: mensaje.into(),
            offset: None,
        }
    }

    /// Pestaña desconocida.
    pub fn pestana(mensaje: impl Into<String>) -> Self {
        Self {
            codigo: "pestana_invalida".to_string(),
            archivo: None,
            mensaje: mensaje.into(),
            offset: None,
        }
    }

    /// Falla interna (tarea bloqueante, diálogo o ruta no convertible).
    pub fn interno(mensaje: impl Into<String>) -> Self {
        Self {
            codigo: "interno".to_string(),
            archivo: None,
            mensaje: mensaje.into(),
            offset: None,
        }
    }
}

impl fmt::Display for ErrorComando {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.mensaje)
    }
}

impl std::error::Error for ErrorComando {}

fn codigo(motivo: &Motivo) -> &'static str {
    match motivo {
        Motivo::VersionNoSoportada { .. } => "version_no_soportada",
        Motivo::ReplaySinVueltas => "replay_sin_vueltas",
        Motivo::PistaInvalida { .. } => "pista_invalida",
        Motivo::ReferenciaFallback { .. } => "referencia_fallback",
        Motivo::ExtensionNoSoportada { .. } => "extension_no_soportada",
        Motivo::ProyeccionDeficiente { .. } => "proyeccion_deficiente",
        Motivo::ArchivoTruncado { .. }
        | Motivo::ArchivoCorrupto { .. }
        | Motivo::CadenaInvalida { .. } => "archivo_corrupto",
    }
}

