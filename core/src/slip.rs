//! Bloqueos y patinamiento a partir de `slip_ratio` (ING18–ING22).
//!
//! Convención (a confirmar con un replay real, ING02): `slip_ratio` negativo =
//! la rueda gira más lento que el auto (bloqueo al frenar); positivo = gira
//! más rápido (patinamiento al acelerar). `slip_angle` no se usa: viene en 0.

use crate::alineado::VueltaAlineada;
use crate::fases::{ubicar, Fase, FasesCurva};
use crate::senales::valor;

/// `slip_ratio` por debajo del cual la rueda está bloqueando.
pub const SLIP_BLOQUEO: f32 = -0.3;
/// `slip_ratio` por encima del cual la rueda está patinando.
pub const SLIP_PATINA: f32 = 0.15;
/// Velocidad mínima para considerar el slip (km/h): a baja velocidad el
/// cociente se dispara sin significado.
pub const SLIP_VEL_MIN: f32 = 30.0;
/// Largo mínimo de un evento para conservarlo (m).
pub const SLIP_LARGO_MIN: f64 = 2.0;

/// Nombres de rueda en el orden del archivo.
pub const RUEDAS: [&str; 4] = ["DI", "DD", "TI", "TD"];

/// Tipo de evento de slip.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoSlip {
    Bloqueo,
    Patinamiento,
}

impl TipoSlip {
    /// Texto en español para la UI.
    pub fn etiqueta(&self) -> &'static str {
        match self {
            TipoSlip::Bloqueo => "bloqueo",
            TipoSlip::Patinamiento => "patinamiento",
        }
    }
}

/// Tramo contiguo en que una rueda bloquea o patina.
#[derive(Debug, Clone, PartialEq)]
pub struct EventoSlip {
    /// Rueda 0..4 (DI, DD, TI, TD).
    pub rueda: usize,
    pub tipo: TipoSlip,
    pub s_ini: f64,
    pub s_fin: f64,
    /// Valor extremo de `slip_ratio` en el tramo.
    pub pico: f64,
    pub largo_m: f64,
    /// Curva y fase donde cae el centro del evento (ING20).
    pub curva: Option<usize>,
    pub fase: Fase,
}

/// Detecta los eventos de slip de una vuelta (ING19).
pub fn eventos_slip(vuelta: &VueltaAlineada) -> Vec<EventoSlip> {
    let mut eventos = Vec::new();
    let n = vuelta.s.len();
    for rueda in 0..4 {
        let canal = &vuelta.slip_ratio[rueda];
        let mut abierto: Option<(TipoSlip, usize, f64)> = None;
        for i in 0..=n {
            let tipo = (i < n).then(|| tipo_en(vuelta, canal, i)).flatten();
            if let Some((tipo_abierto, inicio, pico)) = abierto {
                if tipo == Some(tipo_abierto) {
                    let actual = valor(canal, i).unwrap_or(pico);
                    let pico = match tipo_abierto {
                        TipoSlip::Bloqueo => pico.min(actual),
                        TipoSlip::Patinamiento => pico.max(actual),
                    };
                    abierto = Some((tipo_abierto, inicio, pico));
                    continue;
                }
                let fin = i - 1;
                let largo = vuelta.s[fin] - vuelta.s[inicio];
                if largo >= SLIP_LARGO_MIN - 1e-9 {
                    eventos.push(EventoSlip {
                        rueda,
                        tipo: tipo_abierto,
                        s_ini: vuelta.s[inicio],
                        s_fin: vuelta.s[fin],
                        pico,
                        largo_m: largo,
                        curva: None,
                        fase: Fase::Recta,
                    });
                }
                abierto = None;
            }
            if let Some(tipo) = tipo {
                abierto = Some((tipo, i, valor(canal, i).unwrap_or(0.0)));
            }
        }
    }
    eventos.sort_by(|a, b| a.s_ini.total_cmp(&b.s_ini).then(a.rueda.cmp(&b.rueda)));
    eventos
}

fn tipo_en(vuelta: &VueltaAlineada, canal: &[Option<f32>], indice: usize) -> Option<TipoSlip> {
    let velocidad = valor(&vuelta.velocidad_kmh, indice)?;
    if velocidad <= SLIP_VEL_MIN as f64 {
        return None;
    }
    let slip = valor(canal, indice)?;
    if slip < SLIP_BLOQUEO as f64 {
        Some(TipoSlip::Bloqueo)
    } else if slip > SLIP_PATINA as f64 {
        Some(TipoSlip::Patinamiento)
    } else {
        None
    }
}

/// Asigna curva y fase a cada evento (ING20).
pub fn ubicar_eventos(eventos: &mut [EventoSlip], fases: &[FasesCurva], longitud: f64) {
    for evento in eventos {
        let centro = (evento.s_ini + evento.s_fin) / 2.0;
        let (curva, fase) = ubicar(fases, centro, longitud);
        evento.curva = curva;
        evento.fase = fase;
    }
}

/// Resumen de slip de una vuelta en una curva (ING21).
#[derive(Debug, Clone, PartialEq)]
pub struct ResumenSlipCurva {
    pub n: usize,
    pub bloqueos: usize,
    pub patinamientos: usize,
    /// Rueda con más metros de slip, si hubo alguno.
    pub rueda_principal: Option<usize>,
}

/// Agrupa los eventos por curva (solo las curvas con eventos).
pub fn resumen_por_curva(eventos: &[EventoSlip]) -> Vec<ResumenSlipCurva> {
    let mut curvas: Vec<usize> = eventos.iter().filter_map(|e| e.curva).collect();
    curvas.sort_unstable();
    curvas.dedup();
    curvas
        .into_iter()
        .map(|n| {
            let de_curva: Vec<&EventoSlip> =
                eventos.iter().filter(|e| e.curva == Some(n)).collect();
            let mut metros = [0.0f64; 4];
            for evento in &de_curva {
                metros[evento.rueda] += evento.largo_m.max(1e-3);
            }
            let rueda_principal = (0..4)
                .filter(|&r| metros[r] > 0.0)
                .max_by(|&a, &b| metros[a].total_cmp(&metros[b]).then(b.cmp(&a)));
            ResumenSlipCurva {
                n,
                bloqueos: de_curva
                    .iter()
                    .filter(|e| e.tipo == TipoSlip::Bloqueo)
                    .count(),
                patinamientos: de_curva
                    .iter()
                    .filter(|e| e.tipo == TipoSlip::Patinamiento)
                    .count(),
                rueda_principal,
            }
        })
        .collect()
}
