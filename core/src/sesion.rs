//! Estado en memoria de una sesión de análisis (RF-002, RF-003, RF-009,
//! RF-010, RF-013, RF-014, RF-016).
//!
//! La sesión recibe bytes, nunca rutas: no escribe en disco. Toda carga se
//! construye como candidata completa y solo reemplaza el estado anterior si el
//! lote entero es válido (D-08 del plan).

use crate::acreplay::parsear_replay;
use crate::clasificacion::clasificar_vueltas;
use crate::error::{ErrorFormato, Motivo, Resultado};
use crate::modelo::{Auto, Replay};
use crate::pista::{parsear_pista, Pista};
use crate::proyeccion::{ajustar_vuelta, proyectar_auto};
use crate::vuelta::{construir_vueltas, Vuelta, VueltaId};

/// Código estable de un aviso para la UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodigoAviso {
    VersionNoSoportada,
    ReplaySinVueltas,
    PistaInvalida,
    SinPista,
    ReferenciaFallback,
    ArchivoCorrupto,
    ExtensionNoSoportada,
    ProyeccionDeficiente,
}

impl CodigoAviso {
    /// Traduce un motivo de error al código de aviso correspondiente.
    pub fn de_motivo(motivo: &Motivo) -> Self {
        match motivo {
            Motivo::VersionNoSoportada { .. } => CodigoAviso::VersionNoSoportada,
            Motivo::ReplaySinVueltas => CodigoAviso::ReplaySinVueltas,
            Motivo::PistaInvalida { .. } => CodigoAviso::PistaInvalida,
            Motivo::ReferenciaFallback { .. } => CodigoAviso::ReferenciaFallback,
            Motivo::ExtensionNoSoportada { .. } => CodigoAviso::ExtensionNoSoportada,
            Motivo::ProyeccionDeficiente { .. } => CodigoAviso::ProyeccionDeficiente,
            Motivo::ArchivoTruncado { .. }
            | Motivo::ArchivoCorrupto { .. }
            | Motivo::CadenaInvalida { .. } => CodigoAviso::ArchivoCorrupto,
        }
    }
}

/// Aviso legible para la UI. `archivo` es `None` cuando el problema no viene de
/// un archivo concreto (por ejemplo, falta de pista).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Aviso {
    pub codigo: CodigoAviso,
    pub archivo: Option<String>,
    pub mensaje: String,
}

impl Aviso {
    pub fn nuevo(codigo: CodigoAviso, archivo: Option<String>, mensaje: String) -> Self {
        Self {
            codigo,
            archivo,
            mensaje,
        }
    }

    /// Construye el aviso de un error de formato, conservando archivo y motivo.
    pub fn de_error(error: &ErrorFormato) -> Self {
        Self {
            codigo: CodigoAviso::de_motivo(&error.motivo),
            archivo: Some(error.archivo.clone()),
            mensaje: error.motivo.descripcion(),
        }
    }
}

/// Vueltas visibles y selección de referencia.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Seleccion {
    /// Vueltas activas, en el orden en que se fueron agregando.
    pub visibles: Vec<VueltaId>,
    /// Vuelta de referencia; siempre visible y válida cuando existe.
    pub ref_id: Option<VueltaId>,
    /// Vuelta B; siempre visible, válida y distinta de la REF cuando existe.
    pub b_id: Option<VueltaId>,
}

impl Seleccion {
    pub fn es_visible(&self, id: VueltaId) -> bool {
        self.visibles.contains(&id)
    }
}

/// Resumen de la sesión para la UI (RF-012).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumenSesion {
    pub autos: usize,
    pub vueltas: usize,
    pub visibles: usize,
    pub auto_referencia: Option<usize>,
    pub ref_id: Option<VueltaId>,
    pub b_id: Option<VueltaId>,
    pub avisos: Vec<Aviso>,
}

/// Sesión completa en memoria.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sesion {
    replay: Option<Replay>,
    pista: Option<Pista>,
    seleccion: Seleccion,
    avisos: Vec<Aviso>,
    /// Nombre del replay cargado, para los mensajes de una recarga de pista.
    archivo_replay: Option<String>,
}

impl Sesion {
    pub fn nueva() -> Self {
        Self::default()
    }

    /// Carga atómica de replay y pista: si falla cualquiera, no cambia nada.
    pub fn cargar_lote(
        &mut self,
        bytes_replay: &[u8],
        archivo_replay: &str,
        bytes_pista: &[u8],
        archivo_pista: &str,
    ) -> Resultado<()> {
        let replay = parsear_replay(bytes_replay, archivo_replay)?;
        let pista = parsear_pista(bytes_pista, archivo_pista)?;
        let analisis = analizar(replay, pista, archivo_replay)?;
        self.aplicar(analisis, archivo_replay.to_string());
        Ok(())
    }

    /// Carga un replay conservando la pista ya cargada, si la hay.
    ///
    /// Sin pista la sesión queda a la espera: el análisis se habilita recién al
    /// cargarla. Con pista, el replay se analiza y solo se reemplaza el estado
    /// anterior si produce vueltas analizables.
    pub fn cargar_replay(&mut self, bytes: &[u8], archivo: &str) -> Resultado<()> {
        let replay = parsear_replay(bytes, archivo)?;
        match self.pista.clone() {
            Some(pista) => {
                let analisis = analizar(replay, pista, archivo)?;
                self.aplicar(analisis, archivo.to_string());
            }
            None => {
                self.replay = Some(replay);
                self.seleccion = Seleccion::default();
                self.avisos.clear();
                self.archivo_replay = Some(archivo.to_string());
            }
        }
        Ok(())
    }

    /// Carga una pista conservando el replay ya cargado, si lo hay.
    ///
    /// Con replay, se reanaliza el replay completo con la pista candidata; si el
    /// resultado no tiene vueltas analizables, no se aplica ningún cambio.
    pub fn cargar_pista(&mut self, bytes: &[u8], archivo: &str) -> Resultado<()> {
        let pista = parsear_pista(bytes, archivo)?;
        match self.replay.clone() {
            Some(replay) => {
                let archivo_replay = self.archivo_replay.clone().unwrap_or_default();
                let analisis = analizar(replay, pista, &archivo_replay)?;
                self.aplicar(analisis, archivo_replay);
            }
            None => {
                self.pista = Some(pista);
                self.seleccion = Seleccion::default();
                self.avisos.clear();
            }
        }
        Ok(())
    }

    /// Vuelve todo a vacío, sin persistir nada (RF-010).
    pub fn limpiar(&mut self) {
        *self = Self::default();
    }

    /// Alterna la visibilidad de una vuelta seleccionable.
    ///
    /// Devuelve `false` sin cambiar nada si la vuelta no existe, es inválida o
    /// no es seleccionable (RF-016).
    pub fn alternar_vuelta(&mut self, id: VueltaId) -> bool {
        if !self.es_seleccionable(id) {
            return false;
        }

        match self.seleccion.visibles.iter().position(|visible| *visible == id) {
            Some(posicion) => {
                self.seleccion.visibles.remove(posicion);
            }
            None => self.seleccion.visibles.push(id),
        }
        self.normalizar_seleccion();
        true
    }

    /// Fija la REF, activándola si estaba oculta (RF-014).
    pub fn fijar_referencia(&mut self, id: VueltaId) -> bool {
        if !self.es_seleccionable(id) {
            return false;
        }
        if !self.seleccion.visibles.contains(&id) {
            self.seleccion.visibles.push(id);
        }
        self.seleccion.ref_id = Some(id);
        self.normalizar_seleccion();
        true
    }

    /// Fija la vuelta B, activándola si estaba oculta.
    ///
    /// Una vuelta no puede ser REF y B a la vez.
    pub fn fijar_b(&mut self, id: VueltaId) -> bool {
        if !self.es_seleccionable(id) || self.seleccion.ref_id == Some(id) {
            return false;
        }
        if !self.seleccion.visibles.contains(&id) {
            self.seleccion.visibles.push(id);
        }
        self.seleccion.b_id = Some(id);
        self.normalizar_seleccion();
        true
    }

    pub fn replay(&self) -> Option<&Replay> {
        self.replay.as_ref()
    }

    pub fn pista(&self) -> Option<&Pista> {
        self.pista.as_ref()
    }

    pub fn seleccion(&self) -> &Seleccion {
        &self.seleccion
    }

    pub fn avisos(&self) -> &[Aviso] {
        &self.avisos
    }

    /// Auto de referencia elegido para el análisis (jugador o fallback).
    pub fn auto_referencia(&self) -> Option<usize> {
        self.replay.as_ref().and_then(|replay| replay.auto_referencia)
    }

    pub fn referencia(&self) -> Option<&Vuelta> {
        self.seleccion.ref_id.and_then(|id| self.vuelta(id))
    }

    pub fn b(&self) -> Option<&Vuelta> {
        self.seleccion.b_id.and_then(|id| self.vuelta(id))
    }

    /// Busca una vuelta por su identificador estable.
    pub fn vuelta(&self, id: VueltaId) -> Option<&Vuelta> {
        self.replay
            .as_ref()?
            .autos
            .get(id.auto)?
            .vueltas
            .iter()
            .find(|vuelta| vuelta.id == id)
    }

    /// Vueltas visibles, en el orden de la selección.
    pub fn vueltas_visibles(&self) -> Vec<&Vuelta> {
        self.seleccion
            .visibles
            .iter()
            .filter_map(|id| self.vuelta(*id))
            .collect()
    }

    /// Todas las vueltas de todos los autos, en orden de archivo.
    pub fn vueltas(&self) -> Vec<&Vuelta> {
        self.replay
            .as_ref()
            .map(|replay| {
                replay
                    .autos
                    .iter()
                    .flat_map(|auto| auto.vueltas.iter())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Replay y pista válidos: se puede entrar al análisis (RF-007).
    pub fn puede_analizar(&self) -> bool {
        self.replay.is_some() && self.pista.is_some() && self.referencia().is_some()
    }

    /// Hay un replay cargado pero todavía falta la pista.
    pub fn falta_pista(&self) -> bool {
        self.replay.is_some() && self.pista.is_none()
    }

    pub fn resumen(&self) -> ResumenSesion {
        let (autos, vueltas) = self
            .replay
            .as_ref()
            .map(|replay| {
                (
                    replay.autos.len(),
                    replay
                        .autos
                        .iter()
                        .map(|auto| auto.vueltas.len())
                        .sum::<usize>(),
                )
            })
            .unwrap_or((0, 0));

        ResumenSesion {
            autos,
            vueltas,
            visibles: self.seleccion.visibles.len(),
            auto_referencia: self.auto_referencia(),
            ref_id: self.seleccion.ref_id,
            b_id: self.seleccion.b_id,
            avisos: self.avisos.clone(),
        }
    }

    fn aplicar(&mut self, analisis: Analisis, archivo_replay: String) {
        self.replay = Some(analisis.replay);
        self.pista = Some(analisis.pista);
        self.seleccion = analisis.seleccion;
        self.avisos = analisis.avisos;
        self.archivo_replay = Some(archivo_replay);
    }

    fn es_seleccionable(&self, id: VueltaId) -> bool {
        self.vuelta(id)
            .is_some_and(|vuelta| vuelta.valida && vuelta.seleccionable)
    }

    /// Restituye las invariantes 4 de la sección de modelo del plan.
    fn normalizar_seleccion(&mut self) {
        let visibles: Vec<VueltaId> = self
            .seleccion
            .visibles
            .iter()
            .copied()
            .filter(|id| self.es_seleccionable(*id))
            .fold(Vec::new(), |mut acumuladas, id| {
                if !acumuladas.contains(&id) {
                    acumuladas.push(id);
                }
                acumuladas
            });
        self.seleccion.visibles = visibles;

        if self
            .seleccion
            .ref_id
            .is_some_and(|id| !self.seleccion.visibles.contains(&id))
        {
            self.seleccion.ref_id = None;
        }
        if self.seleccion.ref_id.is_none() {
            self.seleccion.ref_id = self.seleccion.visibles.first().copied();
        }

        if self.seleccion.b_id.is_some_and(|id| {
            Some(id) == self.seleccion.ref_id || !self.seleccion.visibles.contains(&id)
        }) {
            self.seleccion.b_id = None;
        }
        if self.seleccion.b_id.is_none() {
            self.seleccion.b_id = self
                .seleccion
                .visibles
                .iter()
                .copied()
                .find(|id| Some(*id) != self.seleccion.ref_id);
        }

        if let Some(ref_id) = self.seleccion.ref_id {
            if let Some(replay) = self.replay.as_mut() {
                replay.auto_referencia = Some(ref_id.auto);
            }
        }
    }
}

struct Analisis {
    replay: Replay,
    pista: Pista,
    seleccion: Seleccion,
    avisos: Vec<Aviso>,
}

/// Proyecta, segmenta y clasifica todos los autos; elige la REF con fallback.
fn analizar(mut replay: Replay, pista: Pista, archivo_replay: &str) -> Resultado<Analisis> {
    let mut avisos = Vec::new();

    for auto in &mut replay.autos {
        let proyeccion = proyectar_auto(&pista, auto);
        let mut vueltas = construir_vueltas(auto, &proyeccion.s);

        for vuelta in &mut vueltas {
            if let Some(error) = ajustar_vuelta(&pista, vuelta, archivo_replay) {
                avisos.push(Aviso::de_error(&error));
            }
        }
        clasificar_vueltas(&mut vueltas);
        auto.vueltas = vueltas;
    }

    let indice_jugador = replay.meta.indice_jugador as usize;
    let elegido = if replay
        .autos
        .get(indice_jugador)
        .is_some_and(tiene_vueltas_validas)
    {
        Some(indice_jugador)
    } else {
        replay.autos.iter().position(tiene_vueltas_validas)
    };

    let Some(auto_referencia) = elegido else {
        return Err(ErrorFormato::nuevo(archivo_replay, Motivo::ReplaySinVueltas));
    };
    replay.auto_referencia = Some(auto_referencia);

    if auto_referencia != indice_jugador {
        let nombre = nombre_auto(&replay.autos[auto_referencia]);
        let motivo = Motivo::ReferenciaFallback { auto: nombre };
        avisos.push(Aviso::nuevo(
            CodigoAviso::ReferenciaFallback,
            Some(archivo_replay.to_string()),
            motivo.descripcion(),
        ));
    }

    let seleccion = seleccion_por_defecto(&replay.autos[auto_referencia]);
    Ok(Analisis {
        replay,
        pista,
        seleccion,
        avisos,
    })
}

fn tiene_vueltas_validas(auto: &Auto) -> bool {
    auto.vueltas
        .iter()
        .any(|vuelta| vuelta.valida && vuelta.seleccionable)
}

/// Al cargar quedan visibles solo las vueltas válidas del auto de referencia.
fn seleccion_por_defecto(auto: &Auto) -> Seleccion {
    let visibles: Vec<VueltaId> = auto
        .vueltas
        .iter()
        .filter(|vuelta| vuelta.valida && vuelta.seleccionable)
        .map(|vuelta| vuelta.id)
        .collect();
    let ref_id = visibles.first().copied();
    let b_id = visibles
        .iter()
        .copied()
        .find(|id| Some(*id) != ref_id);

    Seleccion {
        visibles,
        ref_id,
        b_id,
    }
}

fn nombre_auto(auto: &Auto) -> String {
    if auto.piloto.trim().is_empty() {
        auto.car_id.clone()
    } else {
        auto.piloto.clone()
    }
}
