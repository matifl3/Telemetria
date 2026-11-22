//! Fases de cada curva: frenada, entrada, vértice y salida (ING10–ING17).
//!
//! Las fases se buscan en una ventana más amplia que el arco geométrico de la
//! curva: la frenada suele empezar antes de `s_ini` (el arco nace donde el
//! radio baja de [`crate::curvas::R_CURVA`]) y el gas a fondo suele llegar
//! después de `s_fin`.
//!
//! Los límites se guardan en `s` **extendido** (ver [`crate::senales`]): en la
//! primera curva la frenada puede tener `s < 0` y en la que cruza la meta el
//! final puede superar la longitud. Para la UI se pasan a `[0, L]`.

use crate::alineado::VueltaAlineada;
use crate::curvas::CurvaPista;
use crate::senales::{envolver_distancia, puntos_de_tramo, tiempo_en_tramo, valor, PuntoTramo};

/// Freno a partir del cual se considera que el piloto está frenando.
pub const FRENO_INICIO: f32 = 0.05;
/// Metros antes de `s_ini` donde se busca el inicio de la frenada.
pub const VENTANA_APROXIMACION_M: f64 = 250.0;
/// Metros después de `s_fin` donde se busca el gas a fondo.
pub const VENTANA_SALIDA_M: f64 = 300.0;
/// Fracción del volante máximo de la curva que marca el turn-in.
pub const FRACCION_TURN_IN: f64 = 0.25;
/// Acelerador que cuenta como "a fondo".
pub const GAS_FONDO: f32 = 0.98;
/// Metros que el acelerador debe sostenerse a fondo.
pub const GAS_FONDO_SOSTENIDO_M: f64 = 20.0;
/// Pedal por debajo del cual se considera suelto (coasting).
pub const PEDAL_SUELTO: f32 = 0.05;
/// Media ventana alrededor de la velocidad mínima que forma el vértice (m).
pub const VENTANA_VERTICE_M: f64 = 10.0;
/// Volante máximo por debajo del cual la curva se hace "derecho" (rad).
const VOLANTE_MINIMO: f64 = 1e-3;

/// Fase dentro de una curva, o recta entre curvas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fase {
    Frenada,
    Entrada,
    Vertice,
    Salida,
    Recta,
}

impl Fase {
    /// Texto en español para la UI.
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Fase::Frenada => "frenada",
            Fase::Entrada => "entrada",
            Fase::Vertice => "vértice",
            Fase::Salida => "salida",
            Fase::Recta => "recta",
        }
    }
}

/// Límites de fase de una curva, en `s` extendido y ordenados:
/// `inicio <= turn_in <= vertice_ini <= vertice <= vertice_fin <= fin`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LimitesFases {
    /// Inicio de frenada; si no hay frenada, igual al turn-in.
    pub inicio: f64,
    pub turn_in: f64,
    pub vertice_ini: f64,
    /// Punto de velocidad mínima.
    pub vertice: f64,
    pub vertice_fin: f64,
    /// Gas a fondo; si no llega, el final del arco (o el vértice si es mayor).
    pub fin: f64,
}

impl LimitesFases {
    /// Tramo extendido de una fase.
    pub fn tramo(&self, fase: Fase) -> Option<(f64, f64)> {
        match fase {
            Fase::Frenada => Some((self.inicio, self.turn_in)),
            Fase::Entrada => Some((self.turn_in, self.vertice_ini)),
            Fase::Vertice => Some((self.vertice_ini, self.vertice_fin)),
            Fase::Salida => Some((self.vertice_fin, self.fin)),
            Fase::Recta => None,
        }
    }
}

/// Fases y métricas de una vuelta en una curva.
///
/// Las posiciones están en `[0, L]`; lo que no se puede medir queda `NaN`.
#[derive(Debug, Clone, PartialEq)]
pub struct FasesCurva {
    pub n: usize,
    pub nombre: String,
    pub limites: LimitesFases,
    /// `true` si hubo frenada antes del vértice.
    pub con_frenada: bool,
    pub s_inicio_frenada: f64,
    pub s_turn_in: f64,
    pub s_vertice: f64,
    pub s_gas_fondo: f64,
    /// Fin de la salida en `[0, L]`.
    pub s_fin: f64,
    pub v_min: f64,
    /// Freno máximo entre el inicio de frenada y el vértice (0..1).
    pub freno_max: f64,
    pub s_freno_max: f64,
    /// Freno medio mientras dura la frenada (0..1).
    pub freno_medio: f64,
    /// Freno en el punto de turn-in (0..1).
    pub freno_en_turn_in: f64,
    /// Metros frenando con el volante girado, entre turn-in y vértice.
    pub trail_m: f64,
    /// Integral de freno sobre esos metros (freno·m).
    pub trail_integral: f64,
    /// Metros y segundos sin pedales entre el inicio y el gas a fondo.
    pub coasting_m: f64,
    pub coasting_s: f64,
    /// Distancia y tiempo del vértice al gas a fondo.
    pub vertice_a_gas_m: f64,
    pub vertice_a_gas_s: f64,
    pub t_frenada: f64,
    pub t_entrada: f64,
    pub t_vertice: f64,
    pub t_salida: f64,
}

/// Calcula las fases de todas las curvas de una vuelta.
pub fn fases_de_vuelta(vuelta: &VueltaAlineada, curvas: &[CurvaPista]) -> Vec<FasesCurva> {
    (0..curvas.len())
        .filter_map(|indice| fases_curva(vuelta, curvas, indice))
        .collect()
}

/// Fases de la curva `indice` (ING11). `None` si la vuelta no cubre la curva.
pub fn fases_curva(
    vuelta: &VueltaAlineada,
    curvas: &[CurvaPista],
    indice: usize,
) -> Option<FasesCurva> {
    let curva = curvas.get(indice)?;
    let longitud = *vuelta.s.last()?;
    let cantidad = curvas.len();

    // Ventana de aproximación: sin invadir la curva anterior (ING10).
    let mut desde = curva.s_ini - VENTANA_APROXIMACION_M;
    if cantidad > 1 {
        let previa = &curvas[(indice + cantidad - 1) % cantidad];
        let fin_previa = if indice == 0 {
            previa.s_fin - longitud
        } else {
            previa.s_fin
        };
        desde = desde.max(fin_previa);
    }
    // Límite de salida: sin llegar a la curva siguiente.
    let mut hasta = curva.s_fin + VENTANA_SALIDA_M;
    if cantidad > 1 {
        let siguiente = &curvas[(indice + 1) % cantidad];
        let inicio_siguiente = if indice + 1 == cantidad {
            siguiente.s_ini + longitud
        } else {
            siguiente.s_ini
        };
        hasta = hasta.min(inicio_siguiente.max(curva.s_fin));
    } else {
        hasta = hasta.min(curva.s_ini + longitud);
    }
    desde = desde.min(curva.s_ini);

    let puntos = puntos_de_tramo(&vuelta.s, desde, hasta);
    if puntos.is_empty() {
        return None;
    }
    let en_curva: Vec<usize> = (0..puntos.len())
        .filter(|&p| puntos[p].s >= curva.s_ini - 1e-9 && puntos[p].s <= curva.s_fin + 1e-9)
        .collect();

    // Vértice: velocidad mínima dentro del arco.
    let mut p_vertice = None;
    let mut v_min = f64::INFINITY;
    for &p in &en_curva {
        if let Some(v) = valor(&vuelta.velocidad_kmh, puntos[p].indice) {
            if v < v_min {
                v_min = v;
                p_vertice = Some(p);
            }
        }
    }
    let p_vertice = p_vertice?;

    // Frenada: corrida de freno que contiene el máximo antes del vértice.
    let freno = |p: usize| valor(&vuelta.freno, puntos[p].indice).unwrap_or(0.0);
    let mut p_freno_max = 0;
    let mut freno_max = f64::NEG_INFINITY;
    for p in 0..=p_vertice {
        if freno(p) > freno_max {
            freno_max = freno(p);
            p_freno_max = p;
        }
    }
    let con_frenada = freno_max > FRENO_INICIO as f64;
    let p_inicio_frenada = con_frenada.then(|| {
        let mut p = p_freno_max;
        while p > 0 && freno(p - 1) > FRENO_INICIO as f64 {
            p -= 1;
        }
        p
    });

    // Turn-in: primer punto con volante relevante, desde la frenada.
    let volante = |p: usize| valor(&vuelta.volante, puntos[p].indice).map(f64::abs);
    let volante_max = en_curva
        .iter()
        .filter_map(|&p| volante(p))
        .fold(0.0, f64::max);
    let umbral_volante = FRACCION_TURN_IN * volante_max;
    let p_busqueda = p_inicio_frenada.unwrap_or(0);
    let p_inicio_curva = en_curva
        .first()
        .copied()
        .unwrap_or(p_vertice)
        .min(p_vertice);
    let p_turn_in = if volante_max > VOLANTE_MINIMO {
        (p_busqueda..=p_vertice)
            .find(|&p| volante(p).is_some_and(|v| v >= umbral_volante))
            .unwrap_or(p_inicio_curva)
    } else {
        p_inicio_curva
    };
    let p_turn_in = p_turn_in.max(p_inicio_frenada.unwrap_or(0));
    let p_inicio = p_inicio_frenada.unwrap_or(p_turn_in).min(p_turn_in);

    // Gas a fondo sostenido después del vértice.
    let gas = |p: usize| valor(&vuelta.gas, puntos[p].indice);
    let p_gas = (p_vertice..puntos.len()).find(|&p| {
        if !gas(p).is_some_and(|g| g >= GAS_FONDO as f64) {
            return false;
        }
        let limite = puntos[p].s + GAS_FONDO_SOSTENIDO_M;
        let mut q = p;
        while q < puntos.len() && puntos[q].s <= limite {
            if !gas(q).is_some_and(|g| g >= GAS_FONDO as f64) {
                return false;
            }
            q += 1;
        }
        // Tiene que haber datos para cubrir la distancia pedida.
        puntos[q.min(puntos.len() - 1)].s >= limite - 1e-9 || q < puntos.len()
    });
    let p_fin =
        p_gas.unwrap_or_else(|| en_curva.last().copied().unwrap_or(p_vertice).max(p_vertice));

    // Ventana de vértice dentro de [turn_in, fin].
    let s_vertice = puntos[p_vertice].s;
    let p_vertice_ini = (p_turn_in..=p_vertice)
        .find(|&p| puntos[p].s >= s_vertice - VENTANA_VERTICE_M)
        .unwrap_or(p_vertice);
    let p_vertice_fin = (p_vertice..=p_fin)
        .rev()
        .find(|&p| puntos[p].s <= s_vertice + VENTANA_VERTICE_M)
        .unwrap_or(p_vertice);

    let limites = LimitesFases {
        inicio: puntos[p_inicio].s,
        turn_in: puntos[p_turn_in].s,
        vertice_ini: puntos[p_vertice_ini].s,
        vertice: s_vertice,
        vertice_fin: puntos[p_vertice_fin].s,
        fin: puntos[p_fin].s,
    };

    // Freno medio durante la corrida de frenada.
    let freno_medio = p_inicio_frenada.map_or(f64::NAN, |p0| {
        let mut suma = 0.0;
        let mut cuenta = 0.0;
        let mut p = p0;
        while p < puntos.len() && freno(p) > FRENO_INICIO as f64 {
            suma += freno(p);
            cuenta += 1.0;
            p += 1;
        }
        if cuenta > 0.0 {
            suma / cuenta
        } else {
            f64::NAN
        }
    });

    // Trail braking: frenando con volante girado entre turn-in y vértice.
    let mut trail_m = 0.0;
    let mut trail_integral = 0.0;
    let mut coasting_m = 0.0;
    let mut coasting_s = 0.0;
    for p in p_inicio..p_fin {
        let ds = puntos[p + 1].s - puntos[p].s;
        if ds <= 0.0 {
            continue;
        }
        let f = freno(p);
        if p >= p_turn_in && p < p_vertice && f > FRENO_INICIO as f64 {
            trail_m += ds;
            trail_integral += f * ds;
        }
        let suelto = gas(p).unwrap_or(0.0) < PEDAL_SUELTO as f64 && f < PEDAL_SUELTO as f64;
        if suelto {
            coasting_m += ds;
            let dt = tiempo_en_tramo(&puntos, &vuelta.tiempo, p, p + 1);
            if dt.is_finite() {
                coasting_s += dt;
            }
        }
    }

    let s_pista = |p: usize| vuelta.s[puntos[p].indice];
    let tiempo = |a: usize, b: usize| tiempo_en_tramo(&puntos, &vuelta.tiempo, a, b);

    Some(FasesCurva {
        n: curva.n,
        nombre: curva.nombre.clone(),
        limites,
        con_frenada,
        s_inicio_frenada: p_inicio_frenada.map_or(f64::NAN, s_pista),
        s_turn_in: s_pista(p_turn_in),
        s_vertice: s_pista(p_vertice),
        s_gas_fondo: p_gas.map_or(f64::NAN, s_pista),
        s_fin: s_pista(p_fin),
        v_min,
        freno_max: if con_frenada { freno_max } else { 0.0 },
        s_freno_max: if con_frenada {
            s_pista(p_freno_max)
        } else {
            f64::NAN
        },
        freno_medio,
        freno_en_turn_in: freno(p_turn_in),
        trail_m,
        trail_integral,
        coasting_m,
        coasting_s,
        vertice_a_gas_m: p_gas.map_or(f64::NAN, |p| puntos[p].s - s_vertice),
        vertice_a_gas_s: p_gas.map_or(f64::NAN, |p| tiempo(p_vertice, p)),
        t_frenada: tiempo(p_inicio, p_turn_in),
        t_entrada: tiempo(p_turn_in, p_vertice_ini),
        t_vertice: tiempo(p_vertice_ini, p_vertice_fin),
        t_salida: tiempo(p_vertice_fin, p_fin),
    })
}

/// Diferencia A − B de las fases de una curva (ING16).
///
/// Posiciones: positivo = A lo hace más adelante en la pista (frena más tarde,
/// gas a fondo más tarde). Tiempos: positivo = A tarda más.
#[derive(Debug, Clone, PartialEq)]
pub struct DeltaFasesCurva {
    pub n: usize,
    pub nombre: String,
    pub d_inicio_frenada_m: f64,
    pub d_turn_in_m: f64,
    pub d_gas_fondo_m: f64,
    pub d_v_min: f64,
    pub d_freno_max: f64,
    pub d_trail_m: f64,
    pub d_coasting_m: f64,
    pub d_vertice_a_gas_m: f64,
    pub d_t_frenada: f64,
    pub d_t_entrada: f64,
    pub d_t_vertice: f64,
    pub d_t_salida: f64,
}

/// Compara las fases de A y B curva por curva (por número de curva).
pub fn delta_fases(a: &[FasesCurva], b: &[FasesCurva], longitud: f64) -> Vec<DeltaFasesCurva> {
    a.iter()
        .filter_map(|fa| {
            let fb = b.iter().find(|fb| fb.n == fa.n)?;
            let posicion = |x: f64, y: f64| {
                if x.is_finite() && y.is_finite() {
                    envolver_distancia(x - y, longitud)
                } else {
                    f64::NAN
                }
            };
            Some(DeltaFasesCurva {
                n: fa.n,
                nombre: fa.nombre.clone(),
                d_inicio_frenada_m: posicion(fa.s_inicio_frenada, fb.s_inicio_frenada),
                d_turn_in_m: posicion(fa.s_turn_in, fb.s_turn_in),
                d_gas_fondo_m: posicion(fa.s_gas_fondo, fb.s_gas_fondo),
                d_v_min: fa.v_min - fb.v_min,
                d_freno_max: fa.freno_max - fb.freno_max,
                d_trail_m: fa.trail_m - fb.trail_m,
                d_coasting_m: fa.coasting_m - fb.coasting_m,
                d_vertice_a_gas_m: fa.vertice_a_gas_m - fb.vertice_a_gas_m,
                d_t_frenada: fa.t_frenada - fb.t_frenada,
                d_t_entrada: fa.t_entrada - fb.t_entrada,
                d_t_vertice: fa.t_vertice - fb.t_vertice,
                d_t_salida: fa.t_salida - fb.t_salida,
            })
        })
        .collect()
}

/// Busca en qué curva y fase cae un `s` de la pista.
pub fn ubicar(fases: &[FasesCurva], s: f64, longitud: f64) -> (Option<usize>, Fase) {
    for f in fases {
        for candidato in [s, s - longitud, s + longitud] {
            for fase in [Fase::Frenada, Fase::Entrada, Fase::Vertice, Fase::Salida] {
                let (a, b) = f.limites.tramo(fase).unwrap();
                if b > a && candidato >= a - 1e-9 && candidato <= b + 1e-9 {
                    return (Some(f.n), fase);
                }
            }
        }
    }
    (None, Fase::Recta)
}

/// Puntos de una fase concreta (para promedios por fase).
pub fn puntos_de_fase(s: &[f64], limites: &LimitesFases, fase: Fase) -> Vec<PuntoTramo> {
    limites
        .tramo(fase)
        .map(|(a, b)| puntos_de_tramo(s, a, b))
        .unwrap_or_default()
}
