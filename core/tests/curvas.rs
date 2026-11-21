mod soporte;

use acreplay_core::curvas::{
    curvatura, delta_curvas, metricas_curva, CanalesAlineados, CurvaPista, Sentido, CURVA_GIRO_MIN,
    CURVA_LARGO_MIN,
};
use acreplay_core::pista::{parsear_pista, Pista};
use soporte::pista::{ConstructorPista, SentidoFixture, TramoFixture};

fn pista_de(constructor: &ConstructorPista) -> Pista {
    parsear_pista(&constructor.bytes(), "fast_lane.ai").expect("pista sintética válida")
}

fn cerca(a: f64, b: f64, tolerancia: f64) -> bool {
    (a - b).abs() <= tolerancia
}

fn ovalo() -> ConstructorPista {
    ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(120.0),
            TramoFixture::arco(40.0, SentidoFixture::Derecha, 180.0),
            TramoFixture::recta(120.0),
            TramoFixture::arco(40.0, SentidoFixture::Derecha, 180.0),
        ],
        1.5,
    )
}

#[test]
fn t54_curvatura_de_un_circulo_coincide_con_1_radio() {
    let radio = 200.0;
    let pista = pista_de(&ConstructorPista::circular(radio, 1_000));
    let kappa = curvatura(&pista);
    assert_eq!(kappa.len(), pista.puntos());
    for (indice, valor) in kappa.iter().enumerate() {
        assert!(
            cerca(*valor, 1.0 / radio as f64, 1e-4),
            "punto {indice}: κ={valor} (esperado {})",
            1.0 / radio as f64
        );
    }
}

#[test]
fn t55_histéresis_produce_un_solo_arco() {
    let pista = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(100.0),
            TramoFixture::arco(50.0, SentidoFixture::Derecha, 90.0),
            TramoFixture::recta(100.0),
        ],
        1.5,
    ));
    assert_eq!(pista.curvas.len(), 1, "{:?}", pista.curvas);
    let curva = &pista.curvas[0];
    assert!(curva.largo > 70.0, "largo {}", curva.largo);
    assert!(cerca(curva.radio_min, 50.0, 1.5), "Rmin {}", curva.radio_min);
    assert_eq!(curva.sentido, Sentido::Derecha);
}

#[test]
fn t56_doble_apice_se_une_en_una_curva() {
    let pista = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(80.0),
            TramoFixture::arco(50.0, SentidoFixture::Derecha, 60.0),
            TramoFixture::recta(20.0),
            TramoFixture::arco(50.0, SentidoFixture::Derecha, 60.0),
            TramoFixture::recta(80.0),
        ],
        1.5,
    ));
    assert_eq!(pista.curvas.len(), 1, "{:?}", pista.curvas);
}

#[test]
fn t57_arcos_cortos_se_descartan_y_el_sentido_es_correcto() {
    let corta = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(80.0),
            TramoFixture::arco(5.0, SentidoFixture::Derecha, 10.0),
            TramoFixture::recta(80.0),
        ],
        1.5,
    ));
    assert!(
        corta.curvas.is_empty(),
        "un arco corto no debería quedar: {:?}",
        corta.curvas
    );

    let derecha = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(80.0),
            TramoFixture::arco(50.0, SentidoFixture::Derecha, 90.0),
            TramoFixture::recta(80.0),
        ],
        1.5,
    ));
    let izquierda = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(80.0),
            TramoFixture::arco(50.0, SentidoFixture::Izquierda, 90.0),
            TramoFixture::recta(80.0),
        ],
        1.5,
    ));
    assert_eq!(derecha.curvas[0].sentido, Sentido::Derecha);
    assert_eq!(izquierda.curvas[0].sentido, Sentido::Izquierda);
    assert!(derecha.curvas[0].giro >= CURVA_GIRO_MIN);
}

#[test]
fn t58_numeracion_y_cache_en_pista() {
    let pista = pista_de(&ovalo());
    assert_eq!(pista.detecciones_curvas, 1);
    assert_eq!(pista.curvas.len(), 2, "{:?}", pista.curvas);
    for (indice, curva) in pista.curvas.iter().enumerate() {
        assert_eq!(curva.n, indice + 1);
        assert_eq!(curva.nombre, format!("C{}", indice + 1));
    }
    assert!(pista.curvas[0].s_ini < pista.curvas[1].s_ini);

    // Consultar las curvas no vuelve a detectarlas.
    let antes = pista.curvas().len();
    assert_eq!(antes, 2);
    assert_eq!(pista.detecciones_curvas, 1);
}

#[test]
fn t59_curva_que_cruza_la_meta_queda_entera() {
    let inicio_arco = 120.0;
    let mitad_arco = std::f32::consts::PI * 40.0 / 2.0;
    let pista = pista_de(&ovalo().rotar_a_s(inicio_arco + mitad_arco));
    assert_eq!(pista.curvas.len(), 2, "{:?}", pista.curvas);

    let cruza = pista
        .curvas
        .iter()
        .find(|curva| curva.s_fin > pista.longitud_m)
        .expect("una curva debe cruzar la meta");
    assert!(
        cruza.largo > 100.0,
        "la curva partida quedaría corta: {}",
        cruza.largo
    );
    assert!(cruza.s_ini > pista.longitud_m / 2.0);
    assert!(cerca(cruza.radio_min, 40.0, 2.0), "Rmin {}", cruza.radio_min);
}

#[test]
fn t60_pista_sintetica_sin_fantasmas_ni_faltantes() {
    let pista = pista_de(&ovalo());
    assert_eq!(pista.curvas.len(), 2, "{:?}", pista.curvas);
    for curva in &pista.curvas {
        assert_eq!(curva.sentido, Sentido::Derecha);
        assert!(curva.largo >= CURVA_LARGO_MIN);
        assert!(cerca(curva.radio_min, 40.0, 2.0), "Rmin {}", curva.radio_min);
        assert!(curva.s_ini >= 0.0);
        assert!(curva.s_apex >= curva.s_ini);
        assert!(curva.s_apex <= curva.s_fin);
    }
    assert!(pista.curvas[0].s_ini < pista.curvas[1].s_ini);
}

#[test]
fn t60_chicane_l_r_l_conserva_los_tres_arcos() {
    let pista = pista_de(&ConstructorPista::desde_tramos(
        &[
            TramoFixture::recta(80.0),
            TramoFixture::arco(40.0, SentidoFixture::Derecha, 90.0),
            TramoFixture::recta(15.0),
            TramoFixture::arco(40.0, SentidoFixture::Izquierda, 90.0),
            TramoFixture::recta(15.0),
            TramoFixture::arco(40.0, SentidoFixture::Derecha, 90.0),
            TramoFixture::recta(80.0),
        ],
        1.5,
    ));
    assert_eq!(pista.curvas.len(), 3, "{:?}", pista.curvas);
    assert_eq!(pista.curvas[0].sentido, Sentido::Derecha);
    assert_eq!(pista.curvas[1].sentido, Sentido::Izquierda);
    assert_eq!(pista.curvas[2].sentido, Sentido::Derecha);
    for curva in &pista.curvas {
        assert!(cerca(curva.radio_min, 40.0, 2.0), "Rmin {}", curva.radio_min);
    }
}

#[test]
fn t61_cambiar_la_referencia_no_altera_las_curvas() {
    let bytes = ovalo().bytes();
    let a = parsear_pista(&bytes, "fast_lane.ai").unwrap();
    let b = parsear_pista(&bytes, "fast_lane.ai").unwrap();
    assert_eq!(a.curvas, b.curvas);
    assert_eq!(a.curvas(), b.curvas());
    assert_eq!(a.detecciones_curvas, 1);
    assert_eq!(b.detecciones_curvas, 1);
}

fn canal(valores: &[f32]) -> Vec<Option<f32>> {
    valores.iter().copied().map(Some).collect()
}

fn canal_tiempo(valores: &[f64]) -> Vec<Option<f64>> {
    valores.iter().copied().map(Some).collect()
}

/// Grilla de 0 a 100 m cada 10 m con una curva de 20 a 80 m.
fn caso_manual() -> (Vec<f64>, CurvaPista, Vec<f32>, Vec<f32>, Vec<f32>) {
    let s: Vec<f64> = (0..=10).map(|i| i as f64 * 10.0).collect();
    let curva = CurvaPista {
        n: 1,
        nombre: "C1".to_string(),
        s_ini: 20.0,
        s_apex: 50.0,
        s_fin: 80.0,
        largo: 60.0,
        radio_min: 30.0,
        giro: 1.0,
        sentido: Sentido::Derecha,
    };
    let velocidad = vec![100.0, 95.0, 90.0, 80.0, 70.0, 60.0, 70.0, 80.0, 85.0, 40.0, 30.0];
    let freno = vec![0.0, 0.0, 0.0, 0.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let gas = vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.95, 0.95, 0.95, 0.0, 0.0];
    (s, curva, velocidad, freno, gas)
}

#[test]
fn t62_metricas_por_curva_coinciden_con_el_caso_manual() {
    let (s, curva, velocidad, freno, gas) = caso_manual();
    let tiempos: Vec<f64> = s.iter().map(|valor| valor / 10.0).collect();
    let canales = CanalesAlineados {
        s: &s,
        velocidad: &canal(&velocidad),
        freno: &canal(&freno),
        gas: &canal(&gas),
        tiempo: &canal_tiempo(&tiempos),
    };

    let metricas = metricas_curva(&canales, &curva);
    assert!(cerca(metricas.v_min, 60.0, 1e-9));
    assert!(cerca(metricas.v_ini, 90.0, 1e-9));
    assert!(cerca(metricas.v_apex, 60.0, 1e-9));
    assert!(cerca(metricas.v_fin, 85.0, 1e-9));
    assert!(cerca(metricas.t_curva, 6.0, 1e-9));
    assert!(cerca(metricas.d_fren, 30.0, 1e-9));
    assert!(cerca(metricas.d_acel, 60.0, 1e-9));
}

#[test]
fn t63_delta_por_curva_coincide_con_el_caso_de_prueba() {
    let (s, curva, velocidad_a, freno, gas) = caso_manual();
    let tiempos_a: Vec<f64> = s.iter().map(|valor| valor / 10.0).collect();
    let velocidad_b: Vec<f32> = velocidad_a.iter().map(|valor| valor + 5.0).collect();
    let tiempos_b: Vec<f64> = s.iter().map(|valor| valor / 12.0).collect();

    let a = CanalesAlineados {
        s: &s,
        velocidad: &canal(&velocidad_a),
        freno: &canal(&freno),
        gas: &canal(&gas),
        tiempo: &canal_tiempo(&tiempos_a),
    };
    let b = CanalesAlineados {
        s: &s,
        velocidad: &canal(&velocidad_b),
        freno: &canal(&freno),
        gas: &canal(&gas),
        tiempo: &canal_tiempo(&tiempos_b),
    };
    let delta = delta_curvas(std::slice::from_ref(&curva), &a, &b);
    assert_eq!(delta.len(), 1);
    let d = &delta[0];
    assert!(cerca(d.d_t, 6.0 - 5.0, 1e-9), "dT {}", d.d_t);
    assert!(cerca(d.d_v_min, -5.0, 1e-9), "dvMin {}", d.d_v_min);
    assert!(cerca(d.d_v_apex, -5.0, 1e-9), "dvApex {}", d.d_v_apex);
    assert!(cerca(d.d_fren, 0.0, 1e-9));
    assert!(cerca(d.d_acel, 0.0, 1e-9));

    // A contra sí misma: todo cero.
    let mismo = delta_curvas(&[curva], &a, &a);
    assert!(cerca(mismo[0].d_t, 0.0, 1e-9));
    assert!(cerca(mismo[0].d_v_min, 0.0, 1e-9));
}

#[test]
fn t64_metricas_y_delta_toleran_huecos_y_cruce_de_meta() {
    let s: Vec<f64> = (0..=10).map(|i| i as f64 * 10.0).collect();
    let curva = CurvaPista {
        n: 1,
        nombre: "C1".to_string(),
        s_ini: 80.0,
        s_apex: 90.0,
        s_fin: 100.0,
        largo: 20.0,
        radio_min: 40.0,
        giro: 1.0,
        sentido: Sentido::Derecha,
    };
    let velocidad: Vec<Option<f32>> = vec![
        Some(50.0),
        Some(55.0),
        None,
        Some(65.0),
        Some(70.0),
        Some(75.0),
        Some(80.0),
        Some(85.0),
        Some(90.0),
        Some(45.0),
        Some(40.0),
    ];
    let freno: Vec<Option<f32>> = (0..11).map(|_| Some(0.0)).collect();
    let gas: Vec<Option<f32>> = (0..11).map(|_| Some(0.0)).collect();
    let tiempos: Vec<Option<f64>> = (0..=10).map(|i| Some(i as f64)).collect();

    let canales = CanalesAlineados {
        s: &s,
        velocidad: &velocidad,
        freno: &freno,
        gas: &gas,
        tiempo: &tiempos,
    };
    let metricas = metricas_curva(&canales, &curva);
    // La ventana es 80..100 (la parte 100..110 no existe en la grilla).
    assert!(cerca(metricas.v_ini, 90.0, 1e-9));
    assert!(cerca(metricas.v_fin, 40.0, 1e-9));
    assert!(cerca(metricas.v_min, 40.0, 1e-9));
    // t(100) - t(80) = 10 - 8.
    assert!(cerca(metricas.t_curva, 2.0, 1e-9));
    assert!(metricas.d_fren.is_nan());
    assert!(metricas.d_acel.is_nan());

    // Curva que cruza la meta: se recorren los dos rangos y el tiempo se
    // completa con la duración de la vuelta.
    let cruza = CurvaPista {
        n: 2,
        nombre: "C2".to_string(),
        s_ini: 80.0,
        s_apex: 90.0,
        s_fin: 105.0,
        largo: 25.0,
        radio_min: 40.0,
        giro: 1.0,
        sentido: Sentido::Derecha,
    };
    let metricas_cruza = metricas_curva(&canales, &cruza);
    assert!(cerca(metricas_cruza.v_ini, 90.0, 1e-9));
    assert!(cerca(metricas_cruza.v_fin, 50.0, 1e-9));
    assert!(cerca(metricas_cruza.v_min, 40.0, 1e-9));
    // t(0) + duración - t(80) = 0 + 10 - 8.
    assert!(cerca(metricas_cruza.t_curva, 2.0, 1e-9));
}
