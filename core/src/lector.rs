//! Cursor de lectura little-endian con límites chequeados.
//!
//! Nunca indexa sin validar: si falta un byte o una multiplicación desborda,
//! devuelve [`ErrorFormato`] con el offset exacto. No hay `panic` por datos
//! corruptos (D-13 del plan).

use crate::error::{ErrorFormato, Motivo, Resultado};

/// Largo máximo aceptado para una cadena del formato (1 MB, igual que v1).
pub const LARGO_MAX_CADENA: u32 = 1_000_000;

/// Cursor sobre un buffer de bytes, con el nombre del archivo para los errores.
pub struct Lector<'a> {
    bytes: &'a [u8],
    pos: usize,
    archivo: String,
}

impl<'a> Lector<'a> {
    pub fn nuevo(bytes: &'a [u8], archivo: impl Into<String>) -> Self {
        Self {
            bytes,
            pos: 0,
            archivo: archivo.into(),
        }
    }

    /// Posición actual, relativa al inicio del buffer.
    pub fn pos(&self) -> usize {
        self.pos
    }

    /// Largo total del buffer.
    pub fn largo(&self) -> usize {
        self.bytes.len()
    }

    /// Bytes que todavía no se leyeron.
    pub fn restante(&self) -> usize {
        self.bytes.len().saturating_sub(self.pos)
    }

    /// Vista de los bytes que todavía no se leyeron (no avanza).
    pub fn resto(&self) -> &'a [u8] {
        &self.bytes[self.pos.min(self.bytes.len())..]
    }

    /// Nombre del archivo asociado al cursor.
    pub fn archivo(&self) -> &str {
        &self.archivo
    }

    fn error(&self, motivo: Motivo) -> ErrorFormato {
        ErrorFormato::en_offset(self.archivo.clone(), motivo, self.pos)
    }

    /// Toma `n` bytes y avanza. Valida el rango antes de tocar el buffer.
    fn tomar(&mut self, n: usize) -> Resultado<&'a [u8]> {
        let fin = match self.pos.checked_add(n) {
            Some(fin) => fin,
            None => {
                return Err(self.error(Motivo::ArchivoCorrupto {
                    detalle: "desbordamiento al calcular el fin de la lectura".to_string(),
                }))
            }
        };
        if fin > self.bytes.len() {
            return Err(self.error(Motivo::ArchivoTruncado {
                necesita: n,
                disponibles: self.restante(),
            }));
        }
        let trozo = &self.bytes[self.pos..fin];
        self.pos = fin;
        Ok(trozo)
    }

    pub fn u8(&mut self) -> Resultado<u8> {
        Ok(self.tomar(1)?[0])
    }

    pub fn u16(&mut self) -> Resultado<u16> {
        let b = self.tomar(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub fn u32(&mut self) -> Resultado<u32> {
        let b = self.tomar(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn i32(&mut self) -> Resultado<i32> {
        let b = self.tomar(4)?;
        Ok(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn f32(&mut self) -> Resultado<f32> {
        let b = self.tomar(4)?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn f64(&mut self) -> Resultado<f64> {
        let b = self.tomar(8)?;
        Ok(f64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    pub fn f16(&mut self) -> Resultado<f32> {
        let b = self.tomar(2)?;
        Ok(medio_a_f32(u16::from_le_bytes([b[0], b[1]])))
    }

    /// Cadena del formato: `u32` largo + bytes UTF-8.
    ///
    /// Rechaza largos mayores a [`LARGO_MAX_CADENA`] y UTF-8 inválido.
    pub fn cadena(&mut self) -> Resultado<String> {
        let inicio = self.pos;
        let largo = self.u32()?;
        if largo > LARGO_MAX_CADENA {
            return Err(ErrorFormato::en_offset(
                self.archivo.clone(),
                Motivo::CadenaInvalida {
                    largo,
                    posicion: inicio,
                },
                inicio,
            ));
        }
        let bytes = self.tomar(largo as usize)?;
        match std::str::from_utf8(bytes) {
            Ok(texto) => Ok(texto.to_string()),
            Err(_) => Err(ErrorFormato::en_offset(
                self.archivo.clone(),
                Motivo::CadenaInvalida {
                    largo,
                    posicion: inicio,
                },
                inicio,
            )),
        }
    }

    /// Avanza `n` bytes.
    pub fn saltar(&mut self, n: usize) -> Resultado<()> {
        self.tomar(n).map(|_| ())
    }

    /// Avanza `cantidad × tamano` bytes con multiplicación chequeada.
    pub fn saltar_producto(&mut self, cantidad: usize, tamano: usize) -> Resultado<()> {
        let total = match cantidad.checked_mul(tamano) {
            Some(total) => total,
            None => {
                return Err(self.error(Motivo::ArchivoCorrupto {
                    detalle: format!(
                        "desbordamiento al saltar {cantidad} elementos de {tamano} bytes"
                    ),
                }))
            }
        };
        self.saltar(total)
    }
}

/// Convierte un IEEE 754 de media precisión (`f16`) a `f32`.
///
/// Cubre normales, subnormales, ±0, ±∞ y NaN. Se implementa a mano para no
/// agregar dependencias (principio 1).
pub fn medio_a_f32(bits: u16) -> f32 {
    let signo = (bits >> 15) & 1;
    let exponente = (bits >> 10) & 0x1f;
    let fraccion = (bits & 0x03ff) as f32;

    let valor = if exponente == 0 {
        // Subnormal (o cero): fracción × 2^-24.
        fraccion * 2f32.powi(-24)
    } else if exponente == 0x1f {
        if fraccion == 0.0 {
            f32::INFINITY
        } else {
            f32::NAN
        }
    } else {
        // Normal: (1 + fracción/1024) × 2^(exponente-15).
        (1.0 + fraccion / 1024.0) * 2f32.powi(exponente as i32 - 15)
    };

    if signo == 1 {
        -valor
    } else {
        valor
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn t07_enteros_avanzan_la_posicion() {
        let bytes = [0x2a, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12];
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        assert_eq!(lector.u8().unwrap(), 0x2a);
        assert_eq!(lector.u16().unwrap(), 0x1234);
        assert_eq!(lector.u32().unwrap(), 0x12345678);
        assert_eq!(lector.pos(), 7);
        assert_eq!(lector.restante(), 0);
    }

    #[test]
    fn t07_lectura_fuera_de_rango_es_error() {
        let bytes = [1u8, 2];
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        let error = lector.u32().unwrap_err();
        assert!(matches!(
            error.motivo,
            Motivo::ArchivoTruncado {
                necesita: 4,
                disponibles: 2
            }
        ));
        assert_eq!(error.offset, Some(0));
        assert_eq!(lector.pos(), 0, "no debe avanzar si falla");
    }

    #[test]
    fn t08_f32_y_f64_round_trip() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1.5f32.to_le_bytes());
        bytes.extend_from_slice(&(-2.25f64).to_le_bytes());
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        assert_eq!(lector.f32().unwrap(), 1.5);
        assert_eq!(lector.f64().unwrap(), -2.25);
    }

    #[test]
    fn t09_f16_cubre_casos_especiales() {
        // 1.0 = 0x3C00, 1.5 = 0x3E00, -2.0 = 0xC000
        assert_eq!(medio_a_f32(0x3c00), 1.0);
        assert_eq!(medio_a_f32(0x3e00), 1.5);
        assert_eq!(medio_a_f32(0xc000), -2.0);
        // Subnormal mínimo: 2^-24.
        assert_eq!(medio_a_f32(0x0001), 2f32.powi(-24));
        // ±0.
        assert_eq!(medio_a_f32(0x0000), 0.0);
        assert!(medio_a_f32(0x8000).is_sign_negative());
        // ±∞.
        assert_eq!(medio_a_f32(0x7c00), f32::INFINITY);
        assert_eq!(medio_a_f32(0xfc00), f32::NEG_INFINITY);
        // NaN.
        assert!(medio_a_f32(0x7e00).is_nan());

        let mut lector = Lector::nuevo(&0x3c00u16.to_le_bytes(), "x.acreplay");
        assert_eq!(lector.f16().unwrap(), 1.0);
    }

    #[test]
    fn t10_cadena_valida_y_vacia() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&5u32.to_le_bytes());
        bytes.extend_from_slice("pista".as_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());

        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        assert_eq!(lector.cadena().unwrap(), "pista");
        assert_eq!(lector.cadena().unwrap(), "");
    }

    #[test]
    fn t10_cadena_mayor_a_un_megabyte_es_error() {
        let bytes = (LARGO_MAX_CADENA + 1).to_le_bytes();
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        let error = lector.cadena().unwrap_err();
        assert!(matches!(error.motivo, Motivo::CadenaInvalida { .. }));
    }

    #[test]
    fn t10_cadena_truncada_es_error() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&10u32.to_le_bytes());
        bytes.extend_from_slice(b"corto");
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        assert!(matches!(
            lector.cadena().unwrap_err().motivo,
            Motivo::ArchivoTruncado { .. }
        ));
    }

    #[test]
    fn t10_cadena_utf8_invalido_es_error() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&[0xff, 0xfe]);
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        assert!(matches!(
            lector.cadena().unwrap_err().motivo,
            Motivo::CadenaInvalida { .. }
        ));
    }

    #[test]
    fn t11_salto_fuera_del_buffer_es_error_sin_panic() {
        let bytes = [0u8; 8];
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        let error = lector.saltar(20).unwrap_err();
        assert!(matches!(
            error.motivo,
            Motivo::ArchivoTruncado {
                necesita: 20,
                disponibles: 8
            }
        ));
        assert_eq!(error.offset, Some(0));
    }

    #[test]
    fn t11_salto_con_multiplicacion_desbordada_es_error() {
        let bytes = [0u8; 8];
        let mut lector = Lector::nuevo(&bytes, "x.acreplay");
        let error = lector.saltar_producto(usize::MAX, 2).unwrap_err();
        assert!(matches!(error.motivo, Motivo::ArchivoCorrupto { .. }));
    }
}
