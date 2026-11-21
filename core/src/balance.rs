//! Balance sub/sobreviraje a partir de volante, yaw y trayectoria (ING23–ING28).
//!
//! Sin `slip_angle` (viene en 0) el balance se estima así:
//!
//! - **Curvatura de trayectoria** κ: cuánto gira por metro el camino real del
//!   auto (de `x`/`z`).
//! - **Ganancia de dirección**: κ / volante en puntos de baja aceleración
//!   lateral, donde el auto se comporta casi neutro. Se calibra por vuelta, así
//!   no hace falta conocer la desmultiplicación ni la distancia entre ejes, y
//!   el signo del volante se calibra solo.
//! - **Índice de balance** = (volante · ganancia) / κ − 1. Cero = neutro;
//!   positivo = hace falta más volante que en neutro para la misma curvatura
//!   (subviraje); negativo = menos volante o contravolante (sobreviraje).
//! - **Deriva del chasis** β: diferencia entre hacia dónde apunta el auto (yaw)
//!   y hacia dónde va (rumbo de la trayectoria). El desfasaje constante y el
//!   signo entre ambos canales se calibran por vuelta.

use crate::alineado::VueltaAlineada;
use crate::fases::{puntos_de_fase, Fase, FasesCurva};
use crate::senales::{a_f64, curvatura_trayectoria, envolver_pi, mediana, rumbo_trayectoria};

/// Velocidad mínima para evaluar el balance (km/h).
pub const BALANCE_VEL_MIN_KMH: f64 = 40.0;
/// Curvatura mínima de la trayectoria para evaluar el balance (1/m): radio de
/// 400 m.
pub const BALANCE_CURVATURA_MIN: f64 = 1.0 / 400.0;
/// Aceleración lateral por debajo de la cual se calibra la ganancia (g).
pub const BALANCE_G_NEUTRO: f64 = 0.5;
/// Puntos mínimos para calibrar solo con baja aceleración lateral.
pub const BALANCE_PUNTOS_MIN: usize = 50;
/// Volante mínimo para usar un punto en la calibración (rad).
pub const BALANCE_VOLANTE_MIN: f64 = 0.01;
/// |índice| por debajo del cual la fase se considera neutra.
pub const BALANCE_UMBRAL: f64 = 0.15;
/// Recorte del índice para que un punto aislado no domine los promedios.
pub const BALANCE_LIMITE: f64 = 2.0;

const G: f64 = 9.806_65;

/// Balance de una vuelta punto a punto.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BalanceVuelta {
    /// Índice de balance por punto de la grilla (ver módulo).
    pub indice: Vec<Option<f64>>,
    /// Deriva del chasis por punto (rad).
    pub deriva_rad: Vec<Option<f64>>,
    /// Ganancia de dirección calibrada (1/m por rad de volante).
    pub ganancia: f64,
    /// `true` si la calibración usó solo puntos de baja aceleración lateral.
    pub calibracion_neutra: bool,
}

/// Calcula el balance de una vuelta (ING23–ING26).
pub fn balance_vuelta(vuelta: &VueltaAlineada) -> BalanceVuelta {
    let n = vuelta.s.len();
    let curvatura = curvatura_trayectoria(vuelta);
    let volante = a_f64(&vuelta.volante);
    let velocidad = a_f64(&vuelta.velocidad_kmh);
    let acc_lat = a_f64(&vuelta.acc_lat);

    let en_curva = |i: usize| -> Option<(f64, f64)> {
        let v = velocidad.get(i).copied().flatten()?;
        let k = curvatura.get(i).copied().flatten()?;
        let d = volante.get(i).copied().flatten()?;
        (v > BALANCE_VEL_MIN_KMH && k.abs() >= BALANCE_CURVATURA_MIN).then_some((k, d))
    };

    let mut neutros = Vec::new();
    let mut todos = Vec::new();
    for i in 0..n {
        let Some((k, d)) = en_curva(i) else {
            continue;
        };
        if d.abs() < BALANCE_VOLANTE_MIN {
            continue;
        }
        todos.push(k / d);
        let lateral = acc_lat.get(i).copied().flatten().map(|a| a.abs() / G);
        if lateral.is_some_and(|a| a < BALANCE_G_NEUTRO) {
            neutros.push(k / d);
        }
    }
    let calibracion_neutra = neutros.len() >= BALANCE_PUNTOS_MIN;
    let ganancia = if calibracion_neutra {
        mediana(&mut neutros)
    } else {
        mediana(&mut todos)
    };

    let indice = (0..n)
        .map(|i| {
            let (k, d) = en_curva(i)?;
            if !ganancia.is_finite() || ganancia == 0.0 {
                return None;
            }
            let valor = (d * ganancia) / k - 1.0;
            valor
                .is_finite()
                .then(|| valor.clamp(-BALANCE_LIMITE, BALANCE_LIMITE))
        })
        .collect();

    BalanceVuelta {
        indice,
        deriva_rad: deriva_chasis(vuelta),
        ganancia,
        calibracion_neutra,
    }
}

/// Deriva del chasis β = yaw − rumbo de la trayectoria (rad), calibrada.
pub fn deriva_chasis(vuelta: &VueltaAlineada) -> Vec<Option<f64>> {
    let yaw = a_f64(&vuelta.yaw);
    let rumbo = rumbo_trayectoria(vuelta);
    let velocidad = a_f64(&vuelta.velocidad_kmh);
    let n = yaw.len().min(rumbo.len());

    // Signo: los dos ángulos deben girar hacia el mismo lado.
    let mut correlacion = 0.0;
    for i in 1..n {
        if let (Some(y0), Some(y1), Some(r0), Some(r1)) =
            (yaw[i - 1], yaw[i], rumbo[i - 1], rumbo[i])
        {
            correlacion += (y1 - y0) * (r1 - r0);
        }
    }
    let signo = if correlacion < 0.0 { -1.0 } else { 1.0 };

    let rapido = |i: usize| {
        velocidad
            .get(i)
            .copied()
            .flatten()
            .is_some_and(|v| v > BALANCE_VEL_MIN_KMH)
    };
    let mut diferencias: Vec<f64> = (0..n)
        .filter(|&i| rapido(i))
        .filter_map(|i| Some(envolver_pi(signo * yaw[i]? - rumbo[i]?)))
        .collect();
    let desfasaje = mediana(&mut diferencias);
    let desfasaje = if desfasaje.is_finite() {
        desfasaje
    } else {
        0.0
    };

    (0..n)
        .map(|i| {
            if !rapido(i) {
                return None;
            }
            Some(envolver_pi(signo * yaw[i]? - rumbo[i]? - desfasaje))
        })
        .collect()
}

/// Diagnóstico de una fase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Diagnostico {
    Subvira,
    Neutro,
    Sobrevira,
}

impl Diagnostico {
    /// Texto en español para la UI.
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Diagnostico::Subvira => "subvira",
            Diagnostico::Neutro => "neutro",
            Diagnostico::Sobrevira => "sobrevira",
        }
    }

    /// Clasifica un índice medio.
    pub fn de_indice(indice: f64) -> Option<Self> {
        if !indice.is_finite() {
            None
        } else if indice > BALANCE_UMBRAL {
            Some(Diagnostico::Subvira)
        } else if indice < -BALANCE_UMBRAL {
            Some(Diagnostico::Sobrevira)
        } else {
            Some(Diagnostico::Neutro)
        }
    }
}

/// Balance medio de una vuelta en una curva (ING27).
#[derive(Debug, Clone, PartialEq)]
pub struct BalanceCurva {
    pub n: usize,
    pub entrada: f64,
    pub vertice: f64,
    pub salida: f64,
    /// Deriva máxima en valor absoluto dentro de la curva (grados).
    pub deriva_max_grados: f64,
}

impl BalanceCurva {
    /// Diagnóstico de una fase.
    pub fn diagnostico(&self, fase: Fase) -> Option<Diagnostico> {
        match fase {
            Fase::Entrada => Diagnostico::de_indice(self.entrada),
            Fase::Vertice => Diagnostico::de_indice(self.vertice),
            Fase::Salida => Diagnostico::de_indice(self.salida),
            _ => None,
        }
    }
}

/// Promedia el balance por fase de cada curva.
pub fn balance_por_curva(
    vuelta: &VueltaAlineada,
    balance: &BalanceVuelta,
    fases: &[FasesCurva],
) -> Vec<BalanceCurva> {
    fases
        .iter()
        .map(|f| {
            let media = |fase: Fase| {
                let valores: Vec<f64> = puntos_de_fase(&vuelta.s, &f.limites, fase)
                    .iter()
                    .filter_map(|p| balance.indice.get(p.indice).copied().flatten())
                    .collect();
                if valores.is_empty() {
                    f64::NAN
                } else {
                    valores.iter().sum::<f64>() / valores.len() as f64
                }
            };
            let deriva_max = [Fase::Entrada, Fase::Vertice, Fase::Salida]
                .iter()
                .flat_map(|&fase| puntos_de_fase(&vuelta.s, &f.limites, fase))
                .filter_map(|p| balance.deriva_rad.get(p.indice).copied().flatten())
                .map(f64::abs)
                .fold(f64::NAN, f64::max);
            BalanceCurva {
                n: f.n,
                entrada: media(Fase::Entrada),
                vertice: media(Fase::Vertice),
                salida: media(Fase::Salida),
                deriva_max_grados: deriva_max.to_degrees(),
            }
        })
        .collect()
}
