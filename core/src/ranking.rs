//! Ranking de zonas donde A pierde tiempo frente a B (ING29–ING35).
//!
//! La vuelta se parte en **segmentos** que cubren toda la pista sin huecos ni
//! solapes: por cada curva sus fases (frenada, entrada, vértice, salida, con
//! los límites de la REF/A) y la recta que sigue. La pérdida de un segmento es
//! Δt(fin) − Δt(inicio); como los segmentos se encadenan, la suma de pérdidas y
//! ganancias es el delta de la vuelta.
//!
//! La pendiente del delta (s cada 100 m) ubica el punto de mayor pérdida dentro
//! de cada segmento. La causa probable sale de reglas simples sobre las fases,
//! el slip y el balance, siempre con el número que la respalda.

use crate::alineado::VueltaAlineada;
use crate::balance::{BalanceCurva, Diagnostico};
use crate::fases::{DeltaFasesCurva, Fase, FasesCurva};
use crate::senales::{derivada_en_s, puntos_de_tramo, s_en_pista, suavizar, valor};
use crate::slip::{EventoSlip, TipoSlip, RUEDAS};

/// Ventana de suavizado de la pendiente del delta (m).
pub const DELTA_VENTANA_M: f64 = 30.0;
/// Zonas que se muestran en el ranking.
pub const RANKING_TOP: usize = 5;
/// Ganancias que se muestran aparte.
pub const GANANCIAS_TOP: usize = 3;
/// Pérdida mínima para entrar en el ranking (s).
pub const PERDIDA_MIN_S: f64 = 0.005;
/// Diferencia de punto de frenada que se considera causa (m).
pub const CAUSA_FRENADA_M: f64 = 5.0;
/// Diferencia de freno máximo que se considera causa (0..1).
pub const CAUSA_FRENO: f64 = 0.1;
/// Diferencia de velocidad mínima que se considera causa (km/h).
pub const CAUSA_V_MIN_KMH: f64 = 1.0;
/// Diferencia de trail braking que se considera causa (m).
pub const CAUSA_TRAIL_M: f64 = 10.0;
/// Diferencia de gas a fondo que se considera causa (m).
pub const CAUSA_GAS_M: f64 = 10.0;
/// Diferencia de coasting que se considera causa (m).
pub const CAUSA_COASTING_M: f64 = 5.0;
/// Diferencia de velocidad en recta que se considera causa (km/h).
pub const CAUSA_VEL_RECTA_KMH: f64 = 2.0;

/// Segmento de la vuelta con su pérdida.
#[derive(Debug, Clone, PartialEq)]
pub struct Segmento {
    /// Curva a la que pertenece; en una recta, la curva que la precede.
    pub curva: Option<usize>,
    pub fase: Fase,
    /// Nombre para la UI, por ejemplo "C5 · salida" o "Recta tras C5".
    pub nombre: String,
    /// Límites en `[0, L]`; si el segmento cruza la meta, `s_fin < s_ini`.
    pub s_ini: f64,
    pub s_fin: f64,
    pub largo_m: f64,
    /// Δt(fin) − Δt(inicio): positivo = A pierde (s).
    pub perdida_s: f64,
    /// Porcentaje sobre la suma de pérdidas (solo para pérdidas).
    pub porcentaje: f64,
    /// Punto de mayor pendiente del delta y su valor (s/100 m).
    pub s_pendiente_max: f64,
    pub pendiente_max: f64,
    /// Causas probables, de la más fuerte a la más débil.
    pub causas: Vec<String>,
    /// Inicio y fin en `s` extendido (interno).
    pub(crate) a: f64,
    pub(crate) b: f64,
}

/// Resultado completo del ranking.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Ranking {
    /// Todos los segmentos, en orden de recorrido.
    pub segmentos: Vec<Segmento>,
    /// Las mayores pérdidas, de mayor a menor.
    pub perdidas: Vec<Segmento>,
    /// Las mayores ganancias de A, de mayor a menor.
    pub ganancias: Vec<Segmento>,
    /// Delta de la vuelta usado como total (s).
    pub delta_total_s: f64,
    /// Suma de las pérdidas positivas (s).
    pub suma_perdidas_s: f64,
}

/// Datos de una vuelta que necesita el ranking.
pub struct DatosVuelta<'a> {
    pub alineada: &'a VueltaAlineada,
    pub fases: &'a [FasesCurva],
    pub eventos: &'a [EventoSlip],
    pub balance: &'a [BalanceCurva],
}

/// Pendiente del delta acumulado, en s cada 100 m (ING29).
pub fn pendiente_delta(delta: &[Option<f64>], s: &[f64]) -> Vec<Option<f64>> {
    let suave = suavizar(delta, s, DELTA_VENTANA_M);
    derivada_en_s(&suave, s)
        .into_iter()
        .map(|valor| valor.map(|v| v * 100.0))
        .collect()
}

/// Corte entre segmentos: desde `s` empieza el segmento `(curva, fase)`.
struct Corte {
    s: f64,
    curva: Option<usize>,
    fase: Fase,
}

/// Parte la vuelta en segmentos encadenados (ING30). Devuelve `(a, b,
/// curva, fase)` en `s` extendido, con `b` del último = `a` del primero + L.
fn cortes(fases_a: &[FasesCurva], longitud: f64) -> Vec<(f64, f64, Option<usize>, Fase)> {
    let mut lista = Vec::new();
    for f in fases_a {
        let l = &f.limites;
        lista.push(Corte {
            s: l.inicio,
            curva: Some(f.n),
            fase: Fase::Frenada,
        });
        lista.push(Corte {
            s: l.turn_in,
            curva: Some(f.n),
            fase: Fase::Entrada,
        });
        lista.push(Corte {
            s: l.vertice_ini,
            curva: Some(f.n),
            fase: Fase::Vertice,
        });
        lista.push(Corte {
            s: l.vertice_fin,
            curva: Some(f.n),
            fase: Fase::Salida,
        });
        lista.push(Corte {
            s: l.fin,
            curva: Some(f.n),
            fase: Fase::Recta,
        });
    }
    if lista.is_empty() {
        return vec![(0.0, longitud, None, Fase::Recta)];
    }

    // Posición acumulada: nunca retrocede ni da más de una vuelta.
    let origen = lista[0].s;
    let mut posiciones = Vec::with_capacity(lista.len());
    let mut previa = origen;
    for corte in &lista {
        let mut paso = (corte.s - previa).rem_euclid(longitud);
        if paso > longitud / 2.0 {
            paso = 0.0; // el corte quedaría detrás: se pega al anterior.
        }
        let posicion = (previa + paso).min(origen + longitud);
        posiciones.push(posicion);
        previa = posicion;
    }

    (0..lista.len())
        .map(|i| {
            let a = posiciones[i];
            let b = posiciones.get(i + 1).copied().unwrap_or(origen + longitud);
            (a, b, lista[i].curva, lista[i].fase)
        })
        .collect()
}

/// Valor del delta en un índice; si es `None` usa el vecino válido más cercano.
fn delta_cercano(delta: &[Option<f64>], indice: usize) -> Option<f64> {
    let n = delta.len();
    for distancia in 0..n {
        if let Some(v) = indice.checked_sub(distancia).and_then(|i| delta[i]) {
            return Some(v);
        }
        if let Some(v) = delta.get(indice + distancia).copied().flatten() {
            return Some(v);
        }
    }
    None
}

/// Índice de la grilla más cercano a un `s` de `[0, L]`.
fn indice_de(s: &[f64], valor: f64) -> usize {
    let i = s.partition_point(|&x| x < valor);
    if i == 0 {
        return 0;
    }
    if i >= s.len() {
        return s.len() - 1;
    }
    if valor - s[i - 1] <= s[i] - valor {
        i - 1
    } else {
        i
    }
}

/// Δt(b) − Δt(a) sobre `s` extendido, partiendo en la meta.
fn perdida(delta: &[Option<f64>], s: &[f64], a: f64, b: f64) -> f64 {
    let longitud = s[s.len() - 1];
    let mut total = 0.0;
    let mut desde = a;
    while desde < b - 1e-9 {
        let k = (desde / longitud).floor();
        let base = k * longitud;
        let hasta = b.min(base + longitud);
        let i0 = indice_de(s, desde - base);
        let i1 = indice_de(s, hasta - base);
        let (Some(d0), Some(d1)) = (delta_cercano(delta, i0), delta_cercano(delta, i1)) else {
            return f64::NAN;
        };
        total += d1 - d0;
        desde = hasta;
    }
    total
}

/// Calcula el ranking de zonas (ING30–ING33).
pub fn ranking(
    delta: &[Option<f64>],
    a: &DatosVuelta<'_>,
    b: &DatosVuelta<'_>,
    deltas_fases: &[DeltaFasesCurva],
) -> Ranking {
    let s = &a.alineada.s;
    if s.len() < 2 {
        return Ranking::default();
    }
    let longitud = s[s.len() - 1];
    let pendiente = pendiente_delta(delta, s);

    let mut segmentos: Vec<Segmento> = cortes(a.fases, longitud)
        .into_iter()
        .filter(|(ini, fin, _, _)| fin - ini > 1e-9)
        .map(|(ini, fin, curva, fase)| {
            let perdida_s = perdida(delta, s, ini, fin);
            let (s_max, p_max) = puntos_de_tramo(s, ini, fin)
                .iter()
                .filter_map(|p| Some((s[p.indice], pendiente.get(p.indice).copied().flatten()?)))
                .fold((f64::NAN, f64::NAN), |mejor, actual| {
                    if mejor.1.is_nan() || actual.1 > mejor.1 {
                        actual
                    } else {
                        mejor
                    }
                });
            let nombre = match (curva, fase) {
                (None, _) => "Vuelta".to_string(),
                (Some(n), Fase::Recta) => format!("Recta tras C{n}"),
                (Some(n), fase) => format!("C{n} · {}", fase.etiqueta()),
            };
            Segmento {
                curva,
                fase,
                nombre,
                s_ini: s_en_pista(ini, longitud),
                s_fin: s_en_pista(fin, longitud),
                largo_m: fin - ini,
                perdida_s,
                porcentaje: f64::NAN,
                s_pendiente_max: s_max,
                pendiente_max: p_max,
                causas: Vec::new(),
                a: ini,
                b: fin,
            }
        })
        .collect();

    // Delta total = extremo final − extremo inicial (lo mismo que la suma).
    let delta_total_s = match (delta_cercano(delta, s.len() - 1), delta_cercano(delta, 0)) {
        (Some(fin), Some(ini)) => fin - ini,
        _ => f64::NAN,
    };
    let suma_perdidas_s: f64 = segmentos
        .iter()
        .map(|seg| seg.perdida_s)
        .filter(|p| p.is_finite() && *p > 0.0)
        .sum();

    for seg in &mut segmentos {
        if seg.perdida_s > 0.0 && suma_perdidas_s > 0.0 {
            seg.porcentaje = seg.perdida_s / suma_perdidas_s * 100.0;
        }
        seg.causas = causas(seg, a, b, deltas_fases);
    }

    let mut perdidas: Vec<Segmento> = segmentos
        .iter()
        .filter(|seg| seg.perdida_s > PERDIDA_MIN_S)
        .cloned()
        .collect();
    perdidas.sort_by(|x, y| {
        y.perdida_s
            .total_cmp(&x.perdida_s)
            .then(x.a.total_cmp(&y.a))
    });
    perdidas.truncate(RANKING_TOP);

    let mut ganancias: Vec<Segmento> = segmentos
        .iter()
        .filter(|seg| seg.perdida_s < -PERDIDA_MIN_S)
        .cloned()
        .collect();
    ganancias.sort_by(|x, y| {
        x.perdida_s
            .total_cmp(&y.perdida_s)
            .then(x.a.total_cmp(&y.a))
    });
    ganancias.truncate(GANANCIAS_TOP);

    Ranking {
        segmentos,
        perdidas,
        ganancias,
        delta_total_s,
        suma_perdidas_s,
    }
}

/// Reglas de causa probable (ING32). Se escriben desde A: "A frena antes".
fn causas(
    seg: &Segmento,
    a: &DatosVuelta<'_>,
    b: &DatosVuelta<'_>,
    deltas: &[DeltaFasesCurva],
) -> Vec<String> {
    let mut salida = Vec::new();
    if !(seg.perdida_s > PERDIDA_MIN_S) {
        return salida;
    }
    let Some(n) = seg.curva else {
        return vec!["Sin causa clara".to_string()];
    };
    let delta = deltas.iter().find(|d| d.n == n);
    let fa = a.fases.iter().find(|f| f.n == n);
    let fb = b.fases.iter().find(|f| f.n == n);

    let evento_solo_a = |tipo: TipoSlip, fases: &[Fase]| -> Option<usize> {
        let en = |eventos: &[EventoSlip]| {
            eventos
                .iter()
                .find(|e| e.tipo == tipo && e.curva == Some(n) && fases.contains(&e.fase))
                .map(|e| e.rueda)
        };
        match (en(a.eventos), en(b.eventos)) {
            (Some(rueda), None) => Some(rueda),
            _ => None,
        }
    };
    let balance = |datos: &DatosVuelta<'_>, fase: Fase| {
        datos
            .balance
            .iter()
            .find(|bal| bal.n == n)
            .and_then(|bal| bal.diagnostico(fase))
    };
    let balance_nuevo = |fase: Fase| -> Option<Diagnostico> {
        let da = balance(a, fase)?;
        let db = balance(b, fase);
        (da != Diagnostico::Neutro && db != Some(da)).then_some(da)
    };
    let texto_balance = |fase: Fase, salida: &mut Vec<String>| {
        if let Some(diagnostico) = balance_nuevo(fase) {
            let nombre = match diagnostico {
                Diagnostico::Subvira => "Subviraje",
                Diagnostico::Sobrevira => "Sobreviraje",
                Diagnostico::Neutro => return,
            };
            salida.push(format!("{nombre} en {} (B no)", articulo(fase)));
        }
    };

    match seg.fase {
        Fase::Frenada => {
            if let Some(d) = delta {
                if d.d_inicio_frenada_m < -CAUSA_FRENADA_M {
                    salida.push(format!("Frena {:.0} m antes", -d.d_inicio_frenada_m));
                } else if d.d_inicio_frenada_m > CAUSA_FRENADA_M {
                    salida.push(format!(
                        "Frena {:.0} m más tarde: posible frenada pasada",
                        d.d_inicio_frenada_m
                    ));
                }
                if d.d_freno_max < -CAUSA_FRENO {
                    if let (Some(fa), Some(fb)) = (fa, fb) {
                        salida.push(format!(
                            "Menos presión de freno ({:.0} % contra {:.0} %)",
                            fa.freno_max * 100.0,
                            fb.freno_max * 100.0
                        ));
                    }
                }
            }
            if let Some(rueda) = evento_solo_a(TipoSlip::Bloqueo, &[Fase::Frenada, Fase::Entrada]) {
                salida.push(format!("Bloqueo de la rueda {}", RUEDAS[rueda]));
            }
        }
        Fase::Entrada | Fase::Vertice => {
            if let Some(d) = delta {
                if d.d_v_min < -CAUSA_V_MIN_KMH {
                    salida.push(format!("{:.1} km/h menos de mínima", -d.d_v_min));
                }
                if seg.fase == Fase::Entrada {
                    if let (Some(fa), Some(fb)) = (fa, fb) {
                        if d.d_trail_m < -CAUSA_TRAIL_M {
                            salida.push(format!(
                                "Menos trail braking ({:.0} m contra {:.0} m)",
                                fa.trail_m, fb.trail_m
                            ));
                        } else if d.d_trail_m > CAUSA_TRAIL_M {
                            salida.push(format!(
                                "Más trail braking ({:.0} m contra {:.0} m)",
                                fa.trail_m, fb.trail_m
                            ));
                        }
                    }
                }
                if d.d_coasting_m > CAUSA_COASTING_M {
                    salida.push(format!(
                        "{:.0} m más sin pedales (coasting)",
                        d.d_coasting_m
                    ));
                }
            }
            if let Some(rueda) = evento_solo_a(TipoSlip::Bloqueo, &[seg.fase]) {
                salida.push(format!("Bloqueo de la rueda {}", RUEDAS[rueda]));
            }
            texto_balance(seg.fase, &mut salida);
        }
        Fase::Salida => {
            if let (Some(d), Some(fa), Some(fb)) = (delta, fa, fb) {
                if d.d_vertice_a_gas_m > CAUSA_GAS_M {
                    salida.push(format!(
                        "Gas a fondo {:.0} m más tarde desde el vértice",
                        d.d_vertice_a_gas_m
                    ));
                } else if fa.s_gas_fondo.is_nan() && fb.s_gas_fondo.is_finite() {
                    salida.push("No llega a gas a fondo (B sí)".to_string());
                }
                if d.d_coasting_m > CAUSA_COASTING_M {
                    salida.push(format!(
                        "{:.0} m más sin pedales (coasting)",
                        d.d_coasting_m
                    ));
                }
            }
            if let Some(rueda) =
                evento_solo_a(TipoSlip::Patinamiento, &[Fase::Salida, Fase::Vertice])
            {
                salida.push(format!("Patinamiento de la rueda {}", RUEDAS[rueda]));
            }
            texto_balance(Fase::Salida, &mut salida);
        }
        Fase::Recta => {
            let puntos = puntos_de_tramo(&a.alineada.s, seg.a, seg.b);
            let dv: Vec<f64> = puntos
                .iter()
                .filter_map(|p| {
                    Some(
                        valor(&a.alineada.velocidad_kmh, p.indice)?
                            - valor(&b.alineada.velocidad_kmh, p.indice)?,
                    )
                })
                .collect();
            if let Some(&inicial) = dv.first() {
                let media = dv.iter().sum::<f64>() / dv.len() as f64;
                let maxima_a = puntos
                    .iter()
                    .filter_map(|p| valor(&a.alineada.velocidad_kmh, p.indice))
                    .fold(f64::NAN, f64::max);
                let maxima_b = puntos
                    .iter()
                    .filter_map(|p| valor(&b.alineada.velocidad_kmh, p.indice))
                    .fold(f64::NAN, f64::max);
                if inicial < -CAUSA_VEL_RECTA_KMH && media < -CAUSA_VEL_RECTA_KMH {
                    salida.push(format!(
                        "Arrastra la salida de C{n}: {:.1} km/h menos al empezar la recta",
                        -inicial
                    ));
                } else if maxima_a - maxima_b < -CAUSA_VEL_RECTA_KMH {
                    salida.push(format!(
                        "Menos velocidad punta ({:.1} km/h); puede ser el auto",
                        maxima_b - maxima_a
                    ));
                }
            }
        }
    }

    if salida.is_empty() {
        salida.push("Sin causa clara".to_string());
    }
    salida
}

fn articulo(fase: Fase) -> &'static str {
    match fase {
        Fase::Entrada => "la entrada",
        Fase::Vertice => "el vértice",
        Fase::Salida => "la salida",
        Fase::Frenada => "la frenada",
        Fase::Recta => "la recta",
    }
}
