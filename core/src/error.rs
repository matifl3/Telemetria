//! Errores de formato con mensajes en español.
//!
//! Todo rechazo de un archivo pasa por [`ErrorFormato`]: lleva el nombre del
//! archivo, el motivo tipado y, cuando aplica, el offset donde falló la lectura.
//! La UI muestra [`ErrorFormato::mensaje`] sin agregar texto propio.

use std::fmt;

/// Motivos de rechazo. Cada variante corresponde a una causa distinta para que
/// los tests y la UI puedan distinguirlas sin mirar el texto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Motivo {
    /// La versión del `.acreplay` no es la 16.
    VersionNoSoportada { version: u32 },
    /// El archivo termina antes de completar la lectura pedida.
    ArchivoTruncado {
        necesita: usize,
        disponibles: usize,
    },
    /// Estructura inválida: longitudes imposibles, desbordamientos, etc.
    ArchivoCorrupto { detalle: String },
    /// Cadena con largo fuera de rango o bytes UTF-8 inválidos.
    CadenaInvalida { largo: u32, posicion: usize },
    /// Extensión que la app no sabe cargar.
    ExtensionNoSoportada { extension: String },
    /// `fast_lane.ai` no utilizable para geometría o curvas.
    PistaInvalida { detalle: String },
    /// Ningún auto del replay produjo vueltas analizables.
    ReplaySinVueltas,
    /// La proyección a `s` descartó demasiadas muestras.
    ProyeccionDeficiente { descartadas: usize, total: usize },
    /// El auto del jugador no sirvió y se usó otro como referencia.
    ReferenciaFallback { auto: String },
}

impl Motivo {
    /// Texto en español del motivo, sin el nombre del archivo.
    pub fn descripcion(&self) -> String {
        match self {
            Motivo::VersionNoSoportada { version } => format!(
                ".acreplay de versión {version}; solo se soporta la 16"
            ),
            Motivo::ArchivoTruncado {
                necesita,
                disponibles,
            } => format!(
                "archivo truncado: se necesitan {necesita} bytes y quedan {disponibles}"
            ),
            Motivo::ArchivoCorrupto { detalle } => format!("archivo corrupto: {detalle}"),
            Motivo::CadenaInvalida { largo, posicion } => format!(
                "cadena inválida en el offset {posicion}: largo {largo}"
            ),
            Motivo::ExtensionNoSoportada { extension } => format!(
                "extensión no soportada ({extension}); se espera .acreplay o fast_lane.ai"
            ),
            Motivo::PistaInvalida { detalle } => format!("pista inválida: {detalle}"),
            Motivo::ReplaySinVueltas => "El replay no contiene vueltas analizables".to_string(),
            Motivo::ProyeccionDeficiente {
                descartadas,
                total,
            } => format!(
                "proyección deficiente: {descartadas} de {total} muestras quedaron fuera de pista"
            ),
            Motivo::ReferenciaFallback { auto } => {
                format!("se usa \"{auto}\" como referencia porque el auto del jugador no tiene vueltas válidas")
            }
        }
    }
}

/// Error de carga de un archivo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorFormato {
    pub archivo: String,
    pub motivo: Motivo,
    pub offset: Option<usize>,
}

impl ErrorFormato {
    pub fn nuevo(archivo: impl Into<String>, motivo: Motivo) -> Self {
        Self {
            archivo: archivo.into(),
            motivo,
            offset: None,
        }
    }

    pub fn en_offset(
        archivo: impl Into<String>,
        motivo: Motivo,
        offset: usize,
    ) -> Self {
        Self {
            archivo: archivo.into(),
            motivo,
            offset: Some(offset),
        }
    }

    /// Mensaje listo para mostrar: `archivo: motivo`.
    pub fn mensaje(&self) -> String {
        match self.offset {
            Some(offset) => format!("{}: {} (offset {offset})", self.archivo, self.motivo.descripcion()),
            None => format!("{}: {}", self.archivo, self.motivo.descripcion()),
        }
    }
}

impl fmt::Display for ErrorFormato {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.mensaje())
    }
}

impl std::error::Error for ErrorFormato {}

/// Resultado de cualquier operación de parseo.
pub type Resultado<T> = Result<T, ErrorFormato>;

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn motivo_version_15_en_espanol() {
        let error = ErrorFormato::nuevo(
            "vuelta.acreplay",
            Motivo::VersionNoSoportada { version: 15 },
        );
        let mensaje = error.mensaje();
        assert!(mensaje.contains("vuelta.acreplay"), "mensaje: {mensaje}");
        assert!(mensaje.contains("15"), "mensaje: {mensaje}");
        assert!(mensaje.contains("solo se soporta la 16"), "mensaje: {mensaje}");
    }

    #[test]
    fn mensaje_incluye_offset() {
        let error = ErrorFormato::en_offset(
            "pista.ai",
            Motivo::ArchivoTruncado {
                necesita: 20,
                disponibles: 4,
            },
            12,
        );
        let mensaje = error.mensaje();
        assert!(mensaje.contains("pista.ai"), "mensaje: {mensaje}");
        assert!(mensaje.contains("offset 12"), "mensaje: {mensaje}");
    }

    #[test]
    fn mensaje_sin_vueltas_es_exacto() {
        let error = ErrorFormato::nuevo("x.acreplay", Motivo::ReplaySinVueltas);
        assert_eq!(
            error.motivo.descripcion(),
            "El replay no contiene vueltas analizables"
        );
    }
}
