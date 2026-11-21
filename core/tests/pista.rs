mod soporte;

use acreplay_core::error::Motivo;
use acreplay_core::pista::{
    parsear_pista, BYTES_BLOQUE_ANCHOS, BYTES_PUNTO, PUNTOS_MAX, SEMIANCHO_POR_DEFECTO,
};
use soporte::pista::{ConstructorPista, PuntoFixture};

fn aproximadamente(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-3
}

#[test]
fn t23_cabecera_declara_la_cantidad_de_puntos() {
    let bytes = ConstructorPista::recta(5).bytes();
    let pista = parsear_pista(&bytes, "fast_lane.ai").expect("pista de 5 puntos");
    assert_eq!(pista.puntos(), 5);
    assert_eq!(pista.nx.len(), 5);
    assert_eq!(pista.ny.len(), 5);
    assert_eq!(pista.nz.len(), 5);
    assert_eq!(pista.ns.len(), 5);
    assert_eq!(pista.wl.len(), 5);
    assert_eq!(pista.wr.len(), 5);
}

#[test]
fn t24_puntos_se_leen_con_valores_exactos() {
    let mut constructor = ConstructorPista::default();
    constructor.puntos = vec![
        PuntoFixture::nuevo(0.0, 0.0, 0.0),
        PuntoFixture::nuevo(12.5, -4.5, 12.5),
        PuntoFixture::nuevo(25.0, 0.0, 25.0),
    ];
    constructor.puntos[1].y = 1.25;
    constructor.puntos[2].id = 99;

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    assert!(aproximadamente(pista.nx[1], 12.5));
    assert!(aproximadamente(pista.ny[1], 1.25));
    assert!(aproximadamente(pista.nz[1], -4.5));
    assert!(aproximadamente(pista.ns[1], 12.5));
    assert!(aproximadamente(pista.nx[2], 25.0));
    assert!(aproximadamente(pista.longitud_m as f32, 25.0));
}

#[test]
fn t25_semianchos_5_y_7_dan_ancho_6() {
    let constructor = ConstructorPista::recta(3).con_semianchos(5.0, 7.0);
    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();

    assert!(aproximadamente(pista.ancho_m(), 6.0));
    assert!(pista.wl.iter().all(|w| aproximadamente(*w, 6.0)));
    assert!(pista.wr.iter().all(|w| aproximadamente(*w, 6.0)));
}

#[test]
fn t25_mediana_par_promedia_los_dos_centrales() {
    let mut constructor = ConstructorPista::recta(4);
    for (indice, punto) in constructor.puntos.iter_mut().enumerate() {
        let semiancho = indice as f32 + 1.0;
        punto.semiancho_izq = Some(semiancho);
        punto.semiancho_der = Some(semiancho);
    }
    constructor.con_bloque_anchos = true;

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    // Sumas 2, 4, 6, 8: mediana verdadera 5 -> semiancho 2.5 (v1 daba 3).
    assert!(aproximadamente(pista.ancho_m(), 2.5));
}

#[test]
fn t25_punto_con_un_lado_invalido_no_cuenta() {
    let mut constructor = ConstructorPista::recta(3).con_semianchos(5.0, 7.0);
    constructor.puntos[0].semiancho_izq = Some(5.0);
    constructor.puntos[0].semiancho_der = Some(7.0);
    constructor.puntos[1].semiancho_izq = Some(0.0);
    constructor.puntos[1].semiancho_der = Some(20.0);
    constructor.puntos[2].semiancho_izq = Some(10.0);
    constructor.puntos[2].semiancho_der = Some(10.0);

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    // Sumas válidas 12 y 20 (el punto 1 se descarta) -> mediana 16 -> ancho 8.
    assert!(aproximadamente(pista.ancho_m(), 8.0));
}

#[test]
fn t26_sin_bloque_usa_semiancho_por_defecto() {
    let bytes = ConstructorPista::recta(5).bytes();
    let pista = parsear_pista(&bytes, "fast_lane.ai").unwrap();
    assert!(aproximadamente(pista.ancho_m(), SEMIANCHO_POR_DEFECTO));
}

#[test]
fn t26_bloque_con_anchos_invalidos_usa_el_defecto() {
    let mut constructor = ConstructorPista::recta(3);
    // Bloque presente pero todos los semianchos en NaN.
    constructor.con_bloque_anchos = true;
    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    assert!(aproximadamente(pista.ancho_m(), SEMIANCHO_POR_DEFECTO));
}

#[test]
fn t26_sobrantes_que_no_llenan_el_bloque_se_ignoran() {
    let mut constructor = ConstructorPista::recta(3);
    // Casi un bloque completo de anchos: no se interpreta y no invalida.
    constructor.relleno_final = 3 * BYTES_BLOQUE_ANCHOS - 1;
    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    assert_eq!(pista.puntos(), 3);
    assert!(aproximadamente(pista.ancho_m(), SEMIANCHO_POR_DEFECTO));
}

#[test]
fn t27_menos_de_tres_puntos_es_pista_invalida() {
    for cantidad in [0usize, 1, 2] {
        let error = parsear_pista(&ConstructorPista::recta(cantidad).bytes(), "fast_lane.ai")
            .unwrap_err();
        assert!(
            matches!(error.motivo, Motivo::PistaInvalida { .. }),
            "con {cantidad} puntos: {:?}",
            error.motivo
        );
    }
}

#[test]
fn t27_cantidad_fuera_de_rango_es_pista_invalida() {
    for declarado in [PUNTOS_MAX + 1, -1] {
        let mut constructor = ConstructorPista::recta(3);
        constructor.n_declarado = Some(declarado);
        let error = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap_err();
        assert!(matches!(error.motivo, Motivo::PistaInvalida { .. }));
        assert!(error.mensaje().contains("fast_lane.ai"));
    }
}

#[test]
fn t27_pista_truncada_es_archivo_truncado() {
    let bytes = ConstructorPista::recta(5).bytes();
    let cabecera = 16;

    // Corte dentro de la cabecera.
    let error = parsear_pista(&bytes[..8], "fast_lane.ai").unwrap_err();
    assert!(
        matches!(error.motivo, Motivo::ArchivoTruncado { .. }),
        "cabecera corta: {:?}",
        error.motivo
    );

    // Corte a mitad del cuarto punto.
    let corte = cabecera + BYTES_PUNTO * 3 + 8;
    let error = parsear_pista(&bytes[..corte], "fast_lane.ai").unwrap_err();
    assert!(
        matches!(error.motivo, Motivo::ArchivoTruncado { .. }),
        "puntos cortos: {:?}",
        error.motivo
    );
    assert!(error.mensaje().contains("fast_lane.ai"));
}

#[test]
fn t27_coordenadas_no_finitas_son_pista_invalida() {
    let mut constructor = ConstructorPista::recta(3);
    constructor.puntos[1].x = f32::NAN;
    let error = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap_err();
    match error.motivo {
        Motivo::PistaInvalida { detalle } => assert!(detalle.contains("punto 1"), "{detalle}"),
        otro => panic!("motivo inesperado: {otro:?}"),
    }
}

#[test]
fn t28_ns_no_monotono_se_recalcula() {
    let mut constructor = ConstructorPista::recta(5);
    constructor.puntos[3].ns = 5.0;

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    for (indice, valor) in pista.ns.iter().enumerate() {
        assert!(
            aproximadamente(*valor, indice as f32 * 10.0),
            "ns[{indice}] = {valor}"
        );
    }
    assert!(pista.longitud_m > 0.0);
    assert!(aproximadamente(pista.longitud_m as f32, 40.0));
}

#[test]
fn t28_ns_no_finito_se_recalcula() {
    let mut constructor = ConstructorPista::recta(4);
    constructor.puntos[0].ns = f32::NAN;

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    assert!(aproximadamente(pista.ns[0], 0.0));
    assert!(aproximadamente(pista.longitud_m as f32, 30.0));
}

#[test]
fn t28_ns_usable_se_conserva_tal_cual() {
    let mut constructor = ConstructorPista::recta(3);
    constructor.puntos[1].ns = 12.0;
    constructor.puntos[2].ns = 30.0;

    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();
    assert!(aproximadamente(pista.ns[1], 12.0));
    assert!(aproximadamente(pista.ns[2], 30.0));
    assert!(aproximadamente(pista.longitud_m as f32, 30.0));
}

#[test]
fn t29_fixture_circular_es_una_pista_valida() {
    let constructor = ConstructorPista::circular(50.0, 36);
    let pista = parsear_pista(&constructor.bytes(), "fast_lane.ai").unwrap();

    assert_eq!(pista.puntos(), 36);
    for indice in 0..pista.puntos() {
        let radio = (pista.nx[indice].powi(2) + pista.nz[indice].powi(2)).sqrt();
        assert!(aproximadamente(radio, 50.0), "radio[{indice}] = {radio}");
    }

    // El último punto no repite el primero: el arco termina un paso antes.
    let esperado = std::f32::consts::TAU * 50.0 * 35.0 / 36.0;
    assert!(aproximadamente(pista.longitud_m as f32, esperado));
}

#[test]
fn t30_validas_e_invalidas_en_una_sola_pasada() {
    let con_bloque = ConstructorPista::recta(4).con_semianchos(5.0, 7.0).bytes();
    let sin_bloque = ConstructorPista::recta(4).bytes();

    for bytes in [con_bloque, sin_bloque] {
        assert!(
            parsear_pista(&bytes, "fast_lane.ai").is_ok(),
            "el fixture válido debe parsear"
        );
    }

    let dos_puntos = ConstructorPista::recta(2).bytes();
    assert!(parsear_pista(&dos_puntos, "fast_lane.ai").is_err());

    let mut truncada = ConstructorPista::recta(4).bytes();
    truncada.truncate(4 + BYTES_PUNTO * 2);
    assert!(parsear_pista(&truncada, "fast_lane.ai").is_err());
}
