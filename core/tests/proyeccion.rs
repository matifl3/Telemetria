mod soporte;

use acreplay_core::clasificacion::clasificar_vueltas;
use acreplay_core::error::Motivo;
use acreplay_core::pista::parsear_pista;
use acreplay_core::proyeccion::{
    ajustar_meta, ajustar_vuelta, proyectar, proyectar_serie, UMBRAL_ERROR_M, VENTANA_PUNTOS,
};
use acreplay_core::vuelta::{Series, Vuelta, VueltaId};
use soporte::pista::ConstructorPista;

fn cerca(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-6
}

fn pista_de(constructor: &ConstructorPista) -> acreplay_core::pista::Pista {
    parsear_pista(&constructor.bytes(), "fast_lane.ai").expect("pista sintética válida")
}

#[test]
fn t41_punto_sobre_la_linea_da_error_cero_y_su_s() {
    let pista = pista_de(&ConstructorPista::recta(11));

    let proyeccion = proyectar(&pista, 30.0, 0.0, None);
    assert_eq!(proyeccion.indice, 3);
    assert!(proyeccion.error_m.abs() < 1e-6, "{:?}", proyeccion.error_m);
    assert_eq!(proyeccion.s, Some(30.0));

    // Con índice previo también encuentra el punto exacto.
    let proyeccion = proyectar(&pista, 60.0, 0.0, Some(3));
    assert_eq!(proyeccion.indice, 6);
    assert_eq!(proyeccion.s, Some(60.0));
}

#[test]
fn t42_ventana_local_acierta_y_compara_menos_que_el_barrido() {
    let pista = pista_de(&ConstructorPista::circular(200.0, 1_000));
    let xs = pista.nx.clone();
    let zs = pista.nz.clone();

    let serie = proyectar_serie(&pista, &xs, &zs);
    assert_eq!(serie.descartadas, 0);
    assert_eq!(serie.total(), pista.puntos());
    for (muestra, &indice) in serie.indices.iter().enumerate() {
        assert_eq!(indice, muestra, "muestra {muestra}");
        assert!(cerca(serie.s[muestra], pista.ns[muestra] as f64));
    }

    let barrido_completo = pista.puntos() * pista.puntos();
    assert!(
        serie.comparaciones < barrido_completo,
        "{} comparaciones vs {barrido_completo} del barrido",
        serie.comparaciones
    );
    assert!(
        serie.comparaciones <= pista.puntos() * (2 * VENTANA_PUNTOS + 2),
        "{} comparaciones",
        serie.comparaciones
    );

    // Un índice previo equivocado no pierde la pista: entra el respaldo global.
    let rescate = proyectar(&pista, pista.nx[500], pista.nz[500], Some(5));
    assert_eq!(rescate.indice, 500);
    assert_eq!(rescate.s, Some(pista.ns[500] as f64));
    assert!(rescate.comparaciones > 2 * VENTANA_PUNTOS);
}

#[test]
fn t43_punto_a_100_m_queda_marcado_y_sin_s() {
    let pista = pista_de(&ConstructorPista::recta(11));

    let lejos = proyectar(&pista, 50.0, 100.0, Some(5));
    assert!(lejos.s.is_none());
    assert!(lejos.error_m >= UMBRAL_ERROR_M);
    assert!((lejos.error_m as f64 - 100.0).abs() < 1e-3, "{:?}", lejos.error_m);

    let serie = proyectar_serie(&pista, &[0.0, 10.0, 20.0, 30.0], &[0.0, 0.0, 100.0, 0.0]);
    assert_eq!(serie.descartadas, 1);
    assert!(serie.s[2].is_nan());
    assert!(serie.s[0].is_finite() && serie.s[1].is_finite() && serie.s[3].is_finite());
}

#[test]
fn t44_meta_se_desenrolla_y_la_vuelta_arranca_en_cero() {
    let mut s = vec![4900.0, 4950.0, 10.0, 50.0, 200.0];
    let base = ajustar_meta(5000.0, &mut s);
    assert!(cerca(base, 4900.0));
    let esperado = [0.0, 50.0, 110.0, 150.0, 300.0];
    for (valor, referencia) in s.iter().zip(esperado) {
        assert!(cerca(*valor, referencia), "{s:?}");
    }

    // Vuelta completa sobre una pista circular, empezando antes de la meta.
    let pista = pista_de(&ConstructorPista::circular(100.0, 360));
    let inicio = 90;
    let mut xs = Vec::new();
    let mut zs = Vec::new();
    for paso in 0..360 {
        let indice = (inicio + paso) % pista.puntos();
        xs.push(pista.nx[indice]);
        zs.push(pista.nz[indice]);
    }

    let serie = proyectar_serie(&pista, &xs, &zs);
    assert_eq!(serie.descartadas, 0);
    let mut s = serie.s.clone();
    ajustar_meta(pista.longitud_m, &mut s);

    assert!(cerca(s[0], 0.0), "arranca en {}", s[0]);
    assert!(
        s.windows(2).all(|ventana| ventana[1] >= ventana[0]),
        "s no monótona"
    );
    assert!(
        s[s.len() - 1] > 0.9 * pista.longitud_m,
        "cubre {} de {}",
        s[s.len() - 1],
        pista.longitud_m
    );
}

#[test]
fn t45_proyeccion_deficiente_deja_la_vuelta_no_analizable() {
    let pista = pista_de(&ConstructorPista::recta(51));

    let mut vuelta = Vuelta {
        id: VueltaId {
            auto: 0,
            numero_local: 0,
        },
        valida: true,
        seleccionable: true,
        muestras: Series {
            s: vec![0.0, 1.0, f64::NAN, 3.0, f64::NAN, 5.0, f64::NAN, 7.0, 8.0, 9.0],
            t_rel: (0..10).map(|i| i as f64 * 0.1).collect(),
            ..Series::default()
        },
        ..Vuelta::default()
    };

    let aviso = ajustar_vuelta(&pista, &mut vuelta, "vuelta.acreplay")
        .expect("debe emitir ProyeccionDeficiente");
    assert!(
        matches!(
            aviso.motivo,
            Motivo::ProyeccionDeficiente {
                descartadas: 3,
                total: 10
            }
        ),
        "{:?}",
        aviso.motivo
    );
    assert_eq!(vuelta.errores_proyeccion, 3);
    assert!(!vuelta.valida);
    assert!(!vuelta.seleccionable);
    assert_eq!(aviso.archivo, "vuelta.acreplay");

    // Una vuelta sin huecos sigue siendo válida y recalcula sus métricas.
    let mut buena = Vuelta {
        seleccionable: true,
        valida: true,
        muestras: Series {
            s: (0..10).map(|i| i as f64).collect(),
            t_rel: (0..10).map(|i| i as f64 * 0.1).collect(),
            ..Series::default()
        },
        ..Vuelta::default()
    };
    assert!(ajustar_vuelta(&pista, &mut buena, "vuelta.acreplay").is_none());
    assert_eq!(buena.errores_proyeccion, 0);
    assert!(buena.valida && buena.seleccionable);
    assert!(cerca(buena.tiempo_s, 0.9));
    assert!(cerca(buena.cobertura_s_m, 9.0));

    // La clasificación no revive una vuelta que la proyección descartó.
    let mut grupo = vec![vuelta, buena];
    clasificar_vueltas(&mut grupo);
    assert!(!grupo[0].valida);
    assert!(!grupo[0].seleccionable);
    assert!(grupo[1].valida, "la vuelta buena sigue siendo válida");
}

#[test]
fn t46_dos_trazadas_de_la_misma_curva_dan_la_misma_s() {
    let radio = 200.0f32;
    let puntos = 500usize;
    let pista = pista_de(&ConstructorPista::circular(radio, puntos));
    let desvio = 8.0f32;

    let mut xs_dentro = Vec::new();
    let mut zs_dentro = Vec::new();
    let mut xs_fuera = Vec::new();
    let mut zs_fuera = Vec::new();
    for k in 0..100 {
        let indice = k * 5;
        let angulo = std::f32::consts::TAU * indice as f32 / puntos as f32;
        let (seno, coseno) = angulo.sin_cos();
        xs_dentro.push((radio - desvio) * coseno);
        zs_dentro.push((radio - desvio) * seno);
        xs_fuera.push((radio + desvio) * coseno);
        zs_fuera.push((radio + desvio) * seno);
    }

    let dentro = proyectar_serie(&pista, &xs_dentro, &zs_dentro);
    let fuera = proyectar_serie(&pista, &xs_fuera, &zs_fuera);
    assert_eq!(dentro.descartadas, 0);
    assert_eq!(fuera.descartadas, 0);

    let paso = (pista.ns[1] - pista.ns[0]) as f64;
    for (valor_dentro, valor_fuera) in dentro.s.iter().zip(&fuera.s) {
        assert!(
            (valor_dentro - valor_fuera).abs() < paso,
            "dentro {valor_dentro} vs fuera {valor_fuera}"
        );
    }
}

#[test]
fn t47_trompo_y_salida_no_hacen_retroceder_s() {
    let pista = pista_de(&ConstructorPista::recta(51));
    let xs = [
        0.0f32, 10.0, 20.0, 30.0, 40.0, 30.0, 30.0, 20.0, 50.0, 60.0,
    ];
    let zs = [
        0.0f32, 0.0, 0.0, 0.0, 0.0, 100.0, 100.0, 0.0, 0.0, 0.0,
    ];

    let serie = proyectar_serie(&pista, &xs, &zs);
    assert_eq!(serie.descartadas, 2);
    assert!(serie.s[5].is_nan() && serie.s[6].is_nan());

    let mut s = serie.s.clone();
    ajustar_meta(pista.longitud_m, &mut s);
    let validos: Vec<f64> = s.iter().copied().filter(|valor| valor.is_finite()).collect();
    assert!(
        validos.windows(2).all(|ventana| ventana[1] >= ventana[0]),
        "{s:?}"
    );
    // La vuelta al asfalto detrás del último punto válido no retrocede.
    assert!(cerca(s[7], 40.0), "{s:?}");
}

#[test]
fn t48_cruce_de_meta_sin_saltos_mayores_a_media_pista() {
    let pista = pista_de(&ConstructorPista::circular(120.0, 360));
    let inicio = 300usize;

    let mut xs = Vec::new();
    let mut zs = Vec::new();
    for paso in 0..540 {
        let indice = (inicio + paso) % pista.puntos();
        xs.push(pista.nx[indice]);
        zs.push(pista.nz[indice]);
    }

    let serie = proyectar_serie(&pista, &xs, &zs);
    assert_eq!(serie.descartadas, 0);
    let mut s = serie.s.clone();
    ajustar_meta(pista.longitud_m, &mut s);

    let media_pista = pista.longitud_m / 2.0;
    assert!(cerca(s[0], 0.0));
    for ventana in s.windows(2) {
        assert!(ventana[1] >= ventana[0], "retroceso: {s:?}");
        assert!(
            ventana[1] - ventana[0] <= media_pista + 1e-9,
            "salto de {} m",
            ventana[1] - ventana[0]
        );
    }
}
