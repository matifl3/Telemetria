//! Estado de la sesión compartido entre comandos (T97).
//!
//! Un único `Mutex` protege la sesión en memoria: las cargas se serializan y
//! solo se reemplaza el estado después de validar el lote completo (RF-009).

use std::sync::{Mutex, MutexGuard};

use acreplay_core::sesion::Sesion;

/// Estado global de la aplicación. Vive solo en memoria (RF-010).
pub struct EstadoApp {
    sesion: Mutex<Sesion>,
}

impl Default for EstadoApp {
    fn default() -> Self {
        Self::nueva()
    }
}

impl EstadoApp {
    pub fn nueva() -> Self {
        Self {
            sesion: Mutex::new(Sesion::nueva()),
        }
    }

    /// Acceso exclusivo a la sesión. Un pánico previo no deja la app bloqueada.
    pub fn bloquear(&self) -> MutexGuard<'_, Sesion> {
        self.sesion
            .lock()
            .unwrap_or_else(|envenenado| envenenado.into_inner())
    }

    /// Ejecuta una operación con la sesión bajo el mismo candado.
    pub fn con_sesion<T>(&self, operacion: impl FnOnce(&mut Sesion) -> T) -> T {
        let mut sesion = self.bloquear();
        operacion(&mut sesion)
    }
}

