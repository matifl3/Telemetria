//! Tests del análisis de ingeniero (spec/analisis-ingeniero/tareas.md).
//!
//! Las vueltas se construyen ya alineadas a una grilla de 1 m, con perfiles de
//! velocidad y pedales conocidos, para poder verificar cada métrica.

use acreplay_core::alineado::VueltaAlineada;
use acreplay_core::balance::{balance_vuelta, BalanceCurva, Diagnostico};
use acreplay_core::consistencia::{consistencia, VueltaConsistencia};
use acreplay_core::curvas::{CurvaPista, Sentido};
use acreplay_core::fases::{delta_fases, fases_curva, fases_de_vuelta, Fase};
use acreplay_core::ranking::{pendiente_delta, ranking, DatosVuelta};
use acreplay_core::senales::{curvatura_trayectoria, tasa_de_yaw};
use acreplay_core::slip::{eventos_slip, resumen_por_curva, ubicar_eventos, TipoSlip};

const LARGO: usize = 1000;

fn curva(n: usize, s_ini: f64, s_apex: f64, s_fin: f64) -> CurvaPista {
    CurvaPista {
        n,
        nombre: format!("C{n}"),
        s_ini,
        s_apex,
        s_fin,
        largo: s_fin - s_ini,
        radio_min: 50.0,
        giro: 1.0,
        sentido: Sentido::Derecha,
    }
}

/// Perfil de una vuelta con una curva en 400–500 m (vértice en 450).
#[derive(Clone, Copy)]
struct Perfil {
    /// Inicio de frenada (m).
    frenada: f64,
    /// Freno máximo (0..1).
    freno: f64,
    /// Fin del freno (m): entre 400 y 450 hay trail braking.
    fin_freno: f64,
    /// Velocidad mínima (km/h).
    v_min: f64,
    /// Inicio de la aceleración (m); gas a fondo 30 m después.
    gas: f64,
}

impl Default for Perfil {
    fn default() -> Self {
        Self {
            frenada: 300.0,
            freno: 1.0,
            fin_freno: 440.0,
            v_min: 80.0,
            gas: 470.0,
        }
    }
}

fn rampa(x: f64, x0: f64, x1: f64, y0: f64, y1: f64) -> f64 {
    if x <= x0 {
        y0
    } else if x >= x1 {
        y1
    } else {
        y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    }
}

fn vuelta(perfil: Perfil) -> VueltaAlineada {
    let s: Vec<f64> = (0..=LARGO).map(|i| i as f64).collect();
    let velocidad: Vec<f64> = s
        .iter()
        .map(|&x| {
            if x < perfil.frenada {
                250.0
            } else if x < 450.0 {
                rampa(x, perfil.frenada, 450.0, 250.0, perfil.v_min)
            } else if x < perfil.gas {
                perfil.v_min
            } else {
                rampa(x, perfil.gas, perfil.gas + 200.0, perfil.v_min, 250.0)
            }
        })
        .collect();
    let mut tiempo = vec![Some(0.0)];
    for i in 1..s.len() {
        let v = (velocidad[i - 1] + velocidad[i]) / 2.0 / 3.6;
        tiempo.push(Some(tiempo[i - 1].unwrap() + 1.0 / v));
    }
    let freno = s
        .iter()
        .map(|&x| {
            let f = if x < perfil.frenada || x >= perfil.fin_freno {
                0.0
            } else if x < 400.0 {
                perfil.freno
            } else {
                rampa(x, 400.0, perfil.fin_freno, perfil.freno, 0.0)
            };
            Some(f as f32)
        })
        .collect();
    let gas = s
        .iter()
        .map(|&x| {
            let g = if x < perfil.frenada {
                1.0
            } else if x < perfil.gas {
                0.0
            } else {
                rampa(x, perfil.gas, perfil.gas + 30.0, 0.0, 1.0)
            };
            Some(g as f32)
        })
        .collect();
    let volante = s
        .iter()
        .map(|&x| {
            let v = if x < 390.0 || x > 520.0 {
                0.0
            } else if x < 410.0 {
                rampa(x, 390.0, 410.0, 0.0, 0.3)
            } else if x < 500.0 {
                0.3
            } else {
                rampa(x, 500.0, 520.0, 0.3, 0.0)
            };
            Some(v as f32)
        })
        .collect();
    let n = s.len();
    VueltaAlineada {
        velocidad_kmh: velocidad.iter().map(|&v| Some(v as f32)).collect(),
        tiempo,
        freno,
        gas,
        volante,
        yaw: vec![Some(0.0); n],
        acc_lat: vec![Some(0.0); n],
        x: vec![Some(0.0); n],
        z: s.iter().map(|&x| Some(x as f32)).collect(),
        slip_ratio: std::array::from_fn(|_| vec![Some(0.0); n]),
        s,
        ..VueltaAlineada::default()
    }
}

fn curvas() -> Vec<CurvaPista> {
    vec![curva(1, 400.0, 450.0, 500.0)]
}

// --- Fase 1 -----------------------------------------------------------------

/// Vuelta sobre un círculo de radio `radio` a velocidad constante.
fn circulo(radio: f64, kmh: f64, volante: f64) -> VueltaAlineada {
    let largo = (std::f64::consts::TAU * radio) as usize;
    let s: Vec<f64> = (0..=largo).map(|i| i as f64).collect();
    let v = kmh / 3.6;
    let angulo = |x: f64| x / radio;
    let n = s.len();
    VueltaAlineada {
        tiempo: s.iter().map(|&x| Some(x / v)).collect(),
        velocidad_kmh: vec![Some(kmh as f32); n],
        x: s.iter()
            .map(|&x| Some((radio * angulo(x).sin()) as f32))
            .collect(),
        z: s.iter()
            .map(|&x| Some((radio * angulo(x).cos()) as f32))
            .collect(),
        // Rumbo de la trayectoria = atan2(dx, dz) = θ + π/2.
        yaw: s
            .iter()
            .map(|&x| Some((angulo(x) + std::f64::consts::FRAC_PI_2) as f32))
            .collect(),
        volante: vec![Some(volante as f32); n],
        acc_lat: vec![Some((v * v / radio) as f32); n],
        s,
        ..VueltaAlineada::default()
    }
}

#[test]
fn ing07_tasa_de_yaw_y_curvatura_en_un_circulo() {
    let radio = 100.0;
    let vuelta = circulo(radio, 72.0, 0.1);
    let v = 72.0 / 3.6;
    let tasa = tasa_de_yaw(&vuelta);
    let curvatura = curvatura_trayectoria(&vuelta);
    for i in 20..vuelta.s.len() - 20 {
        let t = tasa[i].unwrap();
        assert!((t - v / radio).abs() / (v / radio) < 0.01, "tasa {t}");
        let k = curvatura[i].unwrap();
        assert!(
            (k.abs() - 1.0 / radio).abs() * radio < 0.01,
            "curvatura {k}"
        );
    }
}

// --- Fase 2 -----------------------------------------------------------------

#[test]
fn ing10_la_frenada_se_busca_antes_del_arco() {
    let fases = fases_curva(&vuelta(Perfil::default()), &curvas(), 0).unwrap();
    assert!(fases.con_frenada);
    assert!(
        (fases.s_inicio_frenada - 300.0).abs() <= 1.0,
        "{}",
        fases.s_inicio_frenada
    );
    assert!(fases.s_inicio_frenada < 400.0);
}

#[test]
fn ing11_puntos_de_fase_de_una_curva_completa() {
    let f = fases_curva(&vuelta(Perfil::default()), &curvas(), 0).unwrap();
    // Turn-in: primer volante >= 25 % del máximo (0.075 rad) → 395 m.
    assert!(
        (f.s_turn_in - 395.0).abs() <= 1.0,
        "turn-in {}",
        f.s_turn_in
    );
    assert!(
        (f.s_vertice - 450.0).abs() <= 20.0,
        "vértice {}",
        f.s_vertice
    );
    assert!(
        (f.s_gas_fondo - 500.0).abs() <= 1.5,
        "gas {}",
        f.s_gas_fondo
    );
    let l = f.limites;
    assert!(l.inicio <= l.turn_in && l.turn_in <= l.vertice_ini);
    assert!(l.vertice_ini <= l.vertice && l.vertice <= l.vertice_fin && l.vertice_fin <= l.fin);
}

#[test]
fn ing11_curva_a_fondo_sin_frenada() {
    let perfil = Perfil {
        freno: 0.0,
        ..Perfil::default()
    };
    let f = fases_curva(&vuelta(perfil), &curvas(), 0).unwrap();
    assert!(!f.con_frenada);
    assert!(f.s_inicio_frenada.is_nan());
    assert_eq!(f.limites.inicio, f.limites.turn_in);
    assert_eq!(f.trail_m, 0.0);
}

#[test]
fn ing12_presion_de_freno() {
    let perfil = Perfil {
        freno: 0.8,
        ..Perfil::default()
    };
    let f = fases_curva(&vuelta(perfil), &curvas(), 0).unwrap();
    assert!((f.freno_max - 0.8).abs() < 1e-6);
    assert!(f.freno_medio > 0.6 && f.freno_medio <= 0.8);
}

#[test]
fn ing13_trail_braking() {
    let f = fases_curva(&vuelta(Perfil::default()), &curvas(), 0).unwrap();
    // Freno > 5 % hasta ~438 m, con volante desde 395 m.
    assert!(f.trail_m > 35.0 && f.trail_m < 46.0, "trail {}", f.trail_m);
    assert!(f.freno_en_turn_in > 0.9);

    let sin_trail = Perfil {
        fin_freno: 395.0,
        ..Perfil::default()
    };
    let f = fases_curva(&vuelta(sin_trail), &curvas(), 0).unwrap();
    assert_eq!(f.trail_m, 0.0);
}

#[test]
fn ing14_coasting() {
    let f = fases_curva(&vuelta(Perfil::default()), &curvas(), 0).unwrap();
    // Sin pedales desde que el freno baja de 5 % (~438 m) hasta que el gas
    // supera 5 % (~471.5 m).
    assert!(
        f.coasting_m > 30.0 && f.coasting_m < 36.0,
        "coasting {}",
        f.coasting_m
    );
    assert!(f.coasting_s > 0.0);
}

#[test]
fn ing15_vertice_a_gas_a_fondo() {
    let normal = fases_curva(&vuelta(Perfil::default()), &curvas(), 0).unwrap();
    let tarde = fases_curva(
        &vuelta(Perfil {
            gas: 500.0,
            ..Perfil::default()
        }),
        &curvas(),
        0,
    )
    .unwrap();
    assert!(tarde.vertice_a_gas_m > normal.vertice_a_gas_m + 25.0);

    // Gas que nunca llega al 98 %.
    let mut sin_fondo = vuelta(Perfil::default());
    for g in sin_fondo.gas.iter_mut() {
        *g = g.map(|v| v.min(0.9));
    }
    let f = fases_curva(&sin_fondo, &curvas(), 0).unwrap();
    assert!(f.vertice_a_gas_m.is_nan());
    assert!(f.s_gas_fondo.is_nan());
}

#[test]
fn ing16_delta_por_fase() {
    let a = fases_de_vuelta(
        &vuelta(Perfil {
            frenada: 280.0,
            ..Perfil::default()
        }),
        &curvas(),
    );
    let b = fases_de_vuelta(&vuelta(Perfil::default()), &curvas());
    let d = &delta_fases(&a, &b, LARGO as f64)[0];
    assert!(
        (d.d_inicio_frenada_m + 20.0).abs() <= 1.0,
        "{}",
        d.d_inicio_frenada_m
    );
    assert!(
        d.d_t_frenada > 0.0,
        "A frena antes: tarda más en la frenada"
    );
}

#[test]
fn ing10_aproximacion_que_cruza_la_meta() {
    // Curva al principio de la vuelta: la frenada empieza antes de la meta.
    let s: Vec<f64> = (0..=LARGO).map(|i| i as f64).collect();
    let n = s.len();
    let mut vuelta = vuelta(Perfil::default());
    let freno: Vec<Option<f32>> = s
        .iter()
        .map(|&x| Some(if x >= 950.0 || x < 60.0 { 1.0 } else { 0.0 }))
        .collect();
    let velocidad: Vec<Option<f32>> = s
        .iter()
        .map(|&x| {
            let v = if x >= 950.0 {
                rampa(x, 950.0, 1000.0, 250.0, 150.0)
            } else {
                rampa(x, 0.0, 100.0, 150.0, 100.0).max(if x > 100.0 { 250.0 } else { 0.0 })
            };
            Some(v as f32)
        })
        .collect();
    vuelta.freno = freno;
    vuelta.velocidad_kmh = velocidad;
    vuelta.volante = s
        .iter()
        .map(|&x| {
            Some(if (40.0..=120.0).contains(&x) {
                0.3
            } else {
                0.0
            })
        })
        .collect();
    vuelta.gas = vec![Some(0.0); n];
    let curvas = vec![curva(1, 50.0, 90.0, 120.0)];
    let f = fases_curva(&vuelta, &curvas, 0).unwrap();
    assert!(
        (f.s_inicio_frenada - 950.0).abs() <= 1.0,
        "{}",
        f.s_inicio_frenada
    );
    assert!(f.limites.inicio < 0.0);
}

// --- Fase 3 -----------------------------------------------------------------

#[test]
fn ing19_bloqueo_y_pico_aislado() {
    let mut v = vuelta(Perfil::default());
    for i in 350..=360 {
        v.slip_ratio[0][i] = Some(-0.5);
    }
    v.slip_ratio[3][700] = Some(0.5); // un solo punto: se descarta
    let mut eventos = eventos_slip(&v);
    assert_eq!(eventos.len(), 1);
    let e = &eventos[0];
    assert_eq!(e.rueda, 0);
    assert_eq!(e.tipo, TipoSlip::Bloqueo);
    assert!((e.largo_m - 10.0).abs() < 1e-9);
    assert!((e.pico + 0.5).abs() < 1e-6);

    let fases = fases_de_vuelta(&v, &curvas());
    ubicar_eventos(&mut eventos, &fases, LARGO as f64);
    assert_eq!(eventos[0].curva, Some(1));
    assert_eq!(eventos[0].fase, Fase::Frenada);
    let resumen = resumen_por_curva(&eventos);
    assert_eq!(resumen[0].bloqueos, 1);
    assert_eq!(resumen[0].rueda_principal, Some(0));
}

#[test]
fn ing19_a_baja_velocidad_no_hay_slip() {
    let mut v = vuelta(Perfil::default());
    for i in 0..=LARGO {
        v.velocidad_kmh[i] = Some(20.0);
        v.slip_ratio[2][i] = Some(0.9);
    }
    assert!(eventos_slip(&v).is_empty());
}

// --- Fase 4 -----------------------------------------------------------------

/// Círculo en dos mitades: lenta y neutra (calibra), rápida con `volante_rapido`.
fn circulo_dos_mitades(volante_rapido: f64) -> VueltaAlineada {
    let radio = 100.0;
    let mut v = circulo(radio, 45.0, 0.1);
    let mitad = v.s.len() / 2;
    let rapida = 100.0 / 3.6;
    let mut t = v.tiempo[mitad].unwrap();
    for i in mitad..v.s.len() {
        if i > mitad {
            t += (v.s[i] - v.s[i - 1]) / rapida;
        }
        v.tiempo[i] = Some(t);
        v.velocidad_kmh[i] = Some(100.0);
        v.volante[i] = Some(volante_rapido as f32);
        v.acc_lat[i] = Some((rapida * rapida / radio) as f32);
    }
    v
}

#[test]
fn ing25_indice_de_balance() {
    let neutro = balance_vuelta(&circulo(100.0, 45.0, 0.1));
    assert!(neutro.calibracion_neutra);
    for valor in neutro.indice.iter().skip(20).take(500).flatten() {
        assert!(valor.abs() < 0.05, "neutro {valor}");
    }

    let sub = circulo_dos_mitades(0.13);
    let balance = balance_vuelta(&sub);
    let i = sub.s.len() * 3 / 4;
    let valor = balance.indice[i].unwrap();
    assert!((valor - 0.3).abs() < 0.05, "subviraje {valor}");

    let sobre = circulo_dos_mitades(-0.05);
    let valor = balance_vuelta(&sobre).indice[i].unwrap();
    assert!(valor < -1.0, "contravolante {valor}");
}

#[test]
fn ing26_deriva_del_chasis() {
    let mut v = circulo(100.0, 72.0, 0.1);
    for i in 200..260 {
        v.yaw[i] = v.yaw[i].map(|y| y + 0.1);
    }
    let balance = balance_vuelta(&v);
    let beta = balance.deriva_rad[230].unwrap();
    assert!((beta.abs() - 0.1).abs() < 0.01, "β {beta}");
    assert!(balance.deriva_rad[100].unwrap().abs() < 0.01);
}

#[test]
fn ing27_diagnostico_por_fase() {
    let b = BalanceCurva {
        n: 1,
        entrada: 0.3,
        vertice: 0.0,
        salida: -0.4,
        deriva_max_grados: 3.0,
    };
    assert_eq!(b.diagnostico(Fase::Entrada), Some(Diagnostico::Subvira));
    assert_eq!(b.diagnostico(Fase::Vertice), Some(Diagnostico::Neutro));
    assert_eq!(b.diagnostico(Fase::Salida), Some(Diagnostico::Sobrevira));
}

// --- Fase 5 -----------------------------------------------------------------

fn delta(a: &VueltaAlineada, b: &VueltaAlineada) -> Vec<Option<f64>> {
    a.tiempo
        .iter()
        .zip(&b.tiempo)
        .map(|(x, y)| Some((*x)? - (*y)?))
        .collect()
}

fn ranking_de(pa: Perfil, pb: Perfil) -> acreplay_core::ranking::Ranking {
    let a = vuelta(pa);
    let b = vuelta(pb);
    let curvas = curvas();
    let fa = fases_de_vuelta(&a, &curvas);
    let fb = fases_de_vuelta(&b, &curvas);
    let deltas = delta_fases(&fa, &fb, LARGO as f64);
    let d = delta(&a, &b);
    ranking(
        &d,
        &DatosVuelta {
            alineada: &a,
            fases: &fa,
            eventos: &[],
            balance: &[],
        },
        &DatosVuelta {
            alineada: &b,
            fases: &fb,
            eventos: &[],
            balance: &[],
        },
        &deltas,
    )
}

#[test]
fn ing29_pendiente_del_delta() {
    let s: Vec<f64> = (0..=200).map(|i| i as f64).collect();
    // El delta crece 0.1 s entre 50 y 100 m: 0.2 s cada 100 m.
    let d: Vec<Option<f64>> = s
        .iter()
        .map(|&x| Some(rampa(x, 50.0, 100.0, 0.0, 0.1)))
        .collect();
    let p = pendiente_delta(&d, &s);
    assert!((p[75].unwrap() - 0.2).abs() < 1e-6);
    assert!(p[10].unwrap().abs() < 1e-9);
}

#[test]
fn ing31_la_suma_de_perdidas_es_el_delta_final() {
    let r = ranking_de(
        Perfil {
            gas: 500.0,
            ..Perfil::default()
        },
        Perfil::default(),
    );
    let suma: f64 = r.segmentos.iter().map(|s| s.perdida_s).sum();
    assert!(
        (suma - r.delta_total_s).abs() < 1e-3,
        "{suma} vs {}",
        r.delta_total_s
    );
    let cubierto: f64 = r.segmentos.iter().map(|s| s.largo_m).sum();
    assert!((cubierto - LARGO as f64).abs() < 1e-6);
}

#[test]
fn ing32_gas_tarde_es_la_mayor_perdida() {
    let r = ranking_de(
        Perfil {
            gas: 500.0,
            ..Perfil::default()
        },
        Perfil::default(),
    );
    let primera = &r.perdidas[0];
    assert!(
        primera.nombre == "C1 · salida" || primera.nombre == "Recta tras C1",
        "{}",
        primera.nombre
    );
    let salida = r
        .segmentos
        .iter()
        .find(|s| s.nombre == "C1 · salida")
        .unwrap();
    assert!(
        salida.causas.iter().any(|c| c.contains("Gas a fondo")),
        "{:?}",
        salida.causas
    );
    let recta = r
        .segmentos
        .iter()
        .find(|s| s.nombre == "Recta tras C1")
        .unwrap();
    assert!(
        recta
            .causas
            .iter()
            .any(|c| c.contains("Arrastra la salida")),
        "{:?}",
        recta.causas
    );
    assert!((r.perdidas.iter().map(|p| p.porcentaje).sum::<f64>() - 100.0).abs() < 1e-6);
}

#[test]
fn ing32_frenar_antes_se_explica() {
    let r = ranking_de(
        Perfil {
            frenada: 260.0,
            ..Perfil::default()
        },
        Perfil::default(),
    );
    let frenada = r
        .segmentos
        .iter()
        .find(|s| s.nombre == "C1 · frenada")
        .unwrap();
    assert!(frenada.perdida_s > 0.0);
    assert!(
        frenada
            .causas
            .iter()
            .any(|c| c.starts_with("Frena 40 m antes")),
        "{:?}",
        frenada.causas
    );
}

#[test]
fn ing33_vueltas_iguales_no_tienen_perdidas() {
    let r = ranking_de(Perfil::default(), Perfil::default());
    assert!(r.perdidas.is_empty());
    assert!(r.ganancias.is_empty());
    assert!(r.delta_total_s.abs() < 1e-9);
}

// --- Fase 6 -----------------------------------------------------------------

#[test]
fn ing36_dispersion_por_curva() {
    let vueltas: Vec<VueltaAlineada> = [300.0, 310.0, 320.0]
        .iter()
        .map(|&frenada| {
            vuelta(Perfil {
                frenada,
                ..Perfil::default()
            })
        })
        .collect();
    let fases: Vec<_> = vueltas
        .iter()
        .map(|v| fases_de_vuelta(v, &curvas()))
        .collect();
    let entradas: Vec<VueltaConsistencia<'_>> = vueltas
        .iter()
        .zip(&fases)
        .map(|(v, f)| VueltaConsistencia {
            tiempo_s: v.tiempo.last().unwrap().unwrap(),
            alineada: v,
            fases: f,
        })
        .collect();
    let c = consistencia(&entradas, &curvas());
    assert!(c.aviso.is_none());
    assert_eq!(c.vueltas_usadas, 3);
    let curva = &c.curvas[0];
    assert!((curva.rango_inicio_frenada_m - 20.0).abs() <= 1.0);
    assert!((curva.desvio_inicio_frenada_m - 10.0).abs() <= 1.0);
    assert!(
        curva.explicacion.starts_with("Frena en un rango de"),
        "{}",
        curva.explicacion
    );
    assert_eq!(c.desvio_velocidad.len(), LARGO + 1);
}

#[test]
fn ing39_con_pocas_vueltas_hay_aviso() {
    let v = vuelta(Perfil::default());
    let f = fases_de_vuelta(&v, &curvas());
    let lenta = VueltaConsistencia {
        tiempo_s: 200.0,
        alineada: &v,
        fases: &f,
    };
    let entradas = vec![
        VueltaConsistencia {
            tiempo_s: 100.0,
            alineada: &v,
            fases: &f,
        },
        VueltaConsistencia {
            tiempo_s: 101.0,
            alineada: &v,
            fases: &f,
        },
        lenta,
    ];
    let c = consistencia(&entradas, &curvas());
    assert_eq!(c.vueltas_excluidas, 1);
    assert!(c.aviso.is_some());
    assert!(c.curvas.is_empty());
}
