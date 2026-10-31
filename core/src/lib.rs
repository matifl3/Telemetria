//! Lógica de AC Telemetry Lab, sin dependencia de Tauri.
//!
//! Este crate recibe bytes, nunca rutas: así no puede escribir en disco
//! (principio 5 de `doc/constitucion.md`) y se testea con fixtures en memoria.

pub mod acreplay;
pub mod clasificacion;
pub mod error;
pub mod lector;
pub mod modelo;
pub mod pista;
pub mod proyeccion;
pub mod vuelta;

pub use error::{ErrorFormato, Motivo, Resultado};
