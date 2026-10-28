use crate::error::{ErrorFormato, Motivo, Resultado};
use crate::lector::Lector;

pub const SEMIANCHO_POR_DEFECTO: f32 = 6.0;

#[derive(Debug, Clone, PartialEq)]
pub struct Pista {
    pub nx: Vec<f32>,
    pub ny: Vec<f32>,
    pub nz: Vec<f32>,
    pub ns: Vec<f32>,
    pub wl: Vec<f32>,
    pub wr: Vec<f32>,
    pub longitud_m: f32,
}

fn f32_le(bytes: &[u8], offset: usize) -> f32 {
    if offset + 4 > bytes.len() { return f32::NAN; }
    f32::from_le_bytes([bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]])
}

